"""
Date Format Detection & Swap Service.

Detects whether dates in a document use DD/MM (European) or MM/DD (American)
format, and provides swap functionality for manual correction.

Detection priority:
1. Unambiguous check: any component >12 must be the day
2. Currency heuristic: USD → MM/DD, others → DD/MM
3. Default: DD/MM (European)
"""

import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Currencies that default to MM/DD (American) format
CURRENCY_FORMAT_MAP = {'USD': 'mdy'}

# Month names (multilingual) for detecting text-based months
_TEXT_MONTH_RE = re.compile(
    r'(?:january|february|march|april|may|june|july|august|september|october|november|december'
    r'|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec'
    r'|ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık'
    r'|januar|februar|märz|mai|juni|juli|oktober|dezember'
    r'|janvier|février|mars|avril|juin|juillet|août|septembre|octobre|novembre|décembre)',
    re.IGNORECASE,
)

# Numeric date pattern: XX/YY/ZZZZ or XX.YY.ZZZZ or XX-YY-ZZZZ
_NUMERIC_DATE_RE = re.compile(r'^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})$')

# ISO date pattern: YYYY-MM-DD
_ISO_DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')


def detect_date_format(
    date_entries: list[tuple[str, str]],
    currency: Optional[str] = None,
) -> dict:
    """Detect whether dates use DMY or MDY format.

    Args:
        date_entries: list of (field_name, raw_date_string) pairs.
        currency: ISO 4217 currency code (e.g. 'USD', 'EUR').

    Returns:
        {assumed: 'dmy'|'mdy', source: 'unambiguous'|'currency'|'default'}
    """
    has_dmy_evidence = False
    has_mdy_evidence = False

    for _field, raw in date_entries:
        if not raw or not isinstance(raw, str):
            continue

        raw = raw.strip()

        # Skip text-month dates (already unambiguous)
        if _TEXT_MONTH_RE.search(raw):
            continue

        # Skip ISO dates
        if _ISO_DATE_RE.match(raw):
            continue

        m = _NUMERIC_DATE_RE.match(raw)
        if not m:
            continue

        first, second = int(m.group(1)), int(m.group(2))

        # If first > 12, it must be day → DD/MM (DMY)
        if first > 12 and 1 <= second <= 12:
            has_dmy_evidence = True
        # If second > 12, it must be day → MM/DD (MDY)
        elif second > 12 and 1 <= first <= 12:
            has_mdy_evidence = True

    # 1) Unambiguous evidence
    if has_dmy_evidence and not has_mdy_evidence:
        return {'assumed': 'dmy', 'source': 'unambiguous'}
    if has_mdy_evidence and not has_dmy_evidence:
        return {'assumed': 'mdy', 'source': 'unambiguous'}

    # 2) Currency heuristic
    if currency and CURRENCY_FORMAT_MAP.get(currency) == 'mdy':
        return {'assumed': 'mdy', 'source': 'currency'}

    # 3) Default: DMY (European)
    return {'assumed': 'dmy', 'source': 'default'}


def parse_date_with_format(raw: str, fmt: str) -> Optional[str]:
    """Parse a raw date string to YYYY-MM-DD using the given format assumption.

    Args:
        raw: raw date string (e.g. '03/09/2026', '15 March 2024', '2026-03-09')
        fmt: 'dmy' or 'mdy'

    Returns:
        ISO date string 'YYYY-MM-DD' or None if invalid.
    """
    if not raw or not isinstance(raw, str):
        return None

    raw = raw.strip()

    # Already ISO → pass through
    if _ISO_DATE_RE.match(raw):
        return raw if _is_valid_date(raw) else None

    # Text month → unambiguous, parse directly
    if _TEXT_MONTH_RE.search(raw):
        return _parse_text_month_date(raw)

    # Numeric: XX/YY/ZZZZ
    m = _NUMERIC_DATE_RE.match(raw)
    if not m:
        return None

    first, second, year = int(m.group(1)), int(m.group(2)), int(m.group(3))

    if fmt == 'mdy':
        month, day = first, second
    else:  # dmy
        day, month = first, second

    if not (1 <= month <= 12 and 1 <= day <= 31 and 1900 <= year <= 2100):
        return None

    iso = f"{year}-{month:02d}-{day:02d}"
    return iso if _is_valid_date(iso) else None


def swap_date(iso_date: str) -> Optional[str]:
    """Swap month and day in a YYYY-MM-DD date.

    Only works when both month and day are <=12 (ambiguous dates).
    Returns None if swap would produce an invalid date.
    """
    if not iso_date or not isinstance(iso_date, str):
        return None

    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})$', iso_date)
    if not m:
        return None

    year, month, day = int(m.group(1)), int(m.group(2)), int(m.group(3))

    # Only swap if both are <=12 (ambiguous)
    if month > 12 or day > 12:
        return None

    # Swap
    new_month, new_day = day, month

    if not (1 <= new_month <= 12 and 1 <= new_day <= 31):
        return None

    swapped = f"{year}-{new_month:02d}-{new_day:02d}"
    return swapped if _is_valid_date(swapped) else None


def _is_valid_date(iso: str) -> bool:
    """Check if YYYY-MM-DD is a valid calendar date."""
    try:
        from datetime import date
        parts = iso.split('-')
        date(int(parts[0]), int(parts[1]), int(parts[2]))
        return True
    except (ValueError, IndexError):
        return False


def _parse_text_month_date(raw: str) -> Optional[str]:
    """Parse dates with text month names (e.g. '15 March 2024', '3 März 2025')."""
    from services.bank_statement_utils import MONTH_NAMES, DATE_MONTH_RE

    m = DATE_MONTH_RE.match(raw)
    if m:
        day = int(m.group(1))
        month = MONTH_NAMES.get(m.group(2).lower())
        year = int(m.group(3))
        if month and 1 <= day <= 31:
            iso = f"{year}-{month:02d}-{day:02d}"
            return iso if _is_valid_date(iso) else None

    return None
