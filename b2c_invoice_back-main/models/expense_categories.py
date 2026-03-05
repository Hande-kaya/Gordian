"""
Default Expense Categories - Business Standard 13-Category System.

Each user/company can customize these via the Settings UI.
Categories are stored in the `companies` collection as `expense_categories`.
When null/missing, these defaults are used.
"""

import re

DEFAULT_EXPENSE_CATEGORIES = [
    {
        'key': 'cogs',
        'labels': {'en': 'Cost of Goods Sold (COGS)', 'tr': 'Satılan Malın Maliyeti', 'de': 'Wareneinsatz'},
        'description': 'Direct costs of producing goods: raw materials, manufacturing, direct labor',
    },
    {
        'key': 'payroll',
        'labels': {'en': 'Payroll & Compensation', 'tr': 'Bordro & Ücretler', 'de': 'Gehaltsabrechnung'},
        'description': 'Salaries, wages, bonuses, benefits, payroll taxes',
    },
    {
        'key': 'professional_fees',
        'labels': {'en': 'Professional Fees', 'tr': 'Profesyonel Hizmetler', 'de': 'Professionelle Gebühren'},
        'description': 'Legal, accounting, consulting, freelance services',
    },
    {
        'key': 'rent_facilities',
        'labels': {'en': 'Rent & Facilities', 'tr': 'Kira & Tesis Giderleri', 'de': 'Miete & Einrichtungen'},
        'description': 'Office/warehouse rent, utilities, maintenance, cleaning',
    },
    {
        'key': 'office_expenses',
        'labels': {'en': 'Office Expenses', 'tr': 'Ofis Giderleri', 'de': 'Büroausgaben'},
        'description': 'Office supplies, stationery, postage, printing, furniture under threshold',
    },
    {
        'key': 'technology',
        'labels': {'en': 'Technology & Software', 'tr': 'Teknoloji & Yazılım', 'de': 'Technologie & Software'},
        'description': 'SaaS subscriptions, cloud hosting, IT support, telecom, domains',
    },
    {
        'key': 'travel_meals',
        'labels': {'en': 'Travel & Meals', 'tr': 'Seyahat & Yemek', 'de': 'Reisen & Verpflegung'},
        'description': 'Flights, hotels, car rentals, taxis, fuel, tolls, parking, meals, per diem',
    },
    {
        'key': 'marketing',
        'labels': {'en': 'Marketing & Advertising', 'tr': 'Pazarlama & Reklam', 'de': 'Marketing & Werbung'},
        'description': 'Ads, social media, events, sponsorships, branding, PR',
    },
    {
        'key': 'insurance',
        'labels': {'en': 'Insurance', 'tr': 'Sigorta', 'de': 'Versicherung'},
        'description': 'Business liability, property, health, workers comp, vehicle insurance',
    },
    {
        'key': 'financial_costs',
        'labels': {'en': 'Financial Costs', 'tr': 'Finansal Maliyetler', 'de': 'Finanzielle Kosten'},
        'description': 'Bank fees, interest, FX losses, payment processing, loan costs',
    },
    {
        'key': 'taxes_gov',
        'labels': {'en': 'Taxes & Government Fees', 'tr': 'Vergiler & Resmi Giderler', 'de': 'Steuern & Gebühren'},
        'description': 'Corporate tax, VAT payments, licenses, permits, regulatory fees',
    },
    {
        'key': 'assets_equipment',
        'labels': {'en': 'Assets & Equipment', 'tr': 'Varlıklar & Ekipman', 'de': 'Anlagen & Ausrüstung'},
        'description': 'Machinery, vehicles, computers, furniture above threshold, depreciation',
    },
    {
        'key': 'miscellaneous',
        'labels': {'en': 'Miscellaneous', 'tr': 'Diğer', 'de': 'Sonstiges'},
        'description': 'Anything that does not fit the above categories',
    },
]

# Pre-compiled regex for key validation
_KEY_PATTERN = re.compile(r'^[a-z][a-z0-9_]*$')


def is_valid_category_key(key: str) -> bool:
    """Check if a category key matches the required format."""
    return bool(_KEY_PATTERN.match(key)) and len(key) <= 40


def get_valid_category_keys(categories: list) -> set:
    """Extract the set of valid keys from a categories list."""
    return {c['key'] for c in categories if 'key' in c}
