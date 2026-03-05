"""
Reconciliation Repository — CRUD for reconciliation_matches collection.
No business logic, pure DB operations.
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from pymongo.errors import BulkWriteError

from database import get_collection

logger = logging.getLogger(__name__)


class ReconciliationRepository:
    COLLECTION = 'reconciliation_matches'

    def create_matches_bulk(self, matches: List[Dict[str, Any]]) -> int:
        """Insert multiple match documents. Returns inserted count.

        Uses ordered=False so duplicates don't block other inserts.
        BulkWriteError is caught — partial success is normal when
        re-matching with preserve_all mode.
        """
        if not matches:
            return 0

        collection = get_collection(self.COLLECTION)
        now = datetime.utcnow()
        for m in matches:
            m['created_at'] = now
            m['updated_at'] = now

        try:
            result = collection.insert_many(matches, ordered=False)
            return len(result.inserted_ids)
        except BulkWriteError as e:
            n_inserted = e.details.get('nInserted', 0)
            n_errors = len(e.details.get('writeErrors', []))
            logger.warning(
                "BulkWriteError: %d inserted, %d duplicates skipped",
                n_inserted, n_errors,
            )
            return n_inserted

    def get_matches_by_company(
        self,
        company_id: str,
        page: int = 1,
        page_size: int = 50,
        status: Optional[str] = None,
        match_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Paginated match list for a company."""
        collection = get_collection(self.COLLECTION)

        try:
            company_oid = ObjectId(company_id)
        except Exception:
            return {'matches': [], 'total': 0, 'page': page, 'page_size': page_size}

        query: Dict[str, Any] = {'company_id': company_oid}
        if status and isinstance(status, str):
            query['status'] = status
        if match_type and isinstance(match_type, str):
            query['match_type'] = match_type

        page_size = min(max(1, page_size), 100)
        skip = (page - 1) * page_size

        items = list(
            collection
            .find(query)
            .sort('score.total_score', -1)
            .skip(skip)
            .limit(page_size)
        )
        total = collection.count_documents(query)

        return {
            'matches': [self._transform_match(m) for m in items],
            'total': total,
            'page': page,
            'page_size': page_size,
            'has_next': skip + page_size < total,
            'has_prev': page > 1,
        }

    def delete_match(self, match_id: str, company_id: str) -> bool:
        """Delete a single match. Returns True if deleted."""
        collection = get_collection(self.COLLECTION)

        try:
            match_oid = ObjectId(match_id)
            company_oid = ObjectId(company_id)
        except Exception:
            return False

        result = collection.delete_one({
            '_id': match_oid,
            'company_id': company_oid,
        })
        return result.deleted_count > 0

    def delete_auto_matches_by_company(self, company_id: str) -> int:
        """Delete only auto matches for a company. Manual/confirmed are preserved."""
        collection = get_collection(self.COLLECTION)

        try:
            company_oid = ObjectId(company_id)
        except Exception:
            return 0

        result = collection.delete_many({
            'company_id': company_oid,
            'status': 'auto',
        })
        return result.deleted_count

    def delete_all_matches_by_company(self, company_id: str) -> int:
        """Delete ALL matches for a company (fresh re-match)."""
        collection = get_collection(self.COLLECTION)

        try:
            company_oid = ObjectId(company_id)
        except Exception:
            return 0

        result = collection.delete_many({'company_id': company_oid})
        return result.deleted_count

    def delete_non_manual_matches(self, company_id: str) -> int:
        """Delete auto-generated matches, keep manually linked ones.

        Handles both new format (source field) and legacy (status field).
        """
        collection = get_collection(self.COLLECTION)

        try:
            company_oid = ObjectId(company_id)
        except Exception:
            return 0

        result = collection.delete_many({
            'company_id': company_oid,
            '$or': [
                {'source': 'auto'},
                {'source': {'$exists': False}, 'status': 'auto'},
            ],
        })
        return result.deleted_count

    def delete_matches_by_document_id(self, document_id: str, company_id: str) -> int:
        """Delete all matches referencing a document. Called on doc deletion."""
        collection = get_collection(self.COLLECTION)
        try:
            doc_oid = ObjectId(document_id)
            company_oid = ObjectId(company_id)
        except Exception:
            return 0
        result = collection.delete_many({
            'company_id': company_oid,
            'document_ref.document_id': doc_oid,
        })
        return result.deleted_count

    def find_matches_by_transaction(
        self, company_id: str, statement_id: str, tx_index: int
    ) -> List[Dict[str, Any]]:
        """Return all matches for a transaction (supports multi-link)."""
        collection = get_collection(self.COLLECTION)

        try:
            company_oid = ObjectId(company_id)
            stmt_oid = ObjectId(statement_id)
        except Exception:
            return []

        docs = list(collection.find({
            'company_id': company_oid,
            'transaction_ref.statement_id': stmt_oid,
            'transaction_ref.tx_index': tx_index,
        }))
        return [self._transform_match(d) for d in docs]

    def find_match_by_transaction_and_document(
        self, company_id: str, statement_id: str, tx_index: int,
        document_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Check if a specific (tx, doc) pair already exists."""
        collection = get_collection(self.COLLECTION)

        try:
            company_oid = ObjectId(company_id)
            stmt_oid = ObjectId(statement_id)
            doc_oid = ObjectId(document_id)
        except Exception:
            return None

        doc = collection.find_one({
            'company_id': company_oid,
            'transaction_ref.statement_id': stmt_oid,
            'transaction_ref.tx_index': tx_index,
            'document_ref.document_id': doc_oid,
        })
        return self._transform_match(doc) if doc else None

    def create_match(self, match_doc: Dict[str, Any]) -> Optional[str]:
        """Insert a single match document. Returns inserted ID string."""
        collection = get_collection(self.COLLECTION)
        now = datetime.utcnow()
        match_doc['created_at'] = now
        match_doc['updated_at'] = now

        result = collection.insert_one(match_doc)
        return str(result.inserted_id) if result.inserted_id else None

    def update_match_status(
        self, match_id: str, company_id: str, new_status: str
    ) -> bool:
        """Update match status (confirmed/rejected). Returns True if updated."""
        collection = get_collection(self.COLLECTION)

        try:
            match_oid = ObjectId(match_id)
            company_oid = ObjectId(company_id)
        except Exception:
            return False

        result = collection.update_one(
            {'_id': match_oid, 'company_id': company_oid},
            {'$set': {'status': new_status, 'updated_at': datetime.utcnow()}},
        )
        return result.modified_count > 0

    def get_all_matches_for_company(self, company_id: str) -> List[Dict[str, Any]]:
        """Get all matches for a company (no pagination, for lookup dict)."""
        collection = get_collection(self.COLLECTION)

        try:
            company_oid = ObjectId(company_id)
        except Exception:
            return []

        items = list(collection.find({'company_id': company_oid}))
        return [self._transform_match(m) for m in items]

    def delete_matches_except_ids(
        self, company_id: str, preserve_ids: List[str]
    ) -> int:
        """Delete all matches for a company EXCEPT those in preserve_ids."""
        collection = get_collection(self.COLLECTION)

        try:
            company_oid = ObjectId(company_id)
            keep_oids = [ObjectId(mid) for mid in preserve_ids]
        except Exception:
            return 0

        query: Dict[str, Any] = {'company_id': company_oid}
        if keep_oids:
            query['_id'] = {'$nin': keep_oids}

        result = collection.delete_many(query)
        return result.deleted_count

    def _transform_match(self, match: Dict[str, Any]) -> Dict[str, Any]:
        """Convert ObjectIds and datetimes to strings for API response."""
        m = dict(match)
        m['_id'] = str(m['_id'])
        m['company_id'] = str(m['company_id'])
        m['user_id'] = str(m['user_id'])

        tx_ref = m.get('transaction_ref', {})
        if 'statement_id' in tx_ref and isinstance(tx_ref['statement_id'], ObjectId):
            tx_ref['statement_id'] = str(tx_ref['statement_id'])

        doc_ref = m.get('document_ref', {})
        if 'document_id' in doc_ref and isinstance(doc_ref['document_id'], ObjectId):
            doc_ref['document_id'] = str(doc_ref['document_id'])

        for key in ('created_at', 'updated_at'):
            if isinstance(m.get(key), datetime):
                m[key] = m[key].isoformat()

        return m
