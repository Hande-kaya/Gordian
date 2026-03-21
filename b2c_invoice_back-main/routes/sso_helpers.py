"""
SSO Helpers - Shared utilities for OAuth providers (Microsoft, Google).

State management, completion tokens, redirect builder,
and common user lookup/creation logic.
"""

import secrets
from datetime import datetime, timedelta
from typing import Optional, Tuple

import bcrypt
import jwt
from flask import redirect

from config import config
from database import get_collection
from utils.jwt_helper import create_access_token
from utils.cookie_helper import set_auth_cookie, json_with_cookie
from routes.auth import _create_virtual_company, _get_next_user_id, _build_token_payload

_STATE_TTL = 600  # 10 minutes


def _get_states_collection():
    """Get oauth_states MongoDB collection."""
    return get_collection('oauth_states')


def validate_origin(origin: Optional[str]) -> Optional[str]:
    """
    Validate that the request origin matches the allowed B2C frontend URL.
    Returns the origin string if valid, otherwise returns the configured default.
    Prevents open-redirect attacks by ensuring only known frontends initiate SSO.
    """
    allowed = config.B2C_FRONTEND_URL.rstrip('/')
    if origin and origin.rstrip('/') == allowed:
        return origin.rstrip('/')
    return allowed


def generate_state(frontend_origin: Optional[str] = None) -> str:
    """Generate and store OAuth state in MongoDB (multi-worker safe).
    Stores frontend_origin so the callback can redirect to the correct URL.
    """
    state = secrets.token_urlsafe(32)
    col = _get_states_collection()
    col.insert_one({
        'state': state,
        'frontend_origin': frontend_origin or config.B2C_FRONTEND_URL.rstrip('/'),
        'expires_at': datetime.utcnow() + timedelta(seconds=_STATE_TTL),
    })
    col.delete_many({'expires_at': {'$lt': datetime.utcnow()}})
    return state


def validate_state(state: Optional[str]) -> Tuple[bool, Optional[str]]:
    """Validate and consume OAuth state from MongoDB (one-time use).
    Returns (is_valid, frontend_origin) tuple.
    """
    if not state:
        return False, None
    col = _get_states_collection()
    doc = col.find_one_and_delete({
        'state': state,
        'expires_at': {'$gte': datetime.utcnow()},
    })
    if not doc:
        return False, None
    return True, doc.get('frontend_origin') or config.B2C_FRONTEND_URL.rstrip('/')


def build_b2c_redirect(base_url: Optional[str] = None, **params) -> str:
    """Build redirect URL to B2C frontend SSO callback page.
    Uses base_url if provided (dynamic origin), otherwise falls back to config.
    """
    from urllib.parse import urlencode
    base = (base_url or config.B2C_FRONTEND_URL).rstrip('/')
    query = urlencode(params)
    return f"{base}/auth/sso-callback?{query}"


def create_completion_token(email: str, name: str, provider: str, picture_url: str = '') -> str:
    """Create short-lived JWT for registration completion."""
    payload = {
        'email': email,
        'name': name,
        'type': f'{provider}_completion',
        'exp': datetime.utcnow() + timedelta(minutes=10),
    }
    if picture_url:
        payload['picture'] = picture_url
    return jwt.encode(payload, config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


def decode_completion_token(token_str: str, provider: str) -> Optional[dict]:
    """Decode and validate completion token for given provider."""
    try:
        payload = jwt.decode(
            token_str, config.JWT_SECRET_KEY,
            algorithms=[config.JWT_ALGORITHM],
        )
        if payload.get('type') != f'{provider}_completion':
            return None
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def handle_sso_callback(
    email: str, display_name: str, provider: str,
    picture_url: str = '', frontend_origin: Optional[str] = None,
):
    """
    Common SSO callback logic after email is extracted from provider.
    Returns a Flask redirect response.
    """
    users = get_collection('users')
    user = users.find_one({'email': email})

    if user:
        return _handle_existing_user(user, users, provider,
                                     picture_url=picture_url,
                                     frontend_origin=frontend_origin)
    return _handle_new_user(email, display_name, provider,
                            picture_url=picture_url,
                            frontend_origin=frontend_origin)


def _handle_existing_user(user, users, provider: str,
                           picture_url: str = '',
                           frontend_origin: Optional[str] = None):
    """Existing user: auto-login or reject."""
    if user.get('account_type') != 'b2c':
        return redirect(build_b2c_redirect(base_url=frontend_origin,
                                           success='false', error='b2b_account'))

    update_fields = {
        f'{provider}_sso_enabled': True,
        'last_login_at': datetime.utcnow(),
        'last_login_provider': provider,
    }
    if not user.get('is_verified', False):
        update_fields['is_verified'] = True
    if picture_url and picture_url.startswith('https://') and not user.get('profile_photo'):
        update_fields['profile_photo'] = picture_url
    if 'has_password' not in user:
        update_fields['has_password'] = bool(user.get('password_hash'))

    users.update_one({'_id': user['_id']}, {'$set': update_fields})

    company_id = user.get('company_id')
    token_data = _build_token_payload(user, company_id)
    access_token = create_access_token(token_data)

    resp = redirect(build_b2c_redirect(base_url=frontend_origin,
                                       success='true',
                                       token=access_token,
                                       provider=provider))
    set_auth_cookie(resp, access_token)
    return resp


def _auto_register_sso_user(email: str, display_name: str, provider: str,
                             picture_url: str = ''):
    """
    Create a new B2C user directly from SSO provider data.
    No password required — provider identity is the credential.
    Returns access_token on success, raises on failure.
    """
    user_id_seq = _get_next_user_id()
    user_doc = {
        'user_id': user_id_seq,
        'name': display_name or email.split('@')[0],
        'email': email,
        'has_password': False,
        'is_verified': True,
        'is_active': True,
        'signup_type': 'independent',
        'account_type': 'b2c',
        'role': 'user',
        f'{provider}_sso_enabled': True,
        'last_login_provider': provider,
        'last_login_at': datetime.utcnow(),
        'preferences': {
            'onboarding_completed': False,
            'theme': 'system',
            'language': 'tr',
        },
        'created_at': datetime.utcnow(),
        'updated_at': datetime.utcnow(),
    }
    if picture_url and picture_url.startswith('https://'):
        user_doc['profile_photo'] = picture_url

    users = get_collection('users')
    result = users.insert_one(user_doc)
    user_oid = result.inserted_id

    company_id = _create_virtual_company(user_doc['name'], user_oid)
    users.update_one({'_id': user_oid}, {'$set': {'company_id': company_id}})

    user_doc['_id'] = user_oid
    user_doc['company_id'] = company_id
    token_data = _build_token_payload(user_doc, company_id)
    return create_access_token(token_data)


def _handle_new_user(email: str, display_name: str, provider: str,
                     picture_url: str = '', frontend_origin: Optional[str] = None):
    """
    New user: auto-register with SSO provider data and immediately log in.
    No password or completion form required — provider is the credential.
    """
    try:
        access_token = _auto_register_sso_user(email, display_name, provider, picture_url)
    except Exception:
        return redirect(build_b2c_redirect(base_url=frontend_origin,
                                           success='false',
                                           error='registration_failed'))

    resp = redirect(build_b2c_redirect(base_url=frontend_origin,
                                       success='true',
                                       token=access_token,
                                       provider=provider))
    set_auth_cookie(resp, access_token)
    return resp


def complete_registration(data: dict, provider: str):
    """
    Manual registration completion (fallback).
    Returns (response_dict, status_code) tuple.
    """
    if not data:
        return {'success': False, 'message': 'Request body required'}, 400

    completion_token = data.get('completion_token', '')
    name = (data.get('name') or '').strip()
    password = data.get('password', '')

    if not completion_token or not name:
        return {'success': False, 'message': 'completion_token and name are required'}, 400

    if password and len(password) < 8:
        return {'success': False, 'message': 'Password must be at least 8 characters'}, 400

    payload = decode_completion_token(completion_token, provider)
    if not payload:
        return {'success': False, 'message': 'Invalid or expired completion token'}, 401

    email = payload['email']
    users = get_collection('users')
    if users.find_one({'email': email}):
        return {'success': False, 'message': 'Email already registered'}, 409

    user_id_seq = _get_next_user_id()
    user_doc = _build_new_user_doc(user_id_seq, name, email, provider, password, payload)

    result = users.insert_one(user_doc)
    user_oid = result.inserted_id
    company_id = _create_virtual_company(name, user_oid)
    users.update_one({'_id': user_oid}, {'$set': {'company_id': company_id}})

    user_doc['_id'] = user_oid
    user_doc['company_id'] = company_id
    token_data = _build_token_payload(user_doc, company_id)
    access_token = create_access_token(token_data)

    return json_with_cookie({
        'success': True,
        'message': 'Registration completed successfully',
        'access_token': access_token,
    }, 201, access_token)


def _build_new_user_doc(user_id_seq, name, email, provider, password, payload):
    """Build user document for manual completion registration."""
    user_doc = {
        'user_id': user_id_seq,
        'name': name,
        'email': email,
        'is_verified': True,
        'is_active': True,
        'signup_type': 'independent',
        'account_type': 'b2c',
        'role': 'user',
        f'{provider}_sso_enabled': True,
        'last_login_provider': provider,
        'preferences': {
            'onboarding_completed': False,
            'theme': 'system',
            'language': 'tr',
        },
        'created_at': datetime.utcnow(),
        'updated_at': datetime.utcnow(),
    }
    if password and len(password) >= 8:
        user_doc['password_hash'] = bcrypt.hashpw(
            password.encode('utf-8'),
            bcrypt.gensalt(rounds=config.BCRYPT_ROUNDS),
        )
        user_doc['has_password'] = True
    else:
        user_doc['has_password'] = False
    picture_url = payload.get('picture', '')
    if picture_url and picture_url.startswith('https://'):
        user_doc['profile_photo'] = picture_url
    return user_doc