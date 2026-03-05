"""
Reconciliation Scoring Engine — pure scoring functions, no DB access.

Optimized for bank-statement ↔ invoice/receipt matching.
Amount is king (strongest signal), date confirms, description helps.
Dynamic weight normalization when data is missing.
"""

import re
import math
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Union

# --- Config ---
# Amount is king: exact amount match is the strongest signal in bank reconciliation.
# Date is secondary confirmation. Description is nice-to-have but noisy.

DEFAULT_WEIGHTS = {
    'amount': 0.60,
    'date': 0.22,
    'description': 0.18,
}

MATCH_MIN = 0.90
HIGH_CONFIDENCE = 0.75
MEDIUM_CONFIDENCE = 0.50

# --- Multi-language character normalization (TR + DE + FR + common EU) ---

_CHAR_MAP = str.maketrans({
    # Turkish
    'ğ': 'g', 'Ğ': 'G',
    'ş': 's', 'Ş': 'S',
    'ı': 'i', 'İ': 'I',
    'ç': 'c', 'Ç': 'C',
    # German
    'ä': 'a', 'Ä': 'A',
    'ß': 'ss',
    # Shared TR/DE (ö, ü)
    'ö': 'o', 'Ö': 'O',
    'ü': 'u', 'Ü': 'U',
    # French / general EU
    'à': 'a', 'â': 'a', 'á': 'a', 'ã': 'a',
    'è': 'e', 'ê': 'e', 'é': 'e', 'ë': 'e',
    'ì': 'i', 'î': 'i', 'í': 'i', 'ï': 'i',
    'ò': 'o', 'ô': 'o', 'ó': 'o', 'õ': 'o',
    'ù': 'u', 'û': 'u', 'ú': 'u',
    'ñ': 'n', 'Ñ': 'N',
    'ý': 'y', 'ÿ': 'y',
    'ð': 'd', 'þ': 'th',
    'æ': 'ae', 'Æ': 'AE',
    'ø': 'o', 'Ø': 'O',
    'å': 'a', 'Å': 'A',
})

_PUNCT_RE = re.compile(r'[^a-z0-9\s]')

# Month names: Turkish, German, English
_MONTH_NAMES = {
    # Turkish
    'ocak': 1, 'şubat': 2, 'mart': 3, 'nisan': 4,
    'mayıs': 5, 'haziran': 6, 'temmuz': 7, 'ağustos': 8,
    'eylül': 9, 'ekim': 10, 'kasım': 11, 'aralık': 12,
    # German
    'januar': 1, 'februar': 2, 'märz': 3, 'marz': 3,
    'april': 4, 'mai': 5, 'juni': 6, 'juli': 7,
    'august': 8, 'september': 9, 'oktober': 10,
    'november': 11, 'dezember': 12,
    # English
    'january': 1, 'february': 2, 'march': 3,
    'may': 5, 'june': 6, 'july': 7,
    'october': 10, 'december': 12,
    # Short forms (DE + EN)
    'jan': 1, 'feb': 2, 'mär': 3, 'mar': 3, 'apr': 4,
    'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 'okt': 10,
    'oct': 10, 'nov': 11, 'dez': 12, 'dec': 12,
}

_MONTH_RE = re.compile(
    r'(\d{1,2})[\s.]+('
    + '|'.join(_MONTH_NAMES.keys())
    + r')[\s.]+(\d{4})',
    re.IGNORECASE,
)


def normalize_text(text: str) -> str:
    """Lowercase, strip diacritics (TR/DE/FR/EU) and punctuation."""
    t = text.lower().translate(_CHAR_MAP)
    return _PUNCT_RE.sub('', t).strip()


# --- Bank description preprocessing ---
# Turkish/international bank descriptions have noisy prefixes.
# "POS - MIGROS 1234" → we only care about "MIGROS 1234"

_BANK_PREFIXES = re.compile(
    r'^(?:'
    r'(?:KART\s*[IİĐ][SŞ]LEM[IİĐ])|'       # KART İŞLEMİ
    r'POS\s*[-/:]?\s*|'                         # POS / POS -
    r'HAVALE\s*[-/:]?\s*(?:G[OÖ]NDER[IİĐ]M\s*[-/:]?\s*)?|'  # HAVALE GÖNDERİM
    r'EFT\s*[-/:]?\s*(?:G[OÖ]NDER[IİĐ]M\s*[-/:]?\s*)?|'     # EFT GÖNDERİM
    r'VIRMAN\s*[-/:]?\s*|'                      # VIRMAN
    r'FATURA\s*[OÖ]DEME\s*[-/:]?\s*|'          # FATURA ÖDEME
    r'OTOMATİK\s*[OÖ]DEME\s*[-/:]?\s*|'        # OTOMATİK ÖDEME
    r'VISA\s*[-/:]?\s*|'                        # VISA
    r'MASTERCARD\s*[-/:]?\s*|'                  # MASTERCARD
    r'MAESTRO\s*[-/:]?\s*|'                     # MAESTRO
    r'SEPA\s*[-/:]?\s*|'                        # SEPA (EU)
    r'[ÜU]BERWEISUNG\s*[-/:]?\s*|'             # Überweisung (DE)
    r'LASTSCHRIFT\s*[-/:]?\s*|'                 # Lastschrift (DE)
    r'VIREMENT\s*[-/:]?\s*|'                    # Virement (FR)
    r'DIRECT\s*DEBIT\s*[-/:]?\s*|'             # Direct Debit (EN)
    r'BANK\s*TRANSFER\s*[-/:]?\s*|'            # Bank Transfer (EN)
    r'PAYMENT\s*(?:TO)?\s*[-/:]?\s*'           # Payment / Payment to
    r')',
    re.IGNORECASE,
)

# Trailing noise: reference numbers, dates, terminal IDs
_BANK_SUFFIXES = re.compile(
    r'(?:'
    r'\s+\d{6,}$|'         # long numbers at end (ref/terminal ID)
    r'\s+\d{2}[./]\d{2}[./]\d{2,4}$'  # trailing date
    r')',
)


def clean_bank_description(raw: str) -> str:
    """
    Strip bank-specific prefixes/suffixes, return core payee/description.
    "KART İŞLEMİ - ŞÖLEN MARKET 123456" → "ŞÖLEN MARKET"
    """
    if not raw:
        return ''
    s = raw.strip()
    # Strip prefix
    s = _BANK_PREFIXES.sub('', s).strip()
    # Strip leading dash/colon leftover
    s = re.sub(r'^[-/:]\s*', '', s).strip()
    # Strip trailing reference numbers
    s = _BANK_SUFFIXES.sub('', s).strip()
    return s


def levenshtein_similarity(a: str, b: str) -> float:
    """Edit-distance ratio (single-row DP). Returns 0.0-1.0."""
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0

    la, lb = len(a), len(b)
    prev = list(range(lb + 1))

    for i in range(1, la + 1):
        curr = [i] + [0] * lb
        for j in range(1, lb + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            curr[j] = min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
        prev = curr

    dist = prev[lb]
    return 1.0 - dist / max(la, lb)


# --- Dimension scorers ---

def _score_single_amount(tx_amount: float, doc_amount: float) -> float:
    """Percentage-tier for one pair of amounts."""
    if tx_amount <= 0 or doc_amount <= 0:
        return 0.0

    pct = abs(tx_amount - doc_amount) / max(tx_amount, doc_amount)

    # Kuruş kuruş eşleşme — neredeyse kesin
    if pct <= 0.005:
        return 1.0
    # Yuvarlama farkı (~kuruş)
    if pct <= 0.02:
        return 0.95
    # Küçük fark (komisyon, kur farkı olabilir)
    if pct <= 0.05:
        return 0.80
    if pct <= 0.10:
        return 0.50
    if pct <= 0.20:
        return 0.25
    # %20+ → hızlı düşüş
    return max(0.0, 0.25 * math.exp(-4.0 * (pct - 0.20)))


def score_amount(
    tx_amount: float,
    doc_amounts: Union[float, List[float]],
) -> float:
    """
    Try all candidate doc amounts, return best match.

    doc_amounts can be a single float or a list (e.g. [total, net]).
    Bank may pay total (KDV dahil) or net (KDV hariç).
    """
    if isinstance(doc_amounts, (int, float)):
        return _score_single_amount(tx_amount, float(doc_amounts))

    best = 0.0
    for da in doc_amounts:
        if da and da > 0:
            best = max(best, _score_single_amount(tx_amount, float(da)))
    return best


def parse_date(raw: Optional[str]) -> Optional[datetime]:
    """Parse YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY, or month-name dates (TR/DE/EN)."""
    if not raw or not raw.strip():
        return None

    s = raw.strip()

    # ISO: YYYY-MM-DD
    try:
        return datetime.strptime(s[:10], '%Y-%m-%d')
    except ValueError:
        pass

    # DD.MM.YYYY
    try:
        return datetime.strptime(s[:10], '%d.%m.%Y')
    except ValueError:
        pass

    # DD/MM/YYYY
    try:
        return datetime.strptime(s[:10], '%d/%m/%Y')
    except ValueError:
        pass

    # Month name: "05 Ocak 2026", "15. März 2026", "3 January 2026"
    m = _MONTH_RE.search(s.lower())
    if m:
        day, month_name, year = int(m.group(1)), m.group(2), int(m.group(3))
        month_num = _MONTH_NAMES.get(month_name.lower())
        if month_num:
            try:
                return datetime(year, month_num, day)
            except ValueError:
                pass

    return None


def score_date(tx_date: Optional[str], doc_date: Optional[str]) -> float:
    """Day-diff tiers. Returns -1.0 if either date missing."""
    d1 = parse_date(tx_date)
    d2 = parse_date(doc_date)
    if d1 is None or d2 is None:
        return -1.0

    diff = abs((d1 - d2).days)
    if diff <= 7:
        return 1.0
    if diff <= 14:
        return 0.9
    if diff <= 30:
        return 0.7
    if diff <= 60:
        return 0.5
    if diff <= 90:
        return 0.3
    return 0.1


def score_description(
    tx_desc: Optional[str],
    vendor_name: Optional[str] = None,
    filename: Optional[str] = None,
) -> float:
    """
    3-layer: exact → substring → word overlap → Levenshtein.
    Returns -1.0 if no data on either side.
    Tries both raw tx_desc AND cleaned (bank prefix stripped) version.
    """
    if not tx_desc or not tx_desc.strip():
        return -1.0

    targets = []
    if vendor_name and vendor_name.strip():
        targets.append(vendor_name.strip())
    if filename and filename.strip():
        targets.append(filename.strip())

    if not targets:
        return -1.0

    # Try both raw and cleaned bank description
    raw_norm = normalize_text(tx_desc)
    cleaned = clean_bank_description(tx_desc)
    cleaned_norm = normalize_text(cleaned) if cleaned else ''

    tx_variants = [v for v in [raw_norm, cleaned_norm] if v]
    if not tx_variants:
        return -1.0

    best = 0.0
    for norm_tx in tx_variants:
        for raw_target in targets:
            norm_t = normalize_text(raw_target)
            if not norm_t:
                continue

            # Exact
            if norm_tx == norm_t:
                return 1.0

            # Substring containment
            if norm_t in norm_tx or norm_tx in norm_t:
                best = max(best, 0.85)
                continue

            # Word overlap
            tx_words = set(norm_tx.split())
            t_words = set(norm_t.split())
            if tx_words and t_words:
                common = tx_words & t_words
                overlap = len(common) / min(len(tx_words), len(t_words))
                if overlap > 0:
                    best = max(best, 0.5 + overlap * 0.3)

            # Levenshtein
            lev = levenshtein_similarity(norm_tx, norm_t)
            best = max(best, lev)

    return best if best > 0 else -1.0


# --- Main pair scorer ---

def calculate_pair_score(
    tx_amount: float,
    tx_date: Optional[str],
    tx_desc: Optional[str],
    doc_amounts: Union[float, List[float]],
    doc_date: Optional[str],
    doc_vendor: Optional[str],
    doc_filename: Optional[str],
    weights: Optional[Dict[str, float]] = None,
) -> Dict:
    """
    Score a single (transaction, document) pair.

    doc_amounts: single float or list [total_amount, net_amount].
    Returns dict with total_score, data_quality, breakdown.
    Dynamic weight normalization: missing dimensions redistribute weight.
    """
    w = weights or DEFAULT_WEIGHTS

    amt_score = score_amount(tx_amount, doc_amounts)
    dt_score = score_date(tx_date, doc_date)
    desc_score = score_description(tx_desc, doc_vendor, doc_filename)

    # Dynamic weights — only include available dimensions
    active: list[Tuple[str, float, float]] = []
    active.append(('amount', w['amount'], amt_score))

    if dt_score >= 0:
        active.append(('date', w['date'], dt_score))
    if desc_score >= 0:
        active.append(('description', w['description'], desc_score))

    total_weight = sum(a[1] for a in active)
    if total_weight <= 0:
        return {
            'total_score': 0.0,
            'data_quality': 0.0,
            'breakdown': {'amount': amt_score, 'date': dt_score, 'description': desc_score},
        }

    weighted_sum = sum((a[1] / total_weight) * a[2] for a in active)

    # Data quality: proportion of available dimensions
    data_quality = len(active) / 3.0

    # Exact amount match bonus:
    # Kuruş kuruş eşleşme en güçlü sinyal — diğer boyutlar eksik olsa
    # bile data_quality cezasını azalt.
    if amt_score >= 0.95:
        # Amount perfect → softer penalty for missing data
        quality_factor = 0.90 + 0.10 * data_quality
    else:
        quality_factor = 0.80 + 0.20 * data_quality

    final_score = weighted_sum * quality_factor

    return {
        'total_score': round(min(1.0, final_score), 4),
        'data_quality': round(data_quality, 2),
        'breakdown': {
            'amount': round(amt_score, 4),
            'date': round(dt_score, 4),
            'description': round(desc_score, 4),
        },
    }
