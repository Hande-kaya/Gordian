"""
Auth Preferences Routes - User preferences management.
"""

from datetime import datetime

from bson import ObjectId
from flask import request
from flask_restx import Namespace, Resource

from database import get_collection
from utils.auth import token_required

auth_prefs_ns = Namespace('auth', description='B2C Preferences')

VALID_THEMES = {'light', 'dark', 'system'}
VALID_LANGUAGES = {'tr', 'en'}


@auth_prefs_ns.route('/preferences')
class Preferences(Resource):
    @token_required
    def patch(self):
        """Update user preferences (theme, language, onboarding)."""
        data = request.get_json()
        if not data:
            return {'success': False, 'message': 'Request body required'}, 400

        current = request.current_user
        try:
            user_oid = ObjectId(current['user_id'])
        except Exception:
            return {'success': False, 'message': 'Invalid user'}, 400

        updates = {}

        if 'theme' in data:
            if data['theme'] not in VALID_THEMES:
                return {'success': False, 'message': f'Invalid theme. Must be one of: {", ".join(VALID_THEMES)}'}, 400
            updates['preferences.theme'] = data['theme']

        if 'language' in data:
            if data['language'] not in VALID_LANGUAGES:
                return {'success': False, 'message': f'Invalid language. Must be one of: {", ".join(VALID_LANGUAGES)}'}, 400
            updates['preferences.language'] = data['language']

        if 'onboarding_completed' in data:
            if not isinstance(data['onboarding_completed'], bool):
                return {'success': False, 'message': 'onboarding_completed must be boolean'}, 400
            updates['preferences.onboarding_completed'] = data['onboarding_completed']

        if not updates:
            return {'success': False, 'message': 'No valid fields provided'}, 400

        updates['updated_at'] = datetime.utcnow()
        get_collection('users').update_one({'_id': user_oid}, {'$set': updates})

        return {'success': True, 'message': 'Preferences updated'}, 200
