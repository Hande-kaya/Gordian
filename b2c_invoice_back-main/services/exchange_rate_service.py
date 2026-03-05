"""
Exchange Rate Service — currency conversion via local DB.

Rates sourced from ECB via Frankfurter API (frankfurter.dev).
All rates stored as EUR-based (1 EUR = X currency).
API is called only for sync/update; convert() reads from DB only.
"""

import logging
from datetime import datetime, date as date_type
from typing import Any, Dict, Optional

import requests

from repositories import exchange_rate_repository as rate_repo

logger = logging.getLogger(__name__)

BASE_CURRENCY = 'EUR'
_API_BASE = 'https://api.frankfurter.dev/v1'


def convert(
    amount: float,
    from_currency: str,
    tx_date: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Convert amount to EUR using DB rates.

    Returns:
        {normalized_amount, exchange_rate, base_currency}
        normalized_amount is None if conversion fails.
    """
    if not amount or not from_currency:
        return {'normalized_amount': None, 'exchange_rate': None, 'base_currency': BASE_CURRENCY}

    # Normalize currency symbols to ISO codes
    _SYMBOL_MAP = {'€': 'EUR', '$': 'USD', '£': 'GBP', '₺': 'TRY', '¥': 'JPY', '₣': 'CHF'}
    cur = _SYMBOL_MAP.get(from_currency.strip(), from_currency.upper().strip())
    if cur == BASE_CURRENCY:
        return {
            'normalized_amount': round(amount, 2),
            'exchange_rate': 1.0,
            'base_currency': BASE_CURRENCY,
        }

    # Find rate from DB
    lookup_date = tx_date or datetime.utcnow().strftime('%Y-%m-%d')
    rate_doc = rate_repo.find_by_date(lookup_date)
    if not rate_doc:
        rate_doc = rate_repo.find_nearest(lookup_date)

    if not rate_doc:
        logger.warning(f"No exchange rate found for {lookup_date}, currency {cur}")
        return {'normalized_amount': None, 'exchange_rate': None, 'base_currency': BASE_CURRENCY}

    rates = rate_doc.get('rates', {})
    rate = rates.get(cur)
    if not rate:
        logger.warning(f"Currency {cur} not in rates for {rate_doc.get('date')}")
        return {'normalized_amount': None, 'exchange_rate': None, 'base_currency': BASE_CURRENCY}

    normalized = round(amount / rate, 2)
    return {
        'normalized_amount': normalized,
        'exchange_rate': rate,
        'base_currency': BASE_CURRENCY,
    }


def sync_historical(start_year: int = 2020) -> Dict[str, Any]:
    """
    Fetch all historical rates from start_year to today.
    Single API call to Frankfurter's date range endpoint.
    Returns: {days_synced, start, end}
    """
    start = f'{start_year}-01-01'
    end = datetime.utcnow().strftime('%Y-%m-%d')

    logger.info(f"Syncing exchange rates from {start} to {end}")
    url = f'{_API_BASE}/{start}..{end}?base={BASE_CURRENCY}'

    try:
        resp = requests.get(url, timeout=60)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error(f"Frankfurter API error: {e}")
        return {'error': str(e), 'days_synced': 0}

    rates_by_date = data.get('rates', {})
    count = 0
    for dt, rates in rates_by_date.items():
        rate_repo.upsert_rates(dt, BASE_CURRENCY, rates)
        count += 1

    logger.info(f"Synced {count} days of exchange rates")
    return {'days_synced': count, 'start': start, 'end': end}


def update_daily() -> Dict[str, Any]:
    """
    Fetch today's latest rates (single API call).
    Called daily by scheduler.
    """
    url = f'{_API_BASE}/latest?base={BASE_CURRENCY}'
    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        logger.error(f"Daily rate update failed: {e}")
        return {'error': str(e)}

    dt = data.get('date')
    rates = data.get('rates', {})
    if dt and rates:
        rate_repo.upsert_rates(dt, BASE_CURRENCY, rates)
        logger.info(f"Updated daily rates for {dt} ({len(rates)} currencies)")
        return {'date': dt, 'currencies': len(rates)}
    return {'error': 'Empty response from API'}


def normalize_document_amounts(extracted_data: dict, doc_date: str = None) -> dict:
    """
    Add normalized_amount fields to extracted_data dict.
    Used after LLM extraction and on user field edits.

    Returns the conversion result dict (for logging/audit).
    """
    currency = extracted_data.get('currency')
    total = extracted_data.get('total_amount')
    inv_date = doc_date or extracted_data.get('invoice_date')

    if not total or not currency:
        extracted_data['normalized_amount'] = total  # same as raw if no currency
        extracted_data['normalized_currency'] = BASE_CURRENCY
        extracted_data['exchange_rate_used'] = None
        return {'normalized_amount': total, 'exchange_rate': None}

    result = convert(total, currency, inv_date)
    extracted_data['normalized_amount'] = result['normalized_amount']
    extracted_data['normalized_currency'] = BASE_CURRENCY
    extracted_data['exchange_rate_used'] = result['exchange_rate']
    return result


def normalize_transaction(tx: dict, stmt_currency: str = None) -> None:
    """
    Normalize a single bank statement transaction.
    Checks for Wise card original amount first, then converts via rate.
    Mutates tx dict in place.
    """
    import re

    # Step 1: Try to parse original amount from Wise card description
    desc = tx.get('description') or ''
    wise_match = re.search(
        r'(?:Card transaction|Kartentransaktion)\s+of\s+([\d.,]+)\s*'
        r'(EUR|USD|GBP|CHF|TRY|SEK|NOK|DKK|PLN|CZK|HUF|RON|BGN|HRK|JPY|AUD|CAD|NZD)',
        desc, re.IGNORECASE,
    )

    if wise_match:
        raw_amt = wise_match.group(1).replace(',', '.')
        orig_currency = wise_match.group(2).upper()
        try:
            orig_amount = float(raw_amt)
        except ValueError:
            orig_amount = None

        if orig_amount:
            tx['original_amount'] = orig_amount
            tx['original_currency'] = orig_currency

            if orig_currency == BASE_CURRENCY:
                # Original is already EUR — most precise, skip conversion
                tx['normalized_amount'] = round(orig_amount, 2)
                tx['normalized_currency'] = BASE_CURRENCY
                tx['exchange_rate_used'] = None
                return
            else:
                # Convert original currency to EUR
                result = convert(orig_amount, orig_currency, tx.get('date'))
                if result['normalized_amount'] is not None:
                    tx['normalized_amount'] = result['normalized_amount']
                    tx['normalized_currency'] = BASE_CURRENCY
                    tx['exchange_rate_used'] = result['exchange_rate']
                    return

    # Step 2: Standard conversion from statement currency
    amount = tx.get('amount')
    currency = stmt_currency
    if not amount or not currency:
        tx['normalized_amount'] = abs(float(amount)) if amount else None
        tx['normalized_currency'] = BASE_CURRENCY
        tx['exchange_rate_used'] = None
        return

    result = convert(abs(float(amount)), currency, tx.get('date'))
    tx['normalized_amount'] = result['normalized_amount']
    tx['normalized_currency'] = BASE_CURRENCY
    tx['exchange_rate_used'] = result['exchange_rate']
