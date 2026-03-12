"""
Bank Statement Utilities - Shared helpers.

Currency detection, normalization, and text classification helpers
used by bank_statement_extractor, llm_extraction_service,
excel_extraction_service, reconciliation_service, and date_format_service.
"""

import re
from typing import Optional

# ------------------------------------------------------------------
# Month names → month number (multilingual)
# ------------------------------------------------------------------
MONTH_NAMES = {
    # Turkish
    'ocak': 1, 'şubat': 2, 'mart': 3, 'nisan': 4,
    'mayıs': 5, 'haziran': 6, 'temmuz': 7, 'ağustos': 8,
    'eylül': 9, 'ekim': 10, 'kasım': 11, 'aralık': 12,
    # English
    'january': 1, 'february': 2, 'march': 3, 'april': 4,
    'may': 5, 'june': 6, 'july': 7, 'august': 8,
    'september': 9, 'october': 10, 'november': 11, 'december': 12,
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4,
    'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 'sept': 9,
    'oct': 10, 'nov': 11, 'dec': 12,
    # German
    'januar': 1, 'februar': 2, 'märz': 3, 'mai': 5,
    'juni': 6, 'juli': 7, 'oktober': 10, 'dezember': 12,
    # French
    'janvier': 1, 'février': 2, 'mars': 3, 'avril': 4,
    'juin': 6, 'juillet': 7, 'août': 8, 'septembre': 9,
    'octobre': 10, 'novembre': 11, 'décembre': 12,
}

# ------------------------------------------------------------------
# Compiled regex patterns (used by date_format_service)
# ------------------------------------------------------------------
_MONTH_PATTERN = '|'.join(
    re.escape(m) for m in sorted(MONTH_NAMES.keys(), key=len, reverse=True)
)
DATE_MONTH_RE = re.compile(
    rf'^(\d{{1,2}})\s+({_MONTH_PATTERN})\s+(\d{{4}})',
    re.IGNORECASE
)


# ------------------------------------------------------------------
# Text classification (used by reconciliation_service)
# ------------------------------------------------------------------

# Non-transaction description phrases
NON_TX_PHRASES = [
    'ÖNCEKİ DÖNEM', 'EKSTRE ÖZETİ', 'HESAP ÖZETİ',
    'Önceki Bakiye', 'Dönem Harcamaları', 'Ödemeleriniz',
    'Ödemeler', 'Min. Ödeme', 'Önceki Hesap Bakiyesi',
    'Dönem içi Islemler', 'Dönem Borcunuz', 'Toplam Faiz',
    'Previous Balance', 'Statement Summary',
    'Opening Balance', 'Closing Balance',
    'Old balance', 'New balance',
    'Balance brought forward', 'Balance carried forward',
    'Alter Kontostand', 'Neuer Kontostand',
    'Anfangssaldo', 'Endsaldo',
    'Booked transactions', 'Posted transactions',
    'Gebuchte Umsätze',
    'Booking date', 'Value date', 'Wertstellung',
    'Debit Credit', 'Customer number',
    'Created on', 'Transactions pending',
]

_CURRENCY_ONLY_RE = re.compile(
    r'^[\d\s.,+\-:/*]*'
    r'(?:EUR|USD|GBP|TRY|CHF|TL|€|\$|£|₺)?'
    r'[\d\s.,+\-:/*]*$',
    re.IGNORECASE,
)


def is_non_transaction(desc: str) -> bool:
    """Filter out non-transaction descriptions using exact phrase matching only."""
    desc_upper = desc.strip().upper()
    for s in NON_TX_PHRASES:
        if s.upper() in desc_upper:
            return True
    # Pure numeric/currency-only descriptions
    if re.match(r'^[\d\s.,]+$', desc):
        return True
    return False


def has_meaningful_description(desc: str) -> bool:
    """Check if description has real text beyond currency codes/numbers.

    Returns False for descriptions like 'EUR', '4.806,56 EUR', '+', etc.
    """
    if not desc or not desc.strip():
        return False
    return not _CURRENCY_ONLY_RE.fullmatch(desc.strip())


# ------------------------------------------------------------------
# Amount helpers (used by excel_extraction_service)
# ------------------------------------------------------------------

def safe_float(value) -> Optional[float]:
    """Parse amount string/number to float (for LLM output)."""
    if value is None:
        return None
    try:
        if isinstance(value, (int, float)):
            return float(value)
        cleaned = str(value).replace(' ', '')
        if ',' in cleaned and '.' in cleaned:
            if cleaned.index('.') < cleaned.index(','):
                cleaned = cleaned.replace('.', '').replace(',', '.')
            else:
                cleaned = cleaned.replace(',', '')
        elif ',' in cleaned:
            cleaned = cleaned.replace(',', '.')
        return float(cleaned)
    except (ValueError, TypeError):
        return None


# ------------------------------------------------------------------
# Currency detection from OCR text (shared by invoice + bank stmt)
# ------------------------------------------------------------------

# Symbol must be adjacent to a digit (max 2 chars gap)
_SYMBOL_PATTERNS = [
    (re.compile(r'[$]\s{0,2}\d'), 'USD'),
    (re.compile(r'\d\s{0,2}[$]'), 'USD'),
    (re.compile(r'[€]\s{0,2}\d'), 'EUR'),
    (re.compile(r'\d\s{0,2}[€]'), 'EUR'),
    (re.compile(r'[£]\s{0,2}\d'), 'GBP'),
    (re.compile(r'\d\s{0,2}[£]'), 'GBP'),
    (re.compile(r'[₺]\s{0,2}\d'), 'TRY'),
    (re.compile(r'\d\s{0,2}[₺]'), 'TRY'),
]

# Text-based currency codes (word boundary)
_TEXT_PATTERNS = [
    (re.compile(r'\bUSD\b', re.IGNORECASE), 'USD'),
    (re.compile(r'\bEUR(?:O)?\b', re.IGNORECASE), 'EUR'),
    (re.compile(r'\bGBP\b', re.IGNORECASE), 'GBP'),
    (re.compile(r'\bCHF\b', re.IGNORECASE), 'CHF'),
    (re.compile(r'\bTL\b'), 'TRY'),
]


def detect_currency_from_text(text: str) -> Optional[str]:
    """Detect currency from symbols/codes near amounts in OCR text."""
    found: set[str] = set()
    for pat, code in _SYMBOL_PATTERNS:
        if pat.search(text):
            found.add(code)
    for pat, code in _TEXT_PATTERNS:
        if pat.search(text):
            found.add(code)

    if not found:
        return None

    non_try = found - {'TRY'}
    has_try = 'TRY' in found

    if len(non_try) == 1 and not has_try:
        return non_try.pop()

    if has_try:
        return 'TRY'

    return None


# Currency symbol/abbreviation → ISO 4217 mapping
_CURRENCY_NORMALIZE_MAP = {
    '€': 'EUR', '$': 'USD', '£': 'GBP', '₺': 'TRY', '¥': 'JPY', '₣': 'CHF',
    'TL': 'TRY', 'SF': 'CHF', 'FR': 'CHF',
}


def normalize_currency(raw) -> Optional[str]:
    """Convert currency symbol/abbreviation to 3-letter ISO 4217 code."""
    if not raw:
        return None
    s = str(raw).strip()
    if not s:
        return None
    mapped = _CURRENCY_NORMALIZE_MAP.get(s)
    if mapped:
        return mapped
    upper = s.upper()
    if len(upper) == 3 and upper.isalpha():
        return upper
    return _CURRENCY_NORMALIZE_MAP.get(upper) or None
