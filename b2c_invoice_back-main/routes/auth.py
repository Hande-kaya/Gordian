"""
Auth Routes - B2C public authentication endpoints.
Register, login, email verification, password reset.

Protected account endpoints (profile, change-password, me, set-password)
are in auth_account.py.
"""

import secrets
from datetime import datetime, timedelta

import bcrypt
from bson import ObjectId
from flask import request
from flask_restx import Namespace, Resource

from config import config
from database import get_collection
from utils.jwt_helper import create_access_token
from utils.cookie_helper import json_with_cookie
from utils.rate_limit import rate_limit  # noqa: E402 — used as decorator
from utils.email import (
    send_email_via_zepto,
    build_verification_email,
    build_reset_password_email,
)

auth_ns = Namespace('auth', description='B2C Authentication')

def _generate_code() -> str:
    """Generate a cryptographically secure 8-digit OTP code."""
    return str(secrets.randbelow(100_000_000)).zfill(8)


def _get_next_user_id() -> str:
    """Generate sequential user ID (USR-1, USR-2, ...)."""
    users = get_collection('users')
    last = users.find_one(
        {'user_id': {'$regex': r'^USR-\d+$'}},
        sort=[('_id', -1)],
        projection={'user_id': 1}
    )
    if last and last.get('user_id'):
        try:
            num = int(last['user_id'].split('-')[1])
            return f'USR-{num + 1}'
        except (ValueError, IndexError):
            pass
    return 'USR-1'


def _create_virtual_company(user_name: str, user_id: ObjectId) -> ObjectId:
    """Create a virtual company for independent B2C user."""
    companies = get_collection('companies')
    company = {
        'name': f"{user_name} ({user_id})",
        'email': f"virtual_{user_id}@b2c.local",
        'type': 'virtual',
        'created_by': user_id,
        'is_active': True,
        'roles': [],
        'created_at': datetime.utcnow(),
        'updated_at': datetime.utcnow(),
    }
    result = companies.insert_one(company)
    return result.inserted_id


def _build_token_payload(user: dict, company_id) -> dict:
    """Build JWT token payload matching Portal format."""
    return {
        'user_id': str(user['_id']),
        'email': user['email'],
        'role': 'user',
        'name': user.get('name', ''),
        'is_admin': False,
        'company_id': str(company_id) if company_id else None,
        'permissions': {},
        'account_type': user.get('account_type', 'b2c'),
    }


# POST /api/auth/register
@auth_ns.route('/register')
class Register(Resource):
    @rate_limit(max_requests=5, window=60)
    def post(self):
        """Register a new B2C user."""
        data = request.get_json()
        if not data:
            return {'success': False, 'message': 'Request body required'}, 400

        name = (data.get('name') or '').strip()
        email = (data.get('email') or '').strip().lower()
        password = data.get('password', '')

        if not name or not email or not password:
            return {'success': False, 'message': 'Name, email and password are required'}, 400

        if len(password) < 8:
            return {'success': False, 'message': 'Password must be at least 8 characters'}, 400

        users = get_collection('users')

        # Check existing — return generic message to prevent user enumeration
        if users.find_one({'email': email}):
            return {
                'success': True,
                'message': 'If this email is not already registered, a verification email will be sent',
                'data': {'email': email}
            }, 200

        # Hash password
        password_hash = bcrypt.hashpw(
            password.encode('utf-8'),
            bcrypt.gensalt(rounds=config.BCRYPT_ROUNDS)
        )

        verification_code = _generate_code()
        user_id_seq = _get_next_user_id()

        user_doc = {
            'user_id': user_id_seq,
            'name': name,
            'email': email,
            'password_hash': password_hash,
            'is_verified': False,
            'is_active': True,
            'signup_type': 'independent',
            'account_type': 'b2c',
            'role': 'user',
            'preferences': {
                'onboarding_completed': False,
                'theme': 'system',
                'language': 'tr',
            },
            'verification_code': verification_code,
            'verification_expiry': datetime.utcnow() + timedelta(minutes=10),
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow(),
        }

        result = users.insert_one(user_doc)
        user_oid = result.inserted_id

        # Create virtual company
        company_id = _create_virtual_company(name, user_oid)
        users.update_one(
            {'_id': user_oid},
            {'$set': {'company_id': company_id}}
        )

        # Send verification email
        html = build_verification_email(name, verification_code)
        send_email_via_zepto(email, 'Email Dogrulama Kodu', html)

        return {
            'success': True,
            'message': 'If this email is not already registered, a verification email will be sent',
            'data': {'email': email}
        }, 200


# POST /api/auth/login
@auth_ns.route('/login')
class Login(Resource):
    @rate_limit(max_requests=10, window=60)
    def post(self):
        """Login with email and password."""
        data = request.get_json()
        if not data or not data.get('email') or not data.get('password'):
            return {'success': False, 'message': 'Email and password are required'}, 400

        email = data['email'].strip().lower()
        password = data['password']

        users = get_collection('users')
        user = users.find_one({'email': email})

        if not user:
            return {'success': False, 'message': 'Invalid credentials'}, 401

        # B2C guard: only b2c accounts can login here
        if user.get('account_type') != 'b2c':
            return {
                'success': False,
                'message': 'Bu hesap B2C platformu için uygun değil. Lütfen Portal üzerinden giriş yapın.'
            }, 403

        # Check verification
        if not user.get('is_verified', False):
            return {'success': False, 'message': 'Email is not verified', 'code': 'NOT_VERIFIED'}, 401

        # Check password
        try:
            if not bcrypt.checkpw(password.encode('utf-8'), user['password_hash']):
                return {'success': False, 'message': 'Invalid credentials'}, 401
        except Exception:
            return {'success': False, 'message': 'Invalid credentials'}, 401

        # Check active
        if not user.get('is_active', True):
            return {'success': False, 'message': 'Account is deactivated'}, 401

        company_id = user.get('company_id')
        token_data = _build_token_payload(user, company_id)
        token = create_access_token(token_data)

        # Update last login
        users.update_one(
            {'_id': user['_id']},
            {'$set': {'last_login_at': datetime.utcnow()}}
        )

        return json_with_cookie({
            'success': True,
            'message': 'Login successful',
            'access_token': token,
        }, 200, token)


# POST /api/auth/verify-email
@auth_ns.route('/verify-email')
class VerifyEmail(Resource):
    @rate_limit(max_requests=10, window=60)
    def post(self):
        """Verify email with OTP code."""
        data = request.get_json()
        if not data or not data.get('email') or not data.get('code'):
            return {'success': False, 'message': 'Email and code are required'}, 400

        email = data['email'].strip().lower()
        code = data['code'].strip()

        users = get_collection('users')
        user = users.find_one({'email': email})

        # Generic error to prevent user enumeration
        generic_error = {'success': False, 'message': 'Invalid or expired verification code'}

        if not user:
            return generic_error, 400

        if user.get('is_verified'):
            return {'success': False, 'message': 'Email already verified'}, 400

        if user.get('verification_code') != code:
            return generic_error, 400

        expiry = user.get('verification_expiry')
        if expiry and datetime.utcnow() > expiry:
            return generic_error, 400

        # Verify user
        users.update_one(
            {'_id': user['_id']},
            {
                '$set': {
                    'is_verified': True,
                    'updated_at': datetime.utcnow(),
                },
                '$unset': {
                    'verification_code': '',
                    'verification_expiry': '',
                }
            }
        )

        # Auto-login: set httpOnly cookie
        company_id = user.get('company_id')
        token_data = _build_token_payload(user, company_id)
        token = create_access_token(token_data)

        return json_with_cookie({
            'success': True,
            'message': 'Email verified successfully',
            'access_token': token,
        }, 200, token)


# POST /api/auth/resend-verification
@auth_ns.route('/resend-verification')
class ResendVerification(Resource):
    @rate_limit(max_requests=3, window=60)
    def post(self):
        """Resend verification code."""
        data = request.get_json()
        if not data or not data.get('email'):
            return {'success': False, 'message': 'Email is required'}, 400

        email = data['email'].strip().lower()

        users = get_collection('users')
        user = users.find_one({'email': email})

        if not user:
            return {'success': True, 'message': 'If the email exists, a code has been sent'}, 200

        if user.get('is_verified'):
            return {'success': False, 'message': 'Email already verified'}, 400

        new_code = _generate_code()
        users.update_one(
            {'_id': user['_id']},
            {'$set': {
                'verification_code': new_code,
                'verification_expiry': datetime.utcnow() + timedelta(minutes=10),
            }}
        )

        html = build_verification_email(user.get('name', ''), new_code)
        send_email_via_zepto(email, 'Email Dogrulama Kodu', html)

        return {'success': True, 'message': 'Verification code sent'}, 200


# POST /api/auth/forgot-password
@auth_ns.route('/forgot-password')
class ForgotPassword(Resource):
    @rate_limit(max_requests=5, window=60)
    def post(self):
        """Send password reset code."""
        data = request.get_json()
        if not data or not data.get('email'):
            return {'success': False, 'message': 'Email is required'}, 400

        email = data['email'].strip().lower()

        users = get_collection('users')
        user = users.find_one({'email': email})

        # Always return success to prevent email enumeration
        if not user:
            return {'success': True, 'message': 'If the email exists, a reset code has been sent'}, 200

        reset_code = _generate_code()
        users.update_one(
            {'_id': user['_id']},
            {'$set': {
                'reset_code': reset_code,
                'reset_expires': datetime.utcnow() + timedelta(minutes=10),
            }}
        )

        html = build_reset_password_email(user.get('name', ''), reset_code)
        send_email_via_zepto(email, 'Sifre Sifirlama Kodu', html)

        return {'success': True, 'message': 'If the email exists, a reset code has been sent'}, 200


# POST /api/auth/reset-password
@auth_ns.route('/reset-password')
class ResetPassword(Resource):
    @rate_limit(max_requests=10, window=60)
    def post(self):
        """Reset password with code."""
        data = request.get_json()
        if not data:
            return {'success': False, 'message': 'Request body required'}, 400

        email = (data.get('email') or '').strip().lower()
        code = (data.get('code') or '').strip()
        new_password = data.get('new_password', '')

        if not email or not code or not new_password:
            return {'success': False, 'message': 'Email, code and new_password are required'}, 400

        if len(new_password) < 8:
            return {'success': False, 'message': 'Password must be at least 8 characters'}, 400

        users = get_collection('users')
        user = users.find_one({'email': email})

        if not user:
            return {'success': False, 'message': 'Invalid reset code'}, 400

        if user.get('reset_code') != code:
            return {'success': False, 'message': 'Invalid reset code'}, 400

        if user.get('reset_expires') and datetime.utcnow() > user['reset_expires']:
            return {'success': False, 'message': 'Reset code expired'}, 400

        # Update password
        password_hash = bcrypt.hashpw(
            new_password.encode('utf-8'),
            bcrypt.gensalt(rounds=config.BCRYPT_ROUNDS)
        )

        users.update_one(
            {'_id': user['_id']},
            {
                '$set': {
                    'password_hash': password_hash,
                    'updated_at': datetime.utcnow(),
                },
                '$unset': {
                    'reset_code': '',
                    'reset_expires': '',
                }
            }
        )

        return {'success': True, 'message': 'Password reset successfully'}, 200
