import os
import json
import base64
import tempfile

# Cloud deployment: decode GCP credentials from env var
# Supports both GCP_CREDENTIALS_JSON (raw JSON) and GCP_CREDENTIALS_BASE64
_gcp_json = os.getenv('GCP_CREDENTIALS_JSON') or ''
_gcp_b64 = os.getenv('GCP_CREDENTIALS_BASE64') or ''
_existing_creds = os.getenv('GOOGLE_APPLICATION_CREDENTIALS') or ''
_need_creds = (_gcp_json or _gcp_b64) and (
    not _existing_creds or not os.path.isfile(_existing_creds)
)
if _need_creds:
    _cred_bytes = _gcp_json.encode('utf-8') if _gcp_json else base64.b64decode(_gcp_b64)
    _cred_file = tempfile.NamedTemporaryFile(delete=False, suffix='.json', prefix='gcp_creds_')
    _cred_file.write(_cred_bytes)
    _cred_file.close()
    os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = _cred_file.name
    print(f"GCP credentials written to {_cred_file.name} ({len(_cred_bytes)} bytes)")

import logging
import sys

# Configure logging so all logger.info/error calls are visible in gunicorn
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    stream=sys.stderr
)

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_restx import Api
from config import config
from database import init_db

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = config.SECRET_KEY
app.config['MAX_CONTENT_LENGTH'] = 12 * 1024 * 1024  # 12MB (slightly above 10MB file limit)

# Configure CORS
CORS(app,
     origins=config.CORS_ORIGINS,
     methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
     allow_headers=['Content-Type', 'Authorization', 'X-Requested-With'],
     supports_credentials=True)


# Disable trailing slash redirects
app.url_map.strict_slashes = False


@app.after_request
def set_security_headers(response):
    """Add security headers to all responses."""
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '0'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    if 'Cache-Control' not in response.headers:
        response.headers['Cache-Control'] = 'no-store'
    return response

# Initialize Flask-RESTX
api = Api(app,
          version='1.0',
          title='Invoice Management API',
          description='API for Invoice Management Module',
          doc='/api/docs')

from utils.auth import token_required

# Health check endpoint
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'success': True,
        'message': 'Invoice Management API is running',
        'version': '1.0.0'
    })

# Protected test endpoint
@app.route('/api/me', methods=['GET'])
@token_required
def get_current_user():
    return jsonify({
        'success': True,
        'data': {
            'user': request.current_user
        }
    })

# Import and register routes
from routes.invoices import invoice_ns
from routes.documents import document_ns
from routes.auth import auth_ns
from routes.auth_account import auth_account_ns
from routes.auth_microsoft import auth_microsoft_ns
from routes.auth_google import auth_google_ns
from routes.auth_profile import auth_profile_ns
from routes.auth_preferences import auth_prefs_ns
from routes.stats_routes import stats_ns
from routes.categories import category_ns
from routes.reconciliation import reconciliation_ns
from routes.billing import billing_ns
from routes.exchange_rates import exchange_rate_ns

api.add_namespace(invoice_ns, path='/api/invoices')
api.add_namespace(document_ns, path='/api/documents')
api.add_namespace(auth_ns, path='/api/auth')
api.add_namespace(auth_account_ns, path='/api/auth')
api.add_namespace(auth_microsoft_ns, path='/api/auth/microsoft')
api.add_namespace(auth_google_ns, path='/api/auth/google')
api.add_namespace(auth_profile_ns, path='/api/auth')
api.add_namespace(auth_prefs_ns, path='/api/auth')
api.add_namespace(stats_ns, path='/api/stats')
api.add_namespace(category_ns, path='/api/categories')
api.add_namespace(reconciliation_ns, path='/api/reconciliation')
api.add_namespace(billing_ns, path='/api/billing')
api.add_namespace(exchange_rate_ns, path='/api/exchange-rates')

# Initialize database on startup
@app.before_request
def before_first_request():
    if not hasattr(app, '_db_initialized'):
        init_db()
        app._db_initialized = True

# Daily exchange rate update scheduler
def _start_rate_scheduler():
    """Start a background thread that updates exchange rates daily."""
    import threading
    import time
    from services import exchange_rate_service

    def _daily_loop():
        time.sleep(60)  # Wait 1 min after startup
        while True:
            try:
                exchange_rate_service.update_daily()
            except Exception as e:
                logging.getLogger(__name__).warning(f"Daily rate update error: {e}")
            time.sleep(86400)  # 24 hours

    t = threading.Thread(target=_daily_loop, daemon=True, name='rate-scheduler')
    t.start()


if __name__ == '__main__':
    print("=" * 60)
    print("INVOICE MANAGEMENT BACKEND")
    print("=" * 60)
    print(f"Port: {config.PORT}")
    print(f"Debug: {config.DEBUG}")
    print(f"Database: {config.MONGODB_DB}")
    print("=" * 60)

    init_db()
    _start_rate_scheduler()
    app.run(host='0.0.0.0', port=config.PORT, debug=config.DEBUG)
