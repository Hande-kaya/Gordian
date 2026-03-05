"""
Company Repository - Database operations for company expense categories.

In B2C mode, each user is a virtual company, so per-company = per-user.
"""

from bson import ObjectId
from database import get_db


def get_expense_categories(company_id: str):
    """
    Get custom expense categories for a company.
    Returns list if custom categories exist, None otherwise.
    """
    try:
        oid = ObjectId(company_id)
    except Exception:
        return None

    db = get_db()
    company = db['companies'].find_one(
        {'_id': oid},
        {'expense_categories': 1}
    )
    if not company:
        return None
    return company.get('expense_categories')


def set_expense_categories(company_id: str, categories: list) -> bool:
    """Save custom expense categories for a company."""
    try:
        oid = ObjectId(company_id)
    except Exception:
        return False

    db = get_db()
    result = db['companies'].update_one(
        {'_id': oid},
        {'$set': {'expense_categories': categories}}
    )
    return result.matched_count > 0


def reset_expense_categories(company_id: str) -> bool:
    """Remove custom categories, reverting to defaults."""
    try:
        oid = ObjectId(company_id)
    except Exception:
        return False

    db = get_db()
    result = db['companies'].update_one(
        {'_id': oid},
        {'$unset': {'expense_categories': ''}}
    )
    return result.matched_count > 0
