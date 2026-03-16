# 2025-03-10 Bank Statement Extractor Improvements

## Overview

Improvements to the bank statement extraction pipeline for better accuracy,
multi-page handling, and transaction validation.

## Architecture

```
OCR Text → Table Reconstruction → Page Split → AI Extraction (per page) → Validation → Totals
```

### Key Design Decisions

1. **Page-based AI extraction**: Each page is processed by a separate GPT-4o-mini call.
   First page extracts header + transactions; continuation pages extract only transactions
   with context from the first page (bank name, currency, previous transaction count).

2. **Table reconstruction from OCR coordinates**: OCR blocks are geometrically reconstructed
   into tab-separated rows using Y-coordinate clustering (ROW_TOL = 0.008). This preserves
   column alignment that raw OCR text loses, helping the AI correctly identify amount columns.

3. **Python-computed totals**: `total_debits` and `total_credits` are computed from validated
   transactions in Python, not from LLM output. This is more reliable than trusting LLM math.

4. **Transaction validation**: All AI-extracted transactions are validated:
   - Amount must be a valid number >= 0.01
   - Type must be "debit" or "credit" (defaults to "debit")
   - Amounts are rounded to 2 decimal places

## Files Changed

### `services/bank_statement_extractor.py`
- **BankStatementExtractor** class with page-based extraction strategy
- `_ai_extract_statement()`: Splits text into pages, processes each with AI
- `_split_into_pages()`: Splits by `--- Page N ---` markers, page-break patterns
  (Turkish/English/German), or form feeds
- `_ai_call_page()`: Per-page AI prompt with column-reading instructions
- `_reconstruct_table_text()`: Geometric table layout from OCR block coordinates
- `_validate_transactions()`: Post-AI validation of transaction data
- `_compute_totals()`: Python-side debit/credit summation

### `services/bank_statement_utils.py`
- Shared utilities: `safe_float`, `detect_currency_from_text`, `normalize_currency`
- `is_non_transaction()`: Filters out balance lines, summaries, headers
- `has_meaningful_description()`: Filters currency-only descriptions
- `NON_TX_PHRASES`: Multilingual non-transaction phrase list (TR/EN/DE)
- `MONTH_NAMES`: Multilingual month name mapping (TR/EN/DE/FR)
- `DATE_MONTH_RE`: Compiled regex for date parsing with month names

## AI Prompt Highlights

The bank statement AI prompt includes:
- **Column reading instructions**: AI identifies column headers first, then maps amounts
- **Installment handling**: Uses period amount (first number before 'x'), not total
- **Non-transaction filtering**: Skip balance lines, headers, footers, summaries
- **Multi-language support**: Turkish (Ekstre Sayfası), English (Page X of Y),
  German (Seite X von Y) page markers
- **Type inference**: SEPA-Credit Transfer/Überweisung = debit,
  Gutschrift/refund/iade/Eingang = credit

## Currency Normalization

Bank statement transactions are normalized to EUR for cross-currency reconciliation
using `exchange_rate_service.normalize_transaction()`. This runs after validation
and adds `normalized_amount`, `normalized_currency`, `exchange_rate_used` to each
transaction.

## Date Format Detection

Integrated with `date_format_service` for date swap support. Bank statements support
swapping dates in header fields (statement_date, period start/end, due_date) and all
transaction dates via `DocumentService.swap_document_dates()`.
