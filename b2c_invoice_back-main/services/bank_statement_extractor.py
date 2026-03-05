"""
Bank Statement Extractor - Hybrid Python + LLM extraction.

Strategy:
- Table layout reconstructed from OCR block coordinates (Python)
- Transactions parsed in Python (reliable column mapping)
- Header/summary fields extracted via GPT-4o-mini (flexible parsing)
- Totals computed from transactions (not from LLM — more reliable)
- Universal: works with any bank, any language, any country
"""

import os
import re
import json
import logging
from typing import Optional, Dict, Any, List, Tuple

from services.bank_statement_utils import (
    parse_date, parse_amount,
    is_skip_line, is_non_transaction, is_credit_description,
    safe_float, detect_currency_from_text, normalize_currency as _normalize_currency,
)

logger = logging.getLogger(__name__)


class BankStatementExtractor:
    """Hybrid Python + LLM bank statement extraction."""

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
        """Main entry: reconstruct table, parse transactions, LLM headers."""
        table_text, line_pos = _reconstruct_table_text(ocr_index, page_count)

        # Step 1: Parse transactions in Python (reliable)
        transactions = _parse_transactions(table_text, line_pos)

        # Fallback: parse from flat OCR text if table reconstruction empty
        if not transactions and ocr_text:
            transactions = _parse_from_flat_text(ocr_text)

        # Enrich with page/y positions from line metadata
        for tx in transactions:
            idx = tx.pop('_line_idx', None)
            if idx is not None and idx < len(line_pos):
                p, y0, y1 = line_pos[idx]
                if p >= 0:
                    tx['page'] = p
                    tx['y_min'] = round(y0, 4)
                    tx['y_max'] = round(y1, 4)

        logger.info(f"Python-parsed {len(transactions)} transactions")
        source_text = table_text or ocr_text
        header = self._llm_extract_headers(source_text)

        # Currency post-processing: if LLM returned null, try regex fallback
        llm_curr = header.get('currency')
        if not llm_curr:
            detected = detect_currency_from_text(source_text)
            if detected:
                header['currency'] = detected
                logger.info(f"Bank stmt currency fallback: {detected}")

        header['transactions'] = transactions
        _compute_totals(header, transactions)

        # Normalize transaction amounts to EUR for cross-currency matching
        try:
            from services.exchange_rate_service import normalize_transaction
            stmt_currency = header.get('currency')
            for tx in transactions:
                normalize_transaction(tx, stmt_currency)
        except Exception as e:
            logger.warning(f"Transaction normalization failed: {e}")

        return header

    def _llm_extract_headers(self, text: str) -> Dict[str, Any]:
        """Extract header/summary fields via GPT-4o-mini (generic)."""
        prompt = f"""Extract bank/credit card statement header information.
Do NOT extract individual transactions — only summary/header fields.

OCR TEXT:
{text[:12000]}

RESPOND WITH JSON ONLY:
{{
    "bank_name": "full bank name",
    "account_holder": "account holder name or null",
    "account_number": "IBAN, account number, or customer ID",
    "card_number": "masked card number or null",
    "statement_date": "YYYY-MM-DD (statement issue date)",
    "statement_period_start": "YYYY-MM-DD",
    "statement_period_end": "YYYY-MM-DD",
    "currency": "MUST be 3-letter ISO 4217 code (EUR, USD, GBP, TRY, CHF, etc). Convert symbols: €=EUR, $=USD, £=GBP, ₺=TRY, TL=TRY. Return null if uncertain. NEVER return symbols.",
    "opening_balance": number or null,
    "closing_balance": number or null,
    "minimum_payment": number or null,
    "due_date": "YYYY-MM-DD or null"
}}

RULES:
- opening_balance: previous period balance / önceki bakiye / Anfangssaldo
- closing_balance: current period balance / dönem borcu / Endsaldo
- All amounts as plain numbers (no currency symbols or separators)
- Dates in YYYY-MM-DD format
- Return null for fields not found in the document"""

        try:
            response = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                max_tokens=500,
                response_format={"type": "json_object"}
            )
            result = json.loads(response.choices[0].message.content)
            return _convert_header(result)
        except Exception as e:
            logger.error(f"Bank statement header LLM error: {e}")
            return empty_bank_statement_data()


# ------------------------------------------------------------------
# Python-based transaction parsing
# ------------------------------------------------------------------

def _detect_column_format(text: str) -> str:
    """Detect column format from header area."""
    header = '\n'.join(text.split('\n')[:30]).lower()
    if (('incoming' in header and 'outgoing' in header) or
            ('eingang' in header and 'ausgang' in header) or
            ('entrées' in header and 'sorties' in header)):
        return 'incoming_outgoing'
    return 'standard'


def _parse_transactions(table_text: str, line_pos: list = None) -> List[Dict[str, Any]]:
    """Parse transactions — dispatches to format-specific parser."""
    if not table_text:
        return []
    fmt = _detect_column_format(table_text)
    if fmt == 'incoming_outgoing':
        return _parse_incoming_outgoing(table_text)
    return _parse_standard(table_text)


def _parse_standard(table_text: str) -> List[Dict[str, Any]]:
    """Parse transactions from standard (Turkish/generic) table text."""
    transactions: List[Dict[str, Any]] = []
    current_date = None

    for line_idx, raw_line in enumerate(table_text.split('\n')):
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith('--- Page '):
            continue
        if is_skip_line(line):
            continue

        parts = line.split('\t')
        _, date_iso = parse_date(parts[0])
        if date_iso:
            current_date = date_iso
        if not current_date:
            continue

        tx = _extract_transaction_from_parts(parts, date_iso, current_date)
        if tx:
            tx['_line_idx'] = line_idx
            transactions.append(tx)

    return transactions


def _extract_transaction_from_parts(
    parts: List[str],
    line_date: Optional[str],
    current_date: str
) -> Optional[Dict[str, Any]]:
    """Extract a single transaction from tab-separated parts."""
    if len(parts) < 2:
        return None

    start_idx = 1 if line_date else 0
    desc_parts: List[str] = []
    amounts: List[Tuple[float, str]] = []

    for part in parts[start_idx:]:
        part = part.strip()
        if not part:
            continue

        # Skip installment info (e.g. "482,00x3=1.446,00 1.Taksit")
        if re.match(r'^[\d.,x=\s]+Taksit', part, re.IGNORECASE):
            continue
        if re.match(r'^\d+x[\d,.]+$', part):
            continue

        amt, sign = parse_amount(part)
        if amt is not None:
            amounts.append((amt, sign))
        else:
            desc_parts.append(part)

    description = ' '.join(desc_parts).strip()
    if not description or not amounts:
        return None

    if is_non_transaction(description):
        return None

    # Last amount = actual transaction amount
    amount, sign = amounts[-1]

    is_credit = (
        sign == '+' or
        is_credit_description(description)
    )

    return {
        'date': line_date or current_date,
        'description': description,
        'amount': amount,
        'type': 'credit' if is_credit else 'debit',
        'balance': None,
    }


def _parse_incoming_outgoing(table_text: str) -> List[Dict[str, Any]]:
    """Parse Wise-style: Incoming/Outgoing + Balance columns.

    Transactions may span 2 lines: amounts on line 1, date on line 2.
    First amount = transaction amount (last is balance).
    """
    transactions: List[Dict[str, Any]] = []
    pending: Optional[Dict[str, Any]] = None

    for line_idx, raw_line in enumerate(table_text.split('\n')):
        line = raw_line.strip()
        if not line or line.startswith('--- Page ') or is_skip_line(line):
            continue

        parts = line.split('\t')
        _, date_iso = parse_date(parts[0])

        # Collect description and amounts
        start_idx = 1 if date_iso else 0
        desc_parts: List[str] = []
        amounts: List[Tuple[float, str]] = []
        for part in parts[start_idx:]:
            part = part.strip()
            if not part:
                continue
            amt, sign = parse_amount(part)
            if amt is not None:
                amounts.append((amt, sign))
            else:
                desc_parts.append(part)

        description = ' '.join(desc_parts).strip()

        if amounts and description and not is_non_transaction(description):
            # Transaction line: has amounts + meaningful description
            amount, sign = amounts[0]  # First amount = tx amount
            if amount == 0:
                continue  # Skip zero-amount lines (headers/summaries)
            if pending and pending.get('date'):
                transactions.append(pending)
            # IO format: '-' = Outgoing (debit), else = Incoming (credit)
            is_credit = sign != '-'
            pending = {
                'date': date_iso,
                'description': description,
                'amount': amount,
                'type': 'credit' if is_credit else 'debit',
                'balance': amounts[-1][0] if len(amounts) > 1 else None,
                '_line_idx': line_idx,
            }
        elif date_iso and pending and not pending.get('date'):
            # Date-only line → completes the pending transaction
            pending['date'] = date_iso
            transactions.append(pending)
            pending = None
        elif date_iso and pending and pending.get('date'):
            # New date, pending already has date → emit pending
            transactions.append(pending)
            pending = None

    # Flush remaining
    if pending and pending.get('date'):
        transactions.append(pending)

    return transactions


# ------------------------------------------------------------------
# Flat text fallback (when ocr_index is unavailable)
# ------------------------------------------------------------------

def _parse_from_flat_text(ocr_text: str) -> List[Dict[str, Any]]:
    """Parse transactions from flat OCR text (no coordinate data).

    Scans lines for date patterns, then collects description + amount
    from subsequent tokens on the same or following lines.
    """
    transactions: List[Dict[str, Any]] = []
    current_date = None
    io_fmt = bool(re.search(
        r'incoming\s+outgoing|eingang\s+ausgang|entrées\s+sorties',
        ocr_text[:2000], re.IGNORECASE
    ))
    lines = ocr_text.split('\n')

    for line in lines:
        line = line.strip()
        if not line or is_skip_line(line):
            continue

        # Check if line starts with a date
        tokens = re.split(r'\s{2,}|\t', line)  # split on 2+ spaces or tab
        if not tokens:
            continue

        _, date_iso = parse_date(tokens[0].strip())
        if date_iso:
            current_date = date_iso

        if not current_date:
            continue

        # Try to find amount in the line
        desc_parts: List[str] = []
        amounts: List[Tuple[float, str]] = []
        start = 1 if date_iso else 0

        for token in tokens[start:]:
            token = token.strip()
            if not token:
                continue
            if re.match(r'^[\d.,x=\s]+Taksit', token, re.IGNORECASE):
                continue
            if re.match(r'^\d+x[\d,.]+$', token):
                continue
            amt, sign = parse_amount(token)
            if amt is not None:
                amounts.append((amt, sign))
            else:
                desc_parts.append(token)

        description = ' '.join(desc_parts).strip()
        if not description or not amounts:
            continue
        if is_non_transaction(description):
            continue

        amount, sign = amounts[0] if io_fmt else amounts[-1]
        if io_fmt:
            is_credit = sign != '-'
        else:
            is_credit = sign == '+' or is_credit_description(description)

        transactions.append({
            'date': date_iso or current_date,
            'description': description,
            'amount': amount,
            'type': 'credit' if is_credit else 'debit',
            'balance': None,
        })

    return transactions


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

        for row in rows:
            row.sort(key=lambda it: _bbox_x(it))
            texts = [it.get('text', '').strip() for it in row if it.get('text', '').strip()]
            if texts:
                result_lines.append('\t'.join(texts))
                ys = [v.get('y', 0) for it in row for v in it.get('bbox', [])]
                line_pos.append((page_num, min(ys) if ys else 0, max(ys) if ys else 0))

    return '\n'.join(result_lines), line_pos


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
    }
