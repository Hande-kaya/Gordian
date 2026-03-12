"""
Bank Statement Extractor - Page-based AI extraction.

Strategy:
- Table layout reconstructed from OCR block coordinates (Python)
- Text split into pages, each page processed by a separate AI call
- First page: header + transactions; continuation pages: transactions only
- Transactions validated in Python (amount/date/type)
- Totals computed from transactions (not from LLM — more reliable)
- Universal: works with any bank, any language, any country
"""

import os
import re
import json
import logging
from typing import Optional, Dict, Any, List, Tuple

from services.bank_statement_utils import (
    safe_float, detect_currency_from_text, normalize_currency as _normalize_currency,
)

logger = logging.getLogger(__name__)


class BankStatementExtractor:
    """Full AI bank statement extraction."""

    def __init__(self, openai_client=None):
        self._openai = openai_client

    @property
    def openai_client(self):
        if self._openai is None:
            from openai import OpenAI
            self._openai = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
        return self._openai

    def extract(
        self,
        ocr_text: str,
        ocr_index: Dict[str, List[Dict]],
        page_count: int
    ) -> Dict[str, Any]:
        """Main entry: reconstruct table, AI extract, validate, compute totals."""
        # 1. Table reconstruction (geometric — keeps column alignment for AI)
        table_text, line_pos = _reconstruct_table_text(ocr_index, page_count)
        source_text = table_text or ocr_text

        # 2. Page-based AI extraction
        try:
            result = self._ai_extract_statement(source_text, page_count)
        except Exception as e:
            logger.error(f"AI extraction failed: {e}")
            return empty_bank_statement_data()

        # 3. Build header
        header = _convert_header(result)

        # Currency fallback
        if not header.get('currency'):
            detected = detect_currency_from_text(source_text)
            if detected:
                header['currency'] = detected
                logger.info(f"Bank stmt currency fallback: {detected}")

        # 4. Validate and clean transactions (preserve position data)
        transactions = _validate_transactions(result.get('transactions', []))
        logger.info(f"AI extracted {len(transactions)} validated transactions")

        # 4b. Match transactions to line_pos for bounding box data
        _attach_line_positions(transactions, source_text, line_pos)

        # 5. Compute totals from validated transactions
        header['transactions'] = transactions
        _compute_totals(header, transactions)

        # 6. Currency normalization for reconciliation
        try:
            from services.exchange_rate_service import normalize_transaction
            stmt_currency = header.get('currency')
            for tx in transactions:
                normalize_transaction(tx, stmt_currency)
        except Exception as e:
            logger.warning(f"Transaction normalization failed: {e}")

        return header

    # ----------------------------------------------------------
    # Page-based AI extraction
    # ----------------------------------------------------------

    def _ai_extract_statement(self, text: str, page_count: int) -> Dict[str, Any]:
        """Extract header + transactions page-by-page, then merge."""
        pages = self._split_into_pages(text)
        logger.info(f"Split statement into {len(pages)} page(s) (doc page_count={page_count})")

        # First page: extract header + transactions
        result = self._ai_call_page(pages[0], page_num=1, total_pages=len(pages), context=None)

        # Subsequent pages: only transactions, with context from first page
        for i, page_text in enumerate(pages[1:], start=2):
            if not page_text.strip():
                continue
            page_result = self._ai_call_page(
                page_text, page_num=i, total_pages=len(pages),
                context={
                    'bank_name': result.get('bank_name'),
                    'currency': result.get('currency'),
                    'previous_transactions_count': len(result.get('transactions', [])),
                },
            )
            # Merge transactions
            result['transactions'] = result.get('transactions', []) + page_result.get('transactions', [])
            # Update closing_balance from last page if present
            if page_result.get('closing_balance') is not None:
                result['closing_balance'] = page_result['closing_balance']

        return result

    def _split_into_pages(self, text: str) -> List[str]:
        """Split text into pages using markers or page-break patterns."""
        # 1. Reconstructed text uses '--- Page N ---' markers
        marker_parts = re.split(r'---\s*Page\s+\d+\s*---', text)
        if len(marker_parts) > 1:
            return [p for p in marker_parts if p.strip()]

        # 2. Common page-break patterns in raw OCR text
        page_pattern = re.compile(
            r'(?:Ekstre\s+Sayfas[ıi]\s+\d+\s*/\s*\d+'   # Turkish: Ekstre Sayfası 1/4
            r'|Page\s+\d+\s+of\s+\d+'                     # English: Page 1 of 5
            r'|Seite\s+\d+\s+von\s+\d+'                   # German: Seite 1 von 3
            r'|\f)',                                        # Form feed
            re.IGNORECASE,
        )
        parts = page_pattern.split(text)
        if len(parts) > 1:
            return [p for p in parts if p.strip()]

        # 3. Fallback: single page
        return [text]

    def _ai_call_page(
        self, page_text: str, page_num: int, total_pages: int,
        context: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """AI call for a single page of the statement."""
        is_first = context is None

        if is_first:
            role_instruction = (
                "You are a bank statement parser. Extract ALL information from this OCR text.\n"
                f"This is page {page_num} of {total_pages}."
            )
            json_schema = """\
{{
  "bank_name": "string",
  "account_holder": "string or null",
  "account_number": "string or null",
  "card_number": "string or null",
  "statement_date": "YYYY-MM-DD or null",
  "statement_period_start": "YYYY-MM-DD or null",
  "statement_period_end": "YYYY-MM-DD or null",
  "currency": "EUR",
  "opening_balance": number or null,
  "closing_balance": number or null,
  "minimum_payment": number or null,
  "due_date": "YYYY-MM-DD or null",
  "transactions": [
    {{
      "date": "YYYY-MM-DD",
      "description": "full transaction description",
      "amount": 123.45,
      "type": "debit or credit",
      "vendor_name": "clean merchant name or null"
    }}
  ]
}}"""
        else:
            bank = context.get('bank_name', 'unknown')
            currency = context.get('currency', 'unknown')
            prev_count = context.get('previous_transactions_count', 0)
            role_instruction = (
                f"You are a bank statement parser. This is a CONTINUATION page ({page_num} of {total_pages}).\n"
                f"Bank: {bank}, Currency: {currency}. "
                f"Previous pages had {prev_count} transactions.\n"
                "Extract ALL transactions from this page — every single row. "
                "Do NOT repeat transactions from earlier pages. "
                "If unsure whether a transaction was on a previous page, include it."
            )
            json_schema = """\
{{
  "closing_balance": number or null,
  "transactions": [
    {{
      "date": "YYYY-MM-DD",
      "description": "full transaction description",
      "amount": 123.45,
      "type": "debit or credit",
      "vendor_name": "clean merchant name or null"
    }}
  ]
}}"""

        prompt = f"""{role_instruction}

READING THE TABLE STRUCTURE:
- First identify the column headers in the document (e.g., Date, Description,
  Amount, Debit, Credit, Incoming, Outgoing, Balance, Bonus, etc.)
- Column headers define which number is the transaction amount.
- IGNORE columns that are NOT the main transaction amount (e.g., Bonus points,
  loyalty rewards, miles, cashback percentages). Use ONLY the primary amount column.
- If amounts have signs: negative = money out (debit), positive = money in (credit).
- If separate Debit/Credit or Incoming/Outgoing columns exist: the column where
  the amount appears determines the type.
- Installment info like "482,00x3=1.446,00 1.Taksit": use ONLY the period
  amount (first number before 'x': 482.00), NOT the total installment amount.
- MULTI-COLUMN STATEMENTS: Some statements have separate Incoming/Outgoing (or
  Credit/Debit) columns PLUS a running balance column (often labeled "Amount",
  "Balance", "Saldo", "Bakiye"). The running balance shows the account balance
  AFTER each transaction — it is NOT the transaction amount. Use ONLY the
  Incoming/Outgoing/Credit/Debit column values as the real transaction amount.
  The running balance column typically has monotonically changing values.
- When a table row has empty cells (shown as missing tab-separated values),
  count the columns carefully using the header row to identify which column
  each value belongs to.
- Currency conversions (e.g. "Converted 317.01 GBP to 364.57 EUR") and
  fee charges (e.g. "Charges for: CARD-xxx") ARE real transactions — extract them.

RULES:
- Extract ONLY real transactions. SKIP: balance lines (old/new/opening/closing balance),
  column headers, page headers/footers, bank name repeats, disclaimers, summaries, totals.
- amounts: Use the EXACT numbers from the document. Never calculate or round.
- type: "SEPA-Credit Transfer"/"Überweisung" = debit (money going OUT).
  "Gutschrift"/"refund"/"iade"/"Eingang" = credit (money coming IN).
- vendor_name: Extract clean merchant/payee name. Strip SEPA, Lastschrift, IBAN, BIC,
  reference numbers, payment method labels.
- dates: Return as YYYY-MM-DD.
- currency: 3-letter ISO 4217 code (EUR, USD, TRY, GBP, CHF). Convert symbols.
- opening_balance: previous period balance / önceki bakiye / Anfangssaldo
- closing_balance: current period balance / dönem borcu / Endsaldo
- All amounts as plain numbers (no currency symbols or separators).
- Extract ALL transactions on this page — do not skip any.
- Read descriptions fully and accurately.
- Determine income vs outcome correctly from signs, column position, or context.

OCR TEXT:
{page_text}

RESPOND WITH JSON ONLY:
{json_schema}"""

        resp = self.openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=16000,
            response_format={"type": "json_object"},
        )
        parsed = json.loads(resp.choices[0].message.content)
        tx_count = len(parsed.get('transactions', []))
        logger.info(f"Page {page_num}/{total_pages}: extracted {tx_count} transactions")
        return parsed


# ------------------------------------------------------------------
# Transaction validation
# ------------------------------------------------------------------

def _validate_transactions(raw_txs: list) -> list:
    """Validate AI-extracted transactions."""
    validated = []
    for tx in raw_txs:
        if not isinstance(tx, dict):
            continue
        # Amount must be a valid number
        amt = tx.get('amount')
        if amt is None:
            continue
        try:
            amt = abs(float(amt))
        except (ValueError, TypeError):
            continue
        if amt < 0.01:
            continue

        # Type must be debit or credit
        tx_type = tx.get('type', 'debit')
        if tx_type not in ('debit', 'credit'):
            tx_type = 'debit'

        entry = {
            'date': tx.get('date'),
            'description': str(tx.get('description', '')).strip(),
            'amount': round(amt, 2),
            'type': tx_type,
            'vendor_name': tx.get('vendor_name'),
            'balance': None,
        }
        # Preserve position data if present
        if 'page' in tx:
            entry['page'] = tx['page']
        if 'y_min' in tx:
            entry['y_min'] = tx['y_min']
        if 'y_max' in tx:
            entry['y_max'] = tx['y_max']
        validated.append(entry)
    return validated


# ------------------------------------------------------------------
# Compute totals from transactions
# ------------------------------------------------------------------

def _compute_totals(header: Dict[str, Any], transactions: List[Dict[str, Any]]) -> None:
    """Compute total_debits/credits from parsed transactions."""
    if not transactions:
        return
    debit_sum = sum(t.get('amount', 0) for t in transactions if t.get('type') == 'debit')
    credit_sum = sum(t.get('amount', 0) for t in transactions if t.get('type') == 'credit')
    header['total_debits'] = round(debit_sum, 2)
    header['total_credits'] = round(credit_sum, 2)


# ------------------------------------------------------------------
# Table reconstruction from OCR coordinates
# ------------------------------------------------------------------

def _reconstruct_table_text(
    ocr_index: Dict[str, List[Dict]], page_count: int
) -> Tuple[str, List[Tuple[int, float, float]]]:
    """Reconstruct tabular layout from OCR block coordinates.

    Returns (text, line_positions) where line_positions[i] = (page, y_min, y_max).
    """
    items = ocr_index.get('lines', [])
    if not items:
        items = ocr_index.get('blocks', [])
    if not items:
        return '', []

    result_lines: List[str] = []
    line_pos: List[Tuple[int, float, float]] = []

    for page_num in range(page_count):
        page_items = [it for it in items if it.get('page', 0) == page_num]
        if not page_items:
            continue
        page_items.sort(key=lambda it: _bbox_y(it))

        rows: List[List[Dict]] = []
        cur_row: List[Dict] = []
        cur_y = -1.0
        ROW_TOL = 0.008

        for item in page_items:
            y = _bbox_y(item)
            if cur_y < 0 or abs(y - cur_y) <= ROW_TOL:
                cur_row.append(item)
                cur_y = y if cur_y < 0 else (cur_y + y) / 2
            else:
                if cur_row:
                    rows.append(cur_row)
                cur_row = [item]
                cur_y = y
        if cur_row:
            rows.append(cur_row)

        if result_lines:
            result_lines.append(f'--- Page {page_num + 1} ---')
            line_pos.append((-1, 0, 0))

        # Detect column positions from widest row (likely header) per page
        col_centers: list = []
        if rows:
            widest_row = max(rows, key=len)
            widest_row_sorted = sorted(widest_row, key=lambda it: _bbox_x(it))
            col_centers = [_bbox_x(it) for it in widest_row_sorted]

        for row in rows:
            row.sort(key=lambda it: _bbox_x(it))
            items_with_text = [(it, it.get('text', '').strip()) for it in row if it.get('text', '').strip()]
            if not items_with_text:
                continue

            if col_centers:
                # Place each item in nearest column slot
                slots = [''] * len(col_centers)
                for it, txt in items_with_text:
                    x = _bbox_x(it)
                    best_col = min(range(len(col_centers)), key=lambda c: abs(x - col_centers[c]))
                    slots[best_col] = (slots[best_col] + ' ' + txt).strip() if slots[best_col] else txt
                result_lines.append('\t'.join(slots))
            else:
                # Fallback: no column info, just join texts
                result_lines.append('\t'.join(txt for _, txt in items_with_text))

            ys = [v.get('y', 0) for it in row for v in it.get('bbox', [])]
            line_pos.append((page_num, min(ys) if ys else 0, max(ys) if ys else 0))

    return '\n'.join(result_lines), line_pos


def _attach_line_positions(
    transactions: List[Dict[str, Any]],
    source_text: str,
    line_pos: List[Tuple[int, float, float]],
) -> None:
    """Match validated transactions to reconstructed-table line positions.

    For each transaction, find the best matching line in source_text by checking
    if the transaction description (or date+amount) appears in that line.
    Attaches page, y_min, y_max to each transaction dict in-place.
    """
    if not line_pos or not source_text:
        return

    lines = source_text.split('\n')
    # line_pos and lines should be parallel lists
    if len(lines) != len(line_pos):
        return

    used = set()
    for tx in transactions:
        desc = (tx.get('description') or '').lower().strip()
        date = (tx.get('date') or '').strip()
        amt_str = str(tx.get('amount', ''))
        if not desc and not date:
            continue

        best_idx = -1
        best_score = 0

        for i, line_text in enumerate(lines):
            if i in used:
                continue
            page_num, y_min, y_max = line_pos[i]
            if page_num < 0:  # page separator marker
                continue

            lt = line_text.lower()
            score = 0

            # Check description words overlap
            if desc:
                desc_words = desc.split()
                matched_words = sum(1 for w in desc_words if w in lt)
                if desc_words:
                    score = matched_words / len(desc_words)

            # Boost if date found in line
            if date and date in line_text:
                score += 0.3

            # Boost if amount found in line
            if amt_str and amt_str in line_text:
                score += 0.2

            if score > best_score:
                best_score = score
                best_idx = i

        if best_idx >= 0 and best_score >= 0.3:
            used.add(best_idx)
            page_num, y_min, y_max = line_pos[best_idx]
            tx['page'] = page_num
            tx['y_min'] = y_min
            tx['y_max'] = y_max


def _bbox_y(item: Dict) -> float:
    bbox = item.get('bbox', [])
    return sum(v.get('y', 0) for v in bbox) / len(bbox) if bbox else 0.0


def _bbox_x(item: Dict) -> float:
    bbox = item.get('bbox', [])
    return sum(v.get('x', 0) for v in bbox) / len(bbox) if bbox else 0.0


# ------------------------------------------------------------------
# Header conversion helpers
# ------------------------------------------------------------------

def _convert_header(llm_result: Dict) -> Dict[str, Any]:
    """Convert LLM header result to standard format."""
    return {
        'bank_name': llm_result.get('bank_name'),
        'account_holder': llm_result.get('account_holder'),
        'account_number': llm_result.get('account_number'),
        'card_number': llm_result.get('card_number'),
        'statement_date': llm_result.get('statement_date'),
        'statement_period_start': llm_result.get('statement_period_start'),
        'statement_period_end': llm_result.get('statement_period_end'),
        'currency': _normalize_currency(llm_result.get('currency')),
        'opening_balance': safe_float(llm_result.get('opening_balance')),
        'closing_balance': safe_float(llm_result.get('closing_balance')),
        'total_debits': safe_float(llm_result.get('total_debits')),
        'total_credits': safe_float(llm_result.get('total_credits')),
        'minimum_payment': safe_float(llm_result.get('minimum_payment')),
        'due_date': llm_result.get('due_date'),
        'transactions': [],
        'entities_with_bounds': [],
    }


def empty_bank_statement_data() -> Dict[str, Any]:
    """Return empty bank statement extracted data structure."""
    return {
        'bank_name': None, 'account_holder': None,
        'account_number': None, 'card_number': None,
        'statement_date': None,
        'statement_period_start': None, 'statement_period_end': None,
        'currency': None,
        'opening_balance': None, 'closing_balance': None,
        'total_debits': None, 'total_credits': None,
        'minimum_payment': None, 'due_date': None,
        'transactions': [],
        'entities_with_bounds': [],
    }
