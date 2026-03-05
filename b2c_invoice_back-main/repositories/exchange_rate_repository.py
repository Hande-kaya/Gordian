"""Exchange Rate Repository — DB operations for exchange_rates collection."""

from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from database import get_collection


_COL = 'exchange_rates'


def upsert_rates(date: str, base: str, rates: Dict[str, float]) -> bool:
    """Insert or update exchange rates for a date."""
    col = get_collection(_COL)
    result = col.update_one(
        {'date': date},
        {'$set': {'base': base, 'rates': rates, 'updated_at': datetime.utcnow()}},
        upsert=True,
    )
    return result.acknowledged


def find_by_date(date: str) -> Optional[Dict[str, Any]]:
    """Find exchange rates for an exact date."""
    col = get_collection(_COL)
    return col.find_one({'date': date}, {'_id': 0, 'date': 1, 'base': 1, 'rates': 1})


def find_nearest(date: str) -> Optional[Dict[str, Any]]:
    """Find nearest exchange rate (before or on date). Handles weekends/holidays."""
    col = get_collection(_COL)
    doc = col.find_one(
        {'date': {'$lte': date}},
        {'_id': 0, 'date': 1, 'base': 1, 'rates': 1},
        sort=[('date', -1)],
    )
    if doc:
        return doc
    # Fallback: nearest future date (edge case: date before first record)
    return col.find_one(
        {'date': {'$gte': date}},
        {'_id': 0, 'date': 1, 'base': 1, 'rates': 1},
        sort=[('date', 1)],
    )
