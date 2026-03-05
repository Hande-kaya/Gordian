"""
Auth Account Routes - Protected account management endpoints.

Extracted from auth.py to keep file sizes under 500 lines.
Endpoints: profile update, change password, me, set-password, logout.
"""

from datetime import datetime

import bcrypt
from bson import ObjectId
from flask import request, make_response, jsonify
from flask_restx import Namespace, Resource

from config import config
from database import get_collection
from utils.auth import token_required
from utils.jwt_helper import create_access_token
from utils.cookie_helper import json_with_cookie, clear_auth_cookie
from routes.auth import _build_token_payload

# Lazy getter to avoid import-time circular dependency
def _get_blacklist_collection():
    return get_collection('token_blacklist')

auth_account_ns = Namespace('auth_account', description='B2C Account Management')


# PATCH /api/auth/profile
@auth_account_ns.route('/profile')
class UpdateProfile(Resource):
    @token_required
    def patch(self):
        """Update current user's profile (name, email)."""
        data = request.get_json()
        if not data:
            return {'success': False, 'message': 'Request body required'}, 400

        current = request.current_user
        try:
            user_oid = ObjectId(current['user_id'])
        except Exception:
            return {'success': False, 'message': 'Invalid user'}, 400

        users = get_collection('users')
        user = users.find_one({'_id': user_oid})
        if not user:
            return {'success': False, 'message': 'User not found'}, 404

        updates = {}
        name = (data.get('name') or '').strip()
        email = (data.get('email') or '').strip().lower()

        if name and name != user.get('name'):
            updates['name'] = name

        if email and email != user.get('email'):
            existing = users.find_one({'email': email, '_id': {'$ne': user_oid}})
            if existing:
                return {'success': False, 'message': 'Email already in use'}, 409
            updates['email'] = email

        if not updates:
            return {'success': False, 'message': 'No changes provided'}, 400

        updates['updated_at'] = datetime.utcnow()
        users.update_one({'_id': user_oid}, {'$set': updates})

        # Issue new token with updated info via httpOnly cookie
        updated_user = users.find_one({'_id': user_oid})
        company_id = updated_user.get('company_id')
        token_data = _build_token_payload(updated_user, company_id)
        token = create_access_token(token_data)

        return json_with_cookie({
            'success': True,
            'message': 'Profile updated successfully',
            'access_token': token,
        }, 200, token)


# POST /api/auth/change-password
@auth_account_ns.route('/change-password')
class ChangePassword(Resource):
    @token_required
    def post(self):
        """Change password for logged-in user."""
        data = request.get_json()
        if not data:
            return {'success': False, 'message': 'Request body required'}, 400

        current_password = data.get('current_password', '')
        new_password = data.get('new_password', '')

        if not current_password or not new_password:
            return {'success': False, 'message': 'Current and new password required'}, 400

        if len(new_password) < 8:
            return {'success': False, 'message': 'New password must be at least 8 characters'}, 400

        current = request.current_user
        try:
            user_oid = ObjectId(current['user_id'])
        except Exception:
            return {'success': False, 'message': 'Invalid user'}, 400

        users = get_collection('users')
        user = users.find_one({'_id': user_oid})
        if not user:
            return {'success': False, 'message': 'User not found'}, 404

        try:
            if not bcrypt.checkpw(current_password.encode('utf-8'), user['password_hash']):
                return {'success': False, 'message': 'Current password is incorrect'}, 401
        except Exception:
            return {'success': False, 'message': 'Current password is incorrect'}, 401

        password_hash = bcrypt.hashpw(
            new_password.encode('utf-8'),
            bcrypt.gensalt(rounds=config.BCRYPT_ROUNDS)
        )
        users.update_one(
            {'_id': user_oid},
            {'$set': {'password_hash': password_hash, 'updated_at': datetime.utcnow()}}
        )

        return {'success': True, 'message': 'Password changed successfully'}, 200


# GET /api/auth/me
@auth_account_ns.route('/me')
class Me(Resource):
    @token_required
    def get(self):
        """Get current user info, enriched with DB fields."""
        current = request.current_user
        try:
            oid = ObjectId(current['user_id'])
            db_user = get_collection('users').find_one(
                {'_id': oid},
                {'profile_photo': 1, 'preferences': 1, 'password_hash': 1, 'has_password': 1}
            )
            if db_user:
                if db_user.get('profile_photo'):
                    current['profile_photo'] = db_user['profile_photo']
                current['preferences'] = db_user.get('preferences', {
                    'onboarding_completed': False,
                    'theme': 'system',
                    'language': 'tr',
                })
                current['has_password'] = db_user.get('has_password', bool(db_user.get('password_hash')))
        except Exception:
            pass
        return {'success': True, 'data': {'user': current}}, 200


# POST /api/auth/set-password (SSO users without password)
@auth_account_ns.route('/set-password')
class SetPassword(Resource):
    @token_required
    def post(self):
        """Set password for SSO-only users who registered without a password."""
        data = request.get_json()
        new_password = data.get('new_password', '') if data else ''
        if not new_password or len(new_password) < 8:
            return {'success': False, 'message': 'Password must be at least 8 characters'}, 400

        current = request.current_user
        try:
            user_oid = ObjectId(current['user_id'])
        except Exception:
            return {'success': False, 'message': 'Invalid user'}, 400

        users = get_collection('users')
        user = users.find_one({'_id': user_oid})
        if not user:
            return {'success': False, 'message': 'User not found'}, 404

        # Only allow if user has no password yet
        if user.get('has_password', bool(user.get('password_hash'))):
            return {'success': False, 'message': 'Password already set. Use change-password instead.'}, 400

        password_hash = bcrypt.hashpw(
            new_password.encode('utf-8'),
            bcrypt.gensalt(rounds=config.BCRYPT_ROUNDS)
        )
        users.update_one(
            {'_id': user_oid},
            {'$set': {
                'password_hash': password_hash,
                'has_password': True,
                'updated_at': datetime.utcnow()
            }}
        )

        return {'success': True, 'message': 'Password set successfully'}, 200


# POST /api/auth/logout
@auth_account_ns.route('/logout')
class Logout(Resource):
    @token_required
    def post(self):
        """Logout: add current token to blacklist and clear cookie."""
        token_data = request.current_user_token
        jti = token_data.get('jti')
        exp = token_data.get('exp')

        if not jti:
            resp = make_response(jsonify({'success': True, 'message': 'Logged out (legacy token)'}), 200)
            clear_auth_cookie(resp)
            return resp

        blacklist = _get_blacklist_collection()
        if blacklist is not None:  # pymongo 4.x: use `is not None` not bool()
            blacklist.insert_one({
                'jti': jti,
                'expires_at': datetime.utcfromtimestamp(exp) if exp else datetime.utcnow(),
            })

        resp = make_response(jsonify({'success': True, 'message': 'Logged out successfully'}), 200)
        clear_auth_cookie(resp)
        return resp
