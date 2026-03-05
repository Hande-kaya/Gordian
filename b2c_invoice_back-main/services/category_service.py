"""
Category Service - Business logic for expense category management.

Handles validation, retrieval, and updates of per-company categories.
"""

from models.expense_categories import (
    DEFAULT_EXPENSE_CATEGORIES,
    is_valid_category_key,
)
from repositories.company_repository import (
    get_expense_categories,
    set_expense_categories,
    reset_expense_categories,
)

MAX_CATEGORIES = 30
MIN_CATEGORIES = 1


def get_categories(company_id: str) -> dict:
    """Get categories for a company. Returns defaults if no custom set."""
    custom = get_expense_categories(company_id)
    if custom:
        return {'categories': custom, 'is_default': False}
    return {'categories': DEFAULT_EXPENSE_CATEGORIES, 'is_default': True}


def update_categories(company_id: str, categories: list) -> dict:
    """Validate and save custom categories."""
    # Basic type check
    if not isinstance(categories, list):
        return {'success': False, 'message': 'categories must be a list'}

    if len(categories) < MIN_CATEGORIES:
        return {'success': False, 'message': f'At least {MIN_CATEGORIES} category required'}

    if len(categories) > MAX_CATEGORIES:
        return {'success': False, 'message': f'Maximum {MAX_CATEGORIES} categories allowed'}

    seen_keys = set()
    for i, cat in enumerate(categories):
        if not isinstance(cat, dict):
            return {'success': False, 'message': f'Category at index {i} must be an object'}

        key = cat.get('key', '')
        if not is_valid_category_key(key):
            return {
                'success': False,
                'message': f'Invalid key "{key}" at index {i}. Must match [a-z][a-z0-9_]* and be ≤40 chars',
            }

        if key in seen_keys:
            return {'success': False, 'message': f'Duplicate key "{key}" at index {i}'}
        seen_keys.add(key)

        labels = cat.get('labels', {})
        if not isinstance(labels, dict) or not labels.get('en', '').strip():
            return {'success': False, 'message': f'labels.en is required for key "{key}"'}

    # Normalize: keep only allowed fields
    clean = []
    for cat in categories:
        labels = cat.get('labels', {})
        clean.append({
            'key': cat['key'],
            'labels': {
                'en': labels.get('en', '').strip(),
                'tr': labels.get('tr', '').strip(),
                'de': labels.get('de', '').strip(),
            },
            'description': (cat.get('description') or '').strip(),
        })

    ok = set_expense_categories(company_id, clean)
    if not ok:
        return {'success': False, 'message': 'Company not found'}
    return {'success': True, 'data': clean}


def reset_to_defaults(company_id: str) -> dict:
    """Reset categories to defaults."""
    reset_expense_categories(company_id)
    return {'categories': DEFAULT_EXPENSE_CATEGORIES, 'is_default': True}
