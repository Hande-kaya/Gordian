import certifi
from pymongo import MongoClient
import gridfs
from config import config

# MongoDB client instance
client = None
db = None
fs = None

def init_db():
    """Initialize MongoDB connection"""
    global client, db, fs

    try:
        # Check if connecting to localhost (no SSL needed) or cloud (SSL needed)
        mongo_uri = config.MONGO_URI
        is_local = 'localhost' in mongo_uri or '127.0.0.1' in mongo_uri

        if is_local:
            # Local MongoDB - no SSL
            client = MongoClient(
                mongo_uri,
                maxPoolSize=20, minPoolSize=5
            )
        else:
            # Cloud MongoDB (Atlas) - use SSL with certifi
            client = MongoClient(
                mongo_uri,
                tlsCAFile=certifi.where(),
                maxPoolSize=20, minPoolSize=5
            )

        # Extract database name from URI or use configured name
        db_name = config.MONGODB_DB
        if '/' in config.MONGO_URI:
            uri_db = config.MONGO_URI.split('/')[-1].split('?')[0]
            if uri_db:
                db_name = uri_db

        db = client[db_name]
        fs = gridfs.GridFS(db)

        # Test connection
        client.admin.command('ping')
        print(f"Connected to MongoDB: {db_name}")

        # TTL index: auto-delete expired OAuth states
        db['oauth_states'].create_index('expires_at', expireAfterSeconds=0)

        # TTL index: auto-delete expired rate limit records
        db['rate_limits'].create_index('expires_at', expireAfterSeconds=0)

        # TTL index: auto-delete expired blacklisted tokens
        db['token_blacklist'].create_index('expires_at', expireAfterSeconds=0)

        # Reconciliation indexes
        db['reconciliation_matches'].create_index(
            [('company_id', 1), ('score.total_score', -1)]
        )
        # Fast lookup: all matches for a given transaction
        db['reconciliation_matches'].create_index(
            [('company_id', 1), ('transaction_ref.statement_id', 1),
             ('transaction_ref.tx_index', 1)],
        )
        # Prevent same document linked to same transaction twice
        db['reconciliation_matches'].create_index(
            [('company_id', 1), ('transaction_ref.statement_id', 1),
             ('transaction_ref.tx_index', 1), ('document_ref.document_id', 1)],
            unique=True,
        )

        # Exchange rates — unique date index
        db['exchange_rates'].create_index('date', unique=True)

        # Documents collection indexes — critical for list & stats performance
        db['documents'].create_index(
            [('company_id', 1), ('created_at', -1)],
            background=True,
        )
        db['documents'].create_index(
            [('company_id', 1), ('type', 1), ('deleted_at', 1), ('created_at', -1)],
            background=True,
        )
        db['documents'].create_index(
            [('company_id', 1), ('deleted_at', 1)],
            background=True,
        )
        db['documents'].create_index(
            [('company_id', 1), ('ocr_status', 1)],
            background=True,
        )

        # Billing / usage indexes
        db['user_usage'].create_index('user_id', unique=True)
        db['user_usage'].create_index('company_id')
        db['billing_transactions'].create_index([('user_id', 1), ('created_at', -1)])
        db['billing_transactions'].create_index('stripe_session_id', unique=True, sparse=True)

        return True
    except Exception as e:
        print(f"Failed to connect to MongoDB: {e}")
        return False

def get_db():
    """Get database instance"""
    global db
    if db is None:
        init_db()
    return db

def get_gridfs():
    """Get GridFS bucket instance"""
    global fs
    if fs is None:
        init_db()
    return fs

def get_collection(collection_name):
    """Get a specific collection"""
    database = get_db()
    if database is not None:
        return database[collection_name]
    return None
