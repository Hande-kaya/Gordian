"""
Cookie Helper - httpOnly cookie utilities for JWT auth.

Sets secure, httpOnly cookies so tokens are never exposed to JavaScript.
Uses SameSite=None for cross-domain support (backend and frontend on different domains).
"""

from flask import make_response, jsonify
from config import config

# Cookie name for the JWT access token
COOKIE_NAME = 'access_token'


def set_auth_cookie(response, token: str):
    """Set httpOnly JWT cookie on a Flask response object."""
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        secure=True,
        samesite='None',
        max_age=config.JWT_ACCESS_TOKEN_EXPIRES,
        path='/',
    )
    return response


def clear_auth_cookie(response):
    """Clear auth cookie by setting max_age=0."""
    response.set_cookie(
        COOKIE_NAME,
        '',
        httponly=True,
        secure=True,
        samesite='None',
        max_age=0,
        path='/',
    )
    return response


def json_with_cookie(data: dict, status_code: int, token: str):
    """Create a JSON response with httpOnly auth cookie set."""
    resp = make_response(jsonify(data), status_code)
    set_auth_cookie(resp, token)
    return resp
