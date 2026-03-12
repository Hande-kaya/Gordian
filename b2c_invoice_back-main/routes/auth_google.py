"""
Auth Google Routes - Google SSO endpoints for B2C users.

Provides:
  GET  /login              - Initiate Google OAuth flow
  GET  /callback           - Handle Google redirect
  POST /complete-registration - Complete registration for new SSO users

Uses standard OAuth2 with requests library (no extra dependencies).
"""

from urllib.parse import urlencode

import requests as http_requests
from flask import request, redirect
from flask_cors import cross_origin
from flask_restx import Namespace, Resource

from config import config
from utils.rate_limit import rate_limit
from routes.sso_helpers import (
    validate_origin, generate_state, validate_state, build_b2c_redirect,
    handle_sso_callback, complete_registration,
)

auth_google_ns = Namespace('auth_google', description='Google SSO for B2C')

_GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
_GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
_GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'


def _is_configured() -> bool:
    return bool(config.GOOGLE_CLIENT_ID and config.GOOGLE_CLIENT_SECRET)


@auth_google_ns.route('/login')
class GoogleLogin(Resource):
    @cross_origin(origins=['*'], methods=['GET', 'OPTIONS'], supports_credentials=True)
    @rate_limit(max_requests=10, window=60)
    def get(self):
        """Initiate Google OAuth flow."""
        if not _is_configured():
            return {'success': False, 'message': 'Google SSO is not configured'}, 503

        frontend_origin = validate_origin(request.args.get('origin'))
        state = generate_state(frontend_origin=frontend_origin)
        params = {
            'client_id': config.GOOGLE_CLIENT_ID,
            'redirect_uri': config.GOOGLE_REDIRECT_URI,
            'response_type': 'code',
            'scope': 'openid email profile',
            'state': state,
            'access_type': 'offline',
            'prompt': 'select_account',
        }
        auth_url = f"{_GOOGLE_AUTH_URL}?{urlencode(params)}"
        return {'success': True, 'data': {'authorization_url': auth_url}}, 200


@auth_google_ns.route('/callback')
class GoogleCallback(Resource):
    @auth_google_ns.doc(False)
    @rate_limit(max_requests=10, window=60)
    def get(self):
        """Handle Google OAuth redirect."""
        error = request.args.get('error')
        if error:
            return redirect(build_b2c_redirect(success='false', error=error))

        is_valid, frontend_origin = validate_state(request.args.get('state'))
        if not is_valid:
            return redirect(build_b2c_redirect(success='false', error='invalid_state'))

        code = request.args.get('code')
        if not code:
            return redirect(build_b2c_redirect(base_url=frontend_origin, success='false', error='missing_code'))

        if not _is_configured():
            return redirect(build_b2c_redirect(base_url=frontend_origin, success='false', error='sso_not_configured'))

        # Exchange code for tokens
        try:
            token_resp = http_requests.post(_GOOGLE_TOKEN_URL, data={
                'code': code,
                'client_id': config.GOOGLE_CLIENT_ID,
                'client_secret': config.GOOGLE_CLIENT_SECRET,
                'redirect_uri': config.GOOGLE_REDIRECT_URI,
                'grant_type': 'authorization_code',
            }, timeout=10)
            token_data = token_resp.json()
        except Exception as exc:
            return redirect(build_b2c_redirect(base_url=frontend_origin, success='false', error=str(exc)))

        if 'error' in token_data:
            err = token_data.get('error_description', token_data['error'])
            return redirect(build_b2c_redirect(base_url=frontend_origin, success='false', error=err))

        access_token = token_data.get('access_token')
        if not access_token:
            return redirect(build_b2c_redirect(base_url=frontend_origin, success='false', error='no_access_token'))

        # Get user info
        try:
            user_resp = http_requests.get(
                _GOOGLE_USERINFO_URL,
                headers={'Authorization': f'Bearer {access_token}'},
                timeout=10,
            )
            user_info = user_resp.json()
        except Exception as exc:
            return redirect(build_b2c_redirect(base_url=frontend_origin, success='false', error=str(exc)))

        email = (user_info.get('email') or '').lower()
        if not email:
            return redirect(build_b2c_redirect(base_url=frontend_origin, success='false', error='email_not_found'))

        display_name = user_info.get('name', '')
        picture_url = user_info.get('picture', '')
        return handle_sso_callback(email, display_name, 'google', picture_url=picture_url, frontend_origin=frontend_origin)


@auth_google_ns.route('/complete-registration')
class GoogleCompleteRegistration(Resource):
    def post(self):
        """Complete registration for a new Google SSO user."""
        return complete_registration(request.get_json(), 'google')
