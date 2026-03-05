"""
Auth Microsoft Routes - Microsoft SSO endpoints for B2C users.

Provides:
  GET  /login              - Initiate Microsoft OAuth flow
  GET  /callback           - Handle Microsoft redirect
  POST /complete-registration - Complete registration for new SSO users
"""

from typing import Optional

import msal
from flask import request, redirect
from flask_cors import cross_origin
from flask_restx import Namespace, Resource

from config import config
from utils.rate_limit import rate_limit
from routes.sso_helpers import (
    generate_state, validate_state, build_b2c_redirect,
    handle_sso_callback, complete_registration,
)

auth_microsoft_ns = Namespace('auth_microsoft', description='Microsoft SSO for B2C')

_MSAL_CLIENT: Optional[msal.ConfidentialClientApplication] = None


def _get_msal_client():
    """Lazy-init MSAL confidential client."""
    global _MSAL_CLIENT
    if not config.AZURE_AD_CLIENT_ID or not config.AZURE_AD_CLIENT_SECRET:
        return None
    if _MSAL_CLIENT is None:
        _MSAL_CLIENT = msal.ConfidentialClientApplication(
            client_id=config.AZURE_AD_CLIENT_ID,
            authority="https://login.microsoftonline.com/common",
            client_credential=config.AZURE_AD_CLIENT_SECRET,
        )
    return _MSAL_CLIENT


def _get_filtered_scopes():
    reserved = {'openid', 'profile', 'offline_access'}
    return [s for s in (config.AZURE_AD_SCOPES or []) if s not in reserved]


def _extract_email(claims: dict) -> Optional[str]:
    for key in ('email', 'preferred_username', 'upn'):
        val = claims.get(key)
        if val:
            return val.lower()
    return None


@auth_microsoft_ns.route('/login')
class MicrosoftLogin(Resource):
    @cross_origin(origins=['*'], methods=['GET', 'OPTIONS'], supports_credentials=True)
    @rate_limit(max_requests=10, window=60)
    def get(self):
        """Initiate Microsoft SSO flow."""
        client = _get_msal_client()
        if not client:
            return {'success': False, 'message': 'Microsoft SSO is not configured'}, 503

        state = generate_state()
        auth_url = client.get_authorization_request_url(
            scopes=_get_filtered_scopes(),
            state=state,
            redirect_uri=config.AZURE_AD_REDIRECT_URI,
            prompt='select_account',
        )
        return {'success': True, 'data': {'authorization_url': auth_url}}, 200


@auth_microsoft_ns.route('/callback')
class MicrosoftCallback(Resource):
    @auth_microsoft_ns.doc(False)
    @rate_limit(max_requests=10, window=60)
    def get(self):
        """Handle Microsoft OAuth redirect."""
        error = request.args.get('error')
        if error:
            desc = request.args.get('error_description', error)
            return redirect(build_b2c_redirect(success='false', error=desc))

        if not validate_state(request.args.get('state')):
            return redirect(build_b2c_redirect(success='false', error='invalid_state'))

        code = request.args.get('code')
        if not code:
            return redirect(build_b2c_redirect(success='false', error='missing_code'))

        client = _get_msal_client()
        if not client:
            return redirect(build_b2c_redirect(success='false', error='sso_not_configured'))

        try:
            result = client.acquire_token_by_authorization_code(
                code, scopes=_get_filtered_scopes(),
                redirect_uri=config.AZURE_AD_REDIRECT_URI,
            )
        except Exception as exc:
            return redirect(build_b2c_redirect(success='false', error=str(exc)))

        if 'error' in result:
            err = result.get('error_description', result.get('error', 'unknown'))
            return redirect(build_b2c_redirect(success='false', error=err))

        claims = result.get('id_token_claims', {})
        email = _extract_email(claims)
        if not email:
            return redirect(build_b2c_redirect(success='false', error='email_not_found'))

        return handle_sso_callback(email, claims.get('name', ''), 'microsoft')


@auth_microsoft_ns.route('/complete-registration')
class MicrosoftCompleteRegistration(Resource):
    def post(self):
        """Complete registration for a new Microsoft SSO user."""
        return complete_registration(request.get_json(), 'microsoft')
