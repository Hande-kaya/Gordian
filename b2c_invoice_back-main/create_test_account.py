"""
One-time script to create a test account and copy documents from an existing user.
Run: python create_test_account.py
"""

import os
import sys
import bcrypt
import certifi
from datetime import datetime, timezone
from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient
import gridfs

load_dotenv()

MONGO_URI = os.getenv('MONGO_URI')
MONGODB_DB = os.getenv('MONGODB_DB', 'rfg-project')
BCRYPT_ROUNDS = int(os.getenv('BCRYPT_ROUNDS', '12'))

# Config
SOURCE_EMAIL = 'denizkkara7@gmail.com'
TEST_EMAIL = 'test-account@gmail.com'
TEST_PASSWORD = 'test123'
TEST_NAME = 'Test Account'


def main():
    print(f"Connecting to MongoDB...")
    is_local = 'localhost' in MONGO_URI or '127.0.0.1' in MONGO_URI
    if is_local:
        client = MongoClient(MONGO_URI)
    else:
        client = MongoClient(MONGO_URI, tlsCAFile=certifi.where())

    # Extract DB name from URI
    db_name = MONGODB_DB
    if '/' in MONGO_URI:
        uri_db = MONGO_URI.split('/')[-1].split('?')[0]
        if uri_db:
            db_name = uri_db
    db = client[db_name]
    fs = gridfs.GridFS(db)

    users = db['users']
    companies = db['companies']
    documents = db['documents']

    # Check if test account already exists
    existing = users.find_one({'email': TEST_EMAIL})
    if existing:
        print(f"Test account {TEST_EMAIL} already exists. Aborting.")
        sys.exit(0)

    # Find source user
    source_user = users.find_one({'email': SOURCE_EMAIL})
    if not source_user:
        print(f"Source user {SOURCE_EMAIL} not found. Aborting.")
        sys.exit(1)

    source_company_id = source_user['company_id']
    print(f"Found source user: {source_user['name']} (company: {source_company_id})")

    # Generate next user_id
    last_user = users.find_one(sort=[('created_at', -1)])
    if last_user and 'user_id' in last_user:
        last_num = int(last_user['user_id'].split('-')[1])
        new_user_id = f"USR-{last_num + 1}"
    else:
        new_user_id = "USR-100"

    # Hash password
    password_hash = bcrypt.hashpw(
        TEST_PASSWORD.encode('utf-8'),
        bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
    )

    now = datetime.now(timezone.utc)
    test_user_oid = ObjectId()
    test_company_oid = ObjectId()

    # Create virtual company
    company_doc = {
        '_id': test_company_oid,
        'name': f"{TEST_NAME} ({test_user_oid})",
        'email': f"virtual_{test_user_oid}@b2c.local",
        'type': 'virtual',
        'created_by': test_user_oid,
        'is_active': True,
        'roles': [],
        'created_at': now,
        'updated_at': now,
    }
    companies.insert_one(company_doc)
    print(f"Created virtual company: {test_company_oid}")

    # Create test user
    user_doc = {
        '_id': test_user_oid,
        'user_id': new_user_id,
        'name': TEST_NAME,
        'email': TEST_EMAIL,
        'password_hash': password_hash,
        'is_verified': True,
        'is_active': True,
        'signup_type': 'independent',
        'account_type': 'b2c',
        'role': 'user',
        'preferences': {
            'onboarding_completed': True,
            'theme': 'system',
            'language': 'en',
        },
        'company_id': test_company_oid,
        'created_at': now,
        'updated_at': now,
    }
    users.insert_one(user_doc)
    print(f"Created test user: {TEST_EMAIL} ({new_user_id})")

    # Copy documents from source user
    source_docs = list(documents.find({
        'company_id': source_company_id,
        'deleted_at': None
    }))
    print(f"Found {len(source_docs)} documents to copy")

    # Map old doc IDs to new doc IDs (for parent-child relationships)
    id_map = {}

    for doc in source_docs:
        old_id = doc['_id']
        new_id = ObjectId()
        id_map[old_id] = new_id

    copied = 0
    for doc in source_docs:
        old_id = doc['_id']
        new_id = id_map[old_id]

        # Copy GridFS file if exists
        new_file_ref = None
        file_ref = doc.get('file_ref') or doc.get('file_id')
        if file_ref:
            try:
                grid_file = fs.get(file_ref)
                file_data = grid_file.read()
                new_file_ref = fs.put(
                    file_data,
                    filename=grid_file.filename,
                    content_type=getattr(grid_file, 'content_type', 'application/octet-stream')
                )
            except Exception as e:
                print(f"  Warning: could not copy file for {doc.get('filename', 'unknown')}: {e}")

        # Build new document
        new_doc = {}
        for key, value in doc.items():
            if key == '_id':
                new_doc['_id'] = new_id
            elif key == 'company_id':
                new_doc['company_id'] = test_company_oid
            elif key == 'user_id':
                new_doc['user_id'] = test_user_oid
            elif key in ('file_ref', 'file_id') and new_file_ref:
                new_doc[key] = new_file_ref
            else:
                new_doc[key] = value

        # Update multi-document child references
        multi = new_doc.get('multi_document')
        if multi and 'child_document_ids' in multi:
            new_children = []
            for child_id in multi['child_document_ids']:
                if child_id in id_map:
                    new_children.append(id_map[child_id])
                else:
                    new_children.append(child_id)
            new_doc['multi_document']['child_document_ids'] = new_children

        # Update parent reference
        if 'parent_document_id' in new_doc and new_doc['parent_document_id'] in id_map:
            new_doc['parent_document_id'] = id_map[new_doc['parent_document_id']]

        new_doc['created_at'] = now
        new_doc['updated_at'] = now

        documents.insert_one(new_doc)
        copied += 1
        print(f"  Copied: {doc.get('filename', 'unknown')} ({doc.get('type', '?')})")

    # Copy reconciliation matches if any
    matches_col = db['reconciliation_matches']
    source_matches = list(matches_col.find({'company_id': source_company_id}))
    match_count = 0
    for match in source_matches:
        new_match = {}
        for key, value in match.items():
            if key == '_id':
                new_match['_id'] = ObjectId()
            elif key == 'company_id':
                new_match['company_id'] = test_company_oid
            else:
                new_match[key] = value

        # Update document references in match
        if 'document_ref' in new_match and 'document_id' in new_match['document_ref']:
            old_ref = new_match['document_ref']['document_id']
            if old_ref in id_map:
                new_match['document_ref']['document_id'] = id_map[old_ref]

        if 'transaction_ref' in new_match and 'statement_id' in new_match['transaction_ref']:
            old_stmt = new_match['transaction_ref']['statement_id']
            if old_stmt in id_map:
                new_match['transaction_ref']['statement_id'] = id_map[old_stmt]

        new_match['created_at'] = now
        new_match['updated_at'] = now

        try:
            matches_col.insert_one(new_match)
            match_count += 1
        except Exception:
            pass  # Skip duplicates

    # Copy usage record
    usage_col = db['user_usage']
    source_usage = usage_col.find_one({'user_id': source_user['_id']})
    if source_usage:
        new_usage = {
            '_id': ObjectId(),
            'user_id': test_user_oid,
            'company_id': test_company_oid,
            'free_plan': {
                'uploads_limit': 50,
                'uploads_used': 0,
                'regenerates_limit': 20,
                'regenerates_used': 0,
                'period_start': now,
                'period_end': None,
            },
            'credits': {
                'uploads_purchased': 0,
                'uploads_remaining': 0,
                'regenerates_purchased': 0,
                'regenerates_remaining': 0,
            },
            'created_at': now,
            'updated_at': now,
        }
        usage_col.insert_one(new_usage)
        print(f"Created fresh usage record (50 free uploads)")

    print(f"\n{'='*50}")
    print(f"DONE!")
    print(f"{'='*50}")
    print(f"Email:     {TEST_EMAIL}")
    print(f"Password:  {TEST_PASSWORD}")
    print(f"Documents: {copied} copied")
    print(f"Matches:   {match_count} copied")
    print(f"{'='*50}")

    client.close()


if __name__ == '__main__':
    main()
