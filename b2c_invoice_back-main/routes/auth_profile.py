"""
Auth Profile Routes - Profile photo management.
"""

import base64
from datetime import datetime

from bson import ObjectId
from flask import request
from flask_restx import Namespace, Resource

from database import get_collection
from utils.auth import token_required

auth_profile_ns = Namespace('auth', description='B2C Profile')


# POST /api/auth/profile-photo
@auth_profile_ns.route('/profile-photo')
class ProfilePhoto(Resource):
    @token_required
    def post(self):
        """Upload or remove profile photo (base64)."""
        data = request.get_json()
        if not data:
            return {'success': False, 'message': 'Request body required'}, 400

        current = request.current_user
        try:
            user_oid = ObjectId(current['user_id'])
        except Exception:
            return {'success': False, 'message': 'Invalid user'}, 400

        photo = data.get('photo')
        users = get_collection('users')

        # Remove photo
        if not photo:
            users.update_one({'_id': user_oid}, {'$unset': {'profile_photo': ''}})
            return {'success': True, 'message': 'Photo removed'}, 200

        # Validate base64 data URI
        if not isinstance(photo, str) or not photo.startswith('data:image/'):
            return {'success': False, 'message': 'Invalid photo format'}, 400

        try:
            _header, b64data = photo.split(',', 1)
            raw = base64.b64decode(b64data)
        except Exception:
            return {'success': False, 'message': 'Invalid base64 data'}, 400

        if len(raw) > 200 * 1024:
            return {'success': False, 'message': 'Photo too large (max 200KB after resize)'}, 400

        users.update_one(
            {'_id': user_oid},
            {'$set': {'profile_photo': photo, 'updated_at': datetime.utcnow()}}
        )
        return {'success': True, 'message': 'Photo updated'}, 200
