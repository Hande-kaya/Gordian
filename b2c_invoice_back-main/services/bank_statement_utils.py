"""
Bank Statement Utilities - Universal parsing helpers.

Date, amount, and text classification for international bank statements.
Supports: Turkish, English, German, French formats.
"""

import re
from typing import Optional, Tuple

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
# Skip patterns — section headers / non-transaction lines
# ------------------------------------------------------------------
SKIP_PATTERNS = [
    # Turkish
    'BONUS PROGRAM', 'PROGRAM DIŞI', 'HARCAMALARINIZ',
    'EKSTRE ÖZETİ', 'HESAP ÖZETİ', 'HESAP BİLGİLERİ',
    'İşlem Tarihi', 'İŞLEM TARİHİ', 'Dönem İçi İşlemler',
    'Kalan Borç', 'Bonus (TL)', 'Tutar (TL)', 'TUTAR (TL)',
    'WORLDPUAN', 'FAİZ ORAN', 'Devreden',
    # English
    'ACCOUNT SUMMARY', 'STATEMENT SUMMARY', 'Transaction Date',
    'TRANSACTION DATE', 'Opening Balance', 'Closing Balance',
    'Previous Balance', 'Amount Due', 'PAYMENT DUE',
    # German
    'KONTOAUSZUG', 'KONTOUMSÄTZE', 'Buchungstag',
    # Common
    '--- Page', 'Toplam', 'Total', 'TOTAL', 'Gesamt',
]

CATEGORY_HEADERS = [
    'RESTORAN', 'FAST FOOD', 'BENZİN İSTASYONU', 'SAĞLIK',
    'DİĞER', 'MARKET', 'GİYİM', 'EĞİTİM', 'ULAŞIM',
]

# Credit indicators (multilingual)
CREDIT_KEYWORDS = [
    'ÖDEMENİZ İÇİN', 'TEŞEKKÜR',
    'İADE',
    'PAYMENT RECEIVED', 'THANK YOU',
    'REFUND', 'REVERSAL', 'CREDIT',
    'GUTSCHRIFT', 'RÜCKERSTATTUNG',
    'REMBOURSEMENT',
]

# Non-transaction description phrases
NON_TX_PHRASES = [
    'ÖNCEKİ DÖNEM', 'EKSTRE ÖZETİ', 'HESAP ÖZETİ',
    'Önceki Bakiye', 'Dönem Harcamaları', 'Ödemeleriniz',
    'Ödemeler', 'Min. Ödeme', 'Önceki Hesap Bakiyesi',
    'Dönem içi Islemler', 'Dönem Borcunuz', 'Toplam Faiz',
    'Previous Balance', 'Statement Summary',
    'Opening Balance', 'Closing Balance',
]

# ------------------------------------------------------------------
# Compiled regex patterns
# ------------------------------------------------------------------
_MONTH_PATTERN = '|'.join(
    re.escape(m) for m in sorted(MONTH_NAMES.keys(), key=len, reverse=True)
)
DATE_MONTH_RE = re.compile(
    rf'^(\d{{1,2}})\s+({_MONTH_PATTERN})\s+(\d{{4}})',
    re.IGNORECASE
)
DATE_NUM_RE = re.compile(r'^(\d{2})[./\-](\d{2})[./\-](\d{4})$')
# ISO: YYYY-MM-DD
DATE_ISO_RE = re.compile(r'^(\d{4})-(\d{2})-(\d{2})$')

AMOUNT_TR_RE = re.compile(
    r'(\d{1,3}(?:\.\d{3})*,\d{2})\s*([+\-])?$'
)
AMOUNT_EN_RE = re.compile(
    r'([+\-])?\s*(\d{1,3}(?:,\d{3})*\.\d{2})\s*$'
)
AMOUNT_SPACE_RE = re.compile(
    r'([+\-])?\s*(\d{1,3}(?:\s\d{3})+[.,]\d{2})\s*([+\-])?$'
)
AMOUNT_PLAIN_RE = re.compile(
    r'([+\-])?\s*(\d+[.,]\d{2})\s*([+\-])?$'
)

# Currency symbols to strip
_CURRENCY_SUFFIX_RE = re.compile(
    r'\s*(TL|TRY|USD|EUR|GBP|CHF|₺|\$|€|£)\s*$'
)
_CURRENCY_PREFIX_RE = re.compile(
    r'^(TL|TRY|USD|EUR|GBP|CHF|₺|\$|€|£)\s*'
)
_CR_DR_RE = re.compile(r'\s*(CR|DR)\s*$', re.IGNORECASE)


# ------------------------------------------------------------------
# Date parsing (universal)
# ------------------------------------------------------------------

def parse_date(text: str) -> Tuple[Optional[str], Optional[str]]:
    """Parse date in various formats → (matched_str, 'YYYY-MM-DD')."""
    text = text.strip()

    # "05 Ocak 2026", "15 January 2024", "3 März 2025"
    m = DATE_MONTH_RE.match(text)
    if m:
        day = int(m.group(1))
        month = MONTH_NAMES.get(m.group(2).lower())
        year = int(m.group(3))
        if month and 1 <= day <= 31:
            return m.group(0), f"{year}-{month:02d}-{day:02d}"

    # DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY
    m = DATE_NUM_RE.match(text)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= month <= 12 and 1 <= day <= 31:
            return m.group(0), f"{year}-{month:02d}-{day:02d}"

    # YYYY-MM-DD (ISO)
    m = DATE_ISO_RE.match(text)
    if m:
        year, month, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= month <= 12 and 1 <= day <= 31:
            return m.group(0), f"{year}-{month:02d}-{day:02d}"

    return None, None


# ------------------------------------------------------------------
# Amount parsing (universal)
# ------------------------------------------------------------------

def parse_amount(text: str) -> Tuple[Optional[float], str]:
    """
    Parse amount in various international formats.
    Returns (value, sign) where sign is '+', '-', or ''.
    """
    text = text.strip()
    if not text:
        return None, ''

    # Remove currency symbols
    text = _CURRENCY_SUFFIX_RE.sub('', text).strip()
    text = _CURRENCY_PREFIX_RE.sub('', text).strip()
    if not text:
        return None, ''

    # Check for CR/DR suffix
    cr_dr_sign = ''
    cr_match = _CR_DR_RE.search(text)
    if cr_match:
        cr_dr_sign = '+' if cr_match.group(1).upper() == 'CR' else '-'
        text = text[:cr_match.start()].strip()

    # Space-separated first: "1 234,56" or "1 234.56" (must check before
    # Turkish/English which would only match the partial "234,56")
    m = AMOUNT_SPACE_RE.search(text)
    if m:
        prefix = m.group(1) or ''
        suffix = m.group(3) or ''
        cleaned = m.group(2).replace(' ', '').replace(',', '.')
        try:
            return float(cleaned), prefix or suffix or cr_dr_sign
        except ValueError:
            pass

    # English: "+1,234.56" or "1,234.56"
    m = AMOUNT_EN_RE.search(text)
    if m:
        prefix = m.group(1) or ''
        before = text[:m.start()].strip()
        if not before or re.match(r'^[\d.,x=\s]+$', before):
            cleaned = m.group(2).replace(',', '')
            try:
                return float(cleaned), prefix or cr_dr_sign
            except ValueError:
                pass

    # Turkish: "1.234,56" or "360,43+"
    m = AMOUNT_TR_RE.search(text)
    if m:
        suffix = m.group(2) or ''
        before = text[:m.start()].strip()
        if not before or re.match(r'^[\d.,x=\s]+$', before):
            cleaned = m.group(1).replace('.', '').replace(',', '.')
            try:
                return float(cleaned), suffix or cr_dr_sign
            except ValueError:
                pass

    # Plain: "1234.56" or "1234,56"
    m = AMOUNT_PLAIN_RE.search(text)
    if m:
        prefix = m.group(1) or ''
        suffix = m.group(3) or ''
        cleaned = m.group(2).replace(',', '.')
        try:
            val = float(cleaned)
            if val >= 0.01:
                return val, prefix or suffix or cr_dr_sign
        except ValueError:
            pass

    return None, ''


# ------------------------------------------------------------------
# Text classification
# ------------------------------------------------------------------

def is_skip_line(line: str) -> bool:
    """Check if line is a section header or non-data line."""
    upper = line.upper()
    for pattern in SKIP_PATTERNS:
        if pattern.upper() in upper:
            return True
    for cat in CATEGORY_HEADERS:
        if cat in upper:
            return True
    return False


def is_non_transaction(desc: str) -> bool:
    """Filter out non-transaction descriptions."""
    for s in NON_TX_PHRASES:
        if s in desc:
            return True
    if desc.count('TL') >= 3 or desc.count('USD') >= 3:
        return True
    if re.match(r'^\d{4}\*+\d{3,4}\s', desc):
        return True
    if re.match(r'^[\d\s.,]+$', desc):
        return True
    return False


def is_credit_description(desc: str) -> bool:
    """Check if description indicates a credit transaction."""
    upper = desc.upper()
    for keyword in CREDIT_KEYWORDS:
        if keyword in upper:
            return True
    return False


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
    """Detect currency from symbols/codes near amounts in OCR text.

    Conservative logic:
    - Non-TRY currency only if it's the SOLE currency found (no TRY indicators)
    - If both TRY and foreign currency present → None (ambiguous, trust LLM)
    - Multiple foreign currencies → None (ambiguous)
    """
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

    # Clear non-TRY: exactly one foreign currency, zero TRY indicators
    if len(non_try) == 1 and not has_try:
        return non_try.pop()

    # TRY present → keep TRY
    if has_try:
        return 'TRY'

    # Multiple foreign currencies without TRY → ambiguous
    return None


# Currency symbol/abbreviation → ISO 4217 mapping
_CURRENCY_NORMALIZE_MAP = {
    '€': 'EUR', '$': 'USD', '£': 'GBP', '₺': 'TRY', '¥': 'JPY', '₣': 'CHF',
    'TL': 'TRY', 'SF': 'CHF', 'FR': 'CHF',
}


def normalize_currency(raw) -> Optional[str]:
    """Convert currency symbol/abbreviation to 3-letter ISO 4217 code.
    Returns None if input is empty or unrecognized.
    """
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
