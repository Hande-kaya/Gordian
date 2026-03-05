"""
MongoDB-backed rate limiter for auth endpoints.

Uses atomic findOneAndUpdate for multi-worker safety.
Expired entries are auto-cleaned by MongoDB TTL index
(see database.py: rate_limits.expires_at).
"""

from datetime import datetime, timedelta
from functools import wraps

from flask import request
from pymongo import ReturnDocument


def _get_rate_limits_collection():
    """Lazy import to avoid circular dependency at module load."""
    from database import get_collection
    return get_collection('rate_limits')


def rate_limit(max_requests: int = 10, window: int = 60):
    """
    Decorator: limit requests per IP using MongoDB.

    Args:
        max_requests: Max requests allowed within the window.
        window: Time window in seconds.
    """
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            ip = request.remote_addr or 'unknown'
            endpoint = request.endpoint or 'unknown'
            key = f'{endpoint}:{ip}'
            now = datetime.utcnow()
            window_start = now - timedelta(seconds=window)

            collection = _get_rate_limits_collection()
            if collection is None:
                # DB not ready — allow through (fail-open)
                return f(*args, **kwargs)

            # Atomic: find-or-create rate record, increment counter
            doc = collection.find_one_and_update(
                {
                    'key': key,
                    'window_start': {'$gte': window_start},
                },
                {
                    '$inc': {'count': 1},
                    '$setOnInsert': {
                        'key': key,
                        'window_start': now,
                        'expires_at': now + timedelta(seconds=window),
                    },
                },
                upsert=True,
                return_document=ReturnDocument.AFTER,
            )

            if doc and doc.get('count', 0) > max_requests:
                return {
                    'success': False,
                    'message': 'Too many requests. Please try again later.'
                }, 429

            return f(*args, **kwargs)
        return wrapper
    return decorator
