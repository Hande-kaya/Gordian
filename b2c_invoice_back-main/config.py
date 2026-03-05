import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Config:
    """Configuration for Invoice Management Backend"""

    # Flask
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key')
    DEBUG = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'

    # JWT - MUST match Portal and other backends
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', SECRET_KEY)
    JWT_ALGORITHM = 'HS256'
    JWT_ACCESS_TOKEN_EXPIRES = 86400  # 24 hours

    # MongoDB - Same database as Portal/RFQ/Invoice Checker
    MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017/rfq-project-v2')
    MONGODB_DB = os.getenv('MONGODB_DB', 'rfg-project')

    # Portal
    PORTAL_API_URL = os.getenv('PORTAL_API_URL', 'http://localhost:5002')
    PORTAL_FRONTEND_URL = os.getenv('PORTAL_FRONTEND_URL', 'http://localhost:3001')

    # Frontend
    FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3003')

    # B2C Frontend
    B2C_FRONTEND_URL = os.getenv('B2C_FRONTEND_URL', 'http://localhost:3003')

    # CORS
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', 'http://localhost:3003,http://localhost:3001,http://localhost:3005,https://b2c-invoice-front.pages.dev').split(',')

    # Server - Port 5004 for Invoice Management
    PORT = int(os.getenv('PORT', 5004))

    # Email (Zepto Mail)
    ZEPTO_API_KEY = os.getenv('ZEPTO_API_KEY', '')
    ZEPTO_FROM_EMAIL = os.getenv('ZEPTO_FROM_EMAIL', 'noreply@gordiananalytics.com')
    ZEPTO_FROM_NAME = os.getenv('ZEPTO_FROM_NAME', 'Gordian Analytics')

    # Azure AD (Microsoft SSO) - same app registration as Portal
    AZURE_AD_CLIENT_ID = os.getenv('AZURE_AD_CLIENT_ID', '')
    AZURE_AD_CLIENT_SECRET = os.getenv('AZURE_AD_CLIENT_SECRET', '')
    AZURE_AD_REDIRECT_URI = os.getenv('AZURE_AD_REDIRECT_URI', 'http://localhost:5004/api/auth/microsoft/callback')
    AZURE_AD_SCOPES = [s.strip() for s in os.getenv('AZURE_AD_SCOPES', 'openid,profile,email').split(',') if s.strip()]

    # Google OAuth2
    GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', '')
    GOOGLE_CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET', '')
    GOOGLE_REDIRECT_URI = os.getenv('GOOGLE_REDIRECT_URI', 'http://localhost:5004/api/auth/google/callback')

    # Password hashing
    BCRYPT_ROUNDS = int(os.getenv('BCRYPT_ROUNDS', '12'))

    # Stripe
    STRIPE_SECRET_KEY = os.getenv('STRIPE_SECRET_KEY', '')
    STRIPE_PUBLISHABLE_KEY = os.getenv('STRIPE_PUBLISHABLE_KEY', '')
    STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET', '')
    STRIPE_PRODUCT_ID = os.getenv('STRIPE_PRODUCT_ID', 'prod_U34yIIN4BD7NIZ')
    STRIPE_CREDIT_PACK_PRICE_ID = os.getenv('STRIPE_CREDIT_PACK_PRICE_ID', '')

    # File Upload
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    ALLOWED_EXTENSIONS = {
        'pdf', 'png', 'jpg', 'jpeg',
        'webp', 'heic', 'heif', 'bmp', 'gif', 'tiff', 'tif',
    }

    # Storage (gridfs, local, s3) - for future flexibility
    STORAGE_BACKEND = os.getenv('STORAGE_BACKEND', 'gridfs')

    # Google Cloud Document AI
    GCP_PROJECT_ID = os.getenv('GCP_PROJECT_ID', 'eco-muse-486406-i1')
    GCP_LOCATION = os.getenv('GCP_LOCATION', 'eu')
    GCP_PROCESSOR_ID = os.getenv('GCP_PROCESSOR_ID', '4bbdf8b1ccd53c4a')
    GOOGLE_APPLICATION_CREDENTIALS = os.getenv('GOOGLE_APPLICATION_CREDENTIALS', '')

config = Config()
