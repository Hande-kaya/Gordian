"""
Input Validators - Defense against NoSQL injection.

Query string parameters from Flask's request.args.get() can be
manipulated to inject dicts (e.g. ?type[$ne]=invoice).
These helpers ensure only safe, expected string values pass through.
"""


def safe_string_param(value, allowed_values=None):
    """
    Sanitize a request.args.get() value against NoSQL injection.

    Returns None if value is not a plain string or not in allowed_values.

    Args:
        value: Raw value from request.args.get()
        allowed_values: Optional whitelist of allowed string values.

    Returns:
        Sanitized string or None.
    """
    if value is None:
        return None
    if not isinstance(value, str):
        return None
    if allowed_values and value not in allowed_values:
        return None
    return value
