"""
Auth Utils - Authentication decorators and helpers.

Uses abort() for Flask-RESTX compatibility instead of jsonify().
Includes token blacklist check for revocation support.
"""

from functools import wraps
from flask import request
from flask_restx import abort
import jwt
from config import config


def _get_blacklist_collection():
    """Lazy import to avoid circular dependency."""
    from database import get_collection
    return get_collection('token_blacklist')


def token_required(f):
    """
    Decorator to require valid JWT token for endpoint access.

    Works with both Flask and Flask-RESTX endpoints.
    Uses abort() for Flask-RESTX compatibility.
    Reads token from httpOnly cookie first, then Authorization header.
    Checks token blacklist for revoked tokens (jti).
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None

        # 1. httpOnly cookie (primary — not accessible to JS)
        token = request.cookies.get('access_token')

        # 2. Authorization header (fallback for API clients / mobile)
        if not token and 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header.split(' ')[1]

        if not token:
            abort(401, 'Token is missing')

        try:
            # Decode token using shared secret
            data = jwt.decode(token, config.JWT_SECRET_KEY, algorithms=[config.JWT_ALGORITHM])

            # Check token blacklist (revoked tokens)
            jti = data.get('jti')
            if jti:
                blacklist = _get_blacklist_collection()
                if blacklist is not None and blacklist.find_one({'jti': jti}):
                    abort(401, 'Token has been revoked')

            request.current_user = data
            request.current_user_token = data
        except jwt.ExpiredSignatureError:
            abort(401, 'Token has expired')
        except jwt.InvalidTokenError:
            abort(401, 'Invalid token')

        return f(*args, **kwargs)
    return decorated
