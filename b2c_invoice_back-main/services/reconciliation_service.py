"""Reconciliation Service — matching orchestration."""

import logging
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId

from database import get_collection
from repositories.reconciliation_repository import ReconciliationRepository
from services.reconciliation_matcher import find_optimal_matches
from services.reconciliation_ai_verify import verify_matches
from services.reconciliation_helpers import (
    DOC_PROJECTION as _DOC_PROJECTION,
    get_doc_amount as _get_doc_amount,
    get_doc_date as _get_doc_date,
    get_doc_vendor as _get_doc_vendor,
    get_doc_receiver as _get_doc_receiver,
    get_doc_filename as _get_doc_filename,
    tx_to_input as _tx_to_input,
    doc_to_input as _doc_to_input,
    build_match_doc as _build_match_doc,
)

logger = logging.getLogger(__name__)

_repo = ReconciliationRepository()


class ReconciliationService:

    def get_matching_status(self, company_id: str) -> bool:
        """Check if matching is currently in progress for a company."""
        try:
            company_oid = ObjectId(company_id)
        except Exception:
            return False
        companies = get_collection('companies')
        doc = companies.find_one(
            {'_id': company_oid},
            {'matching_in_progress': 1},
        )
        return bool(doc and doc.get('matching_in_progress'))

    def _acquire_matching_lock(self, company_oid: ObjectId) -> bool:
        """Atomically acquire matching lock. Returns True if acquired."""
        companies = get_collection('companies')
        result = companies.find_one_and_update(
            {'_id': company_oid, 'matching_in_progress': {'$ne': True}},
            {'$set': {'matching_in_progress': True}},
        )
        return result is not None

    def _release_matching_lock(self, company_oid: ObjectId) -> None:
        """Release matching lock."""
        companies = get_collection('companies')
        companies.update_one(
            {'_id': company_oid},
            {'$set': {'matching_in_progress': False}},
        )

    def run_matching(
        self,
        company_id: str,
        user_id: str,
        bank_statement_ids: Optional[List[str]] = None,
        expense_ids: Optional[List[str]] = None,
        income_ids: Optional[List[str]] = None,
        rematch_mode: str = 'preserve_all',
        language: str = 'en',
        preserve_match_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Run full reconciliation matching."""
        try:
            company_oid = ObjectId(company_id)
            user_oid = ObjectId(user_id)
        except Exception:
            return {'success': False, 'message': 'Invalid company or user ID'}

        # Acquire company-level lock (atomic, race-free)
        if not self._acquire_matching_lock(company_oid):
            return {'success': False, 'message': 'Matching already in progress'}

        try:
            return self._run_matching_inner(
                company_id, company_oid, user_oid,
                bank_statement_ids, expense_ids, income_ids,
                rematch_mode, language, preserve_match_ids,
            )
        finally:
            self._release_matching_lock(company_oid)

    def _run_matching_inner(
        self,
        company_id: str,
        company_oid: ObjectId,
        user_oid: ObjectId,
        bank_statement_ids: Optional[List[str]],
        expense_ids: Optional[List[str]],
        income_ids: Optional[List[str]],
        rematch_mode: str,
        language: str,
        preserve_match_ids: Optional[List[str]],
    ) -> Dict[str, Any]:
        """Core matching logic (called under lock)."""
        # 1. Handle existing matches based on rematch_mode
        locked_keys: set = set()
        locked_doc_ids: set = set()

        if rematch_mode == 'keep_selected':
            ids = preserve_match_ids or []
            deleted = _repo.delete_matches_except_ids(company_id, ids)
            logger.info(f"Selective re-match: deleted {deleted}, kept {len(ids)}")
            remaining = _repo.get_all_matches_for_company(company_id)
            self._lock_remaining_matches(remaining, locked_keys, locked_doc_ids)
        elif rematch_mode == 'preserve_all':
            existing = _repo.get_all_matches_for_company(company_id)
            self._lock_remaining_matches(existing, locked_keys, locked_doc_ids)
            logger.info(f"Preserving {len(locked_keys)} existing matches")
        elif rematch_mode == 'keep_manual':
            deleted = _repo.delete_non_manual_matches(company_id)
            logger.info(f"Deleted {deleted} auto matches, keeping manual")
            remaining = _repo.get_all_matches_for_company(company_id)
            self._lock_remaining_matches(remaining, locked_keys, locked_doc_ids)
        else:
            deleted = _repo.delete_all_matches_by_company(company_id)
            logger.info(f"Fresh re-match: deleted {deleted} matches")

        # 2. Fetch bank statement transactions
        transactions, tx_refs = self._extract_transactions(
            company_oid, bank_statement_ids
        )
        if not transactions:
            return {
                'success': True,
                'message': 'No completed bank statement transactions found',
                'matches_created': 0,
                'summary': {'total_tx': 0, 'matched': 0, 'unmatched': 0},
            }

        # 3. Fetch expense + income documents
        expenses = self._fetch_documents(company_oid, 'invoice', expense_ids)
        incomes = self._fetch_documents(company_oid, 'income', income_ids)

        # Filter out docs already locked by manual/confirmed matches
        expenses = [d for d in expenses if str(d['_id']) not in locked_doc_ids]
        incomes = [d for d in incomes if str(d['_id']) not in locked_doc_ids]

        # 4. Split transactions (skip locked ones)
        debit_indices = []
        credit_indices = []
        for i, tx in enumerate(transactions):
            key = (str(tx_refs[i]['statement_id']), tx_refs[i]['tx_index'])
            if key in locked_keys:
                continue
            is_credit = tx.get('type') == 'credit' or float(tx.get('amount', 0)) < 0
            if is_credit:
                credit_indices.append(i)
            else:
                debit_indices.append(i)

        # 5. Match debit→expense, credit→income
        all_match_docs = []

        if debit_indices and expenses:
            debit_txs = [_tx_to_input(transactions[i]) for i in debit_indices]
            expense_inputs = [_doc_to_input(d, 'expense') for d in expenses]
            result = find_optimal_matches(debit_txs, expense_inputs)
            if result.get('error'):
                return {'success': False, 'message': result['error']}

            for m in result['matches']:
                orig_tx_idx = debit_indices[m['tx_index']]
                doc = expenses[m['doc_index']]
                all_match_docs.append(_build_match_doc(
                    company_oid, user_oid,
                    transactions[orig_tx_idx], tx_refs[orig_tx_idx],
                    doc, m, 'expense',
                ))

        if credit_indices and incomes:
            credit_txs = [_tx_to_input(transactions[i]) for i in credit_indices]
            income_inputs = [_doc_to_input(d, 'income') for d in incomes]
            result = find_optimal_matches(credit_txs, income_inputs)
            if result.get('error'):
                return {'success': False, 'message': result['error']}

            for m in result['matches']:
                orig_tx_idx = credit_indices[m['tx_index']]
                doc = incomes[m['doc_index']]
                all_match_docs.append(_build_match_doc(
                    company_oid, user_oid,
                    transactions[orig_tx_idx], tx_refs[orig_tx_idx],
                    doc, m, 'income',
                ))

        # 6. AI verification + notes for all matches
        if all_match_docs:
            verify_matches(all_match_docs, language=language)

        # 7. Save
        created = _repo.create_matches_bulk(all_match_docs)

        total_tx = len(transactions)
        matched = created
        summary = {
            'total_tx': total_tx,
            'matched': matched,
            'unmatched': total_tx - matched,
            'expenses_count': len(expenses),
            'incomes_count': len(incomes),
        }

        logger.info(f"Reconciliation complete: {summary}")
        return {
            'success': True,
            'matches_created': created,
            'summary': summary,
        }

    def get_matches(
        self,
        company_id: str,
        page: int = 1,
        page_size: int = 50,
        status: Optional[str] = None,
        match_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        return _repo.get_matches_by_company(
            company_id, page, page_size, status, match_type
        )

    def delete_match(self, match_id: str, company_id: str) -> bool:
        return _repo.delete_match(match_id, company_id)

    def get_all_transactions(
        self,
        company_id: str,
        page: int = 1,
        page_size: int = 50,
        filter_status: str = 'all',
    ) -> Dict[str, Any]:
        """
        Unified transaction list with match info.
        Returns all bank-statement transactions + their match (or null).
        """
        try:
            company_oid = ObjectId(company_id)
        except Exception:
            return {'transactions': [], 'total': 0, 'page': page,
                    'page_size': page_size, 'summary': {}}

        # 1. Fetch all transactions from completed bank statements
        transactions, tx_refs = self._extract_transactions(company_oid, None)

        # 2. Build match lookup: (statement_id, tx_index) → [matches]
        all_matches = _repo.get_all_matches_for_company(company_id)
        match_lookup: Dict[tuple, list] = defaultdict(list)
        for m in all_matches:
            tr = m.get('transaction_ref', {})
            key = (str(tr.get('statement_id')), tr.get('tx_index'))
            match_lookup[key].append(m)

        # 3. Enrich each transaction
        enriched = []
        for i, tx in enumerate(transactions):
            ref = tx_refs[i]
            stmt_id_str = str(ref['statement_id'])
            key = (stmt_id_str, ref['tx_index'])
            matches = match_lookup.get(key, [])

            enriched.append({
                'statement_id': stmt_id_str,
                'tx_index': ref['tx_index'],
                'date': tx.get('date'),
                'description': tx.get('description'),
                'amount': float(tx.get('amount', 0)),
                'type': tx.get('type', 'debit'),
                'bank_name': tx.get('bank_name', ''),
                'currency': ref.get('currency') or None,
                'page': tx.get('page'), 'y_min': tx.get('y_min'), 'y_max': tx.get('y_max'),
                'matches': matches,
                'match': matches[0] if matches else None,
            })

        # 4. Filter
        matched_count = sum(1 for e in enriched if e['matches'])
        unmatched_count = len(enriched) - matched_count

        if filter_status == 'matched':
            enriched = [e for e in enriched if e['matches']]
        elif filter_status == 'unmatched':
            enriched = [e for e in enriched if not e['matches']]

        total = len(enriched)

        # 5. Paginate
        page_size = min(max(1, page_size), 100)
        start = (page - 1) * page_size
        page_items = enriched[start:start + page_size]

        return {
            'transactions': page_items,
            'total': total,
            'page': page,
            'page_size': page_size,
            'summary': {
                'total': len(transactions),
                'matched': matched_count,
                'unmatched': unmatched_count,
            },
        }

    def create_manual_match(
        self,
        company_id: str,
        user_id: str,
        statement_id: str,
        tx_index: int,
        document_id: str,
    ) -> Dict[str, Any]:
        """Create a manual match between a transaction and a document."""
        try:
            company_oid = ObjectId(company_id)
            user_oid = ObjectId(user_id)
            stmt_oid = ObjectId(statement_id)
            doc_oid = ObjectId(document_id)
        except Exception:
            return {'success': False, 'message': 'Invalid ID format'}

        # Validate bank statement + tx
        collection = get_collection('documents')
        stmt = collection.find_one({
            '_id': stmt_oid,
            'company_id': company_oid,
            'type': 'bank-statement',
        }, {'extracted_data': 1})
        if not stmt:
            return {'success': False, 'message': 'Bank statement not found'}

        txs = (stmt.get('extracted_data') or {}).get('transactions') or []
        if tx_index < 0 or tx_index >= len(txs):
            return {'success': False, 'message': 'Transaction index out of range'}

        tx = txs[tx_index]

        # Validate document
        doc = collection.find_one({
            '_id': doc_oid,
            'company_id': company_oid,
            'deleted_at': {'$exists': False},
        }, _DOC_PROJECTION)
        if not doc:
            return {'success': False, 'message': 'Document not found'}

        # Duplicate check: same document already linked to this transaction?
        existing = _repo.find_match_by_transaction_and_document(
            company_id, statement_id, tx_index, document_id,
        )
        if existing:
            return {'success': False, 'message': 'Document already linked to this transaction'}

        # Determine match type
        is_credit = tx.get('type') == 'credit' or float(tx.get('amount', 0)) < 0
        match_type = 'income' if is_credit else 'expense'

        match_doc = {
            'company_id': company_oid,
            'user_id': user_oid,
            'transaction_ref': {
                'statement_id': stmt_oid,
                'tx_index': tx_index,
                'date': tx.get('date'),
                'description': tx.get('description'),
                'amount': float(tx.get('amount', 0)),
                'type': tx.get('type', 'debit'),
            },
            'document_ref': {
                'document_id': doc_oid,
                'filename': _get_doc_filename(doc),
                'amount': _get_doc_amount(doc),
                'date': _get_doc_date(doc),
                'vendor_name': _get_doc_vendor(doc),
                'receiver_name': _get_doc_receiver(doc),
            },
            'match_type': match_type,
            'score': {
                'total_score': 1.0,
                'data_quality': 1.0,
                'breakdown': {'amount': 0, 'date': 0, 'description': 0},
            },
            'status': 'confirmed',
            'source': 'manual',
        }

        match_id = _repo.create_match(match_doc)
        if not match_id:
            return {'success': False, 'message': 'Failed to create match'}

        return {'success': True, 'match_id': match_id}

    def update_match_status(
        self, match_id: str, company_id: str, new_status: str,
    ) -> Dict[str, Any]:
        """Update match status (confirmed / rejected)."""
        valid = ('confirmed', 'rejected')
        if new_status not in valid:
            return {'success': False, 'message': f'Invalid status. Must be one of {valid}'}

        updated = _repo.update_match_status(match_id, company_id, new_status)
        if not updated:
            return {'success': False, 'message': 'Match not found'}

        return {'success': True}

    # ---- Private helpers ----

    @staticmethod
    def _lock_remaining_matches(
        matches: List[Dict], locked_keys: set, locked_doc_ids: set,
    ) -> None:
        """Build lock sets from remaining matches to skip during re-matching."""
        for m in matches:
            tr = m.get('transaction_ref', {})
            locked_keys.add((str(tr.get('statement_id')), tr.get('tx_index')))
            dr = m.get('document_ref', {})
            locked_doc_ids.add(str(dr.get('document_id')))

    def _extract_transactions(
        self, company_oid: ObjectId, statement_ids: Optional[List[str]]
    ) -> tuple:
        """
        Extract transactions from completed bank statements.
        Returns (flat_transactions, tx_refs) — parallel lists.
        """
        collection = get_collection('documents')
        query: Dict[str, Any] = {
            'company_id': company_oid,
            'type': 'bank-statement',
            'ocr_status': 'completed',
            'deleted_at': {'$exists': False},
        }
        if statement_ids:
            try:
                query['_id'] = {'$in': [ObjectId(sid) for sid in statement_ids]}
            except Exception:
                pass

        statements = list(collection.find(query, {
            '_id': 1, 'extracted_data': 1, 'filename': 1, 'file_name': 1,
        }))

        transactions = []
        tx_refs = []

        for stmt in statements:
            stmt_id = stmt['_id']
            ed = stmt.get('extracted_data') or {}
            txs = ed.get('transactions') or []
            currency = ed.get('currency') or None

            for idx, tx in enumerate(txs):
                # Carry normalized_amount for cross-currency matching
                if 'normalized_amount' not in tx and currency:
                    tx['_stmt_currency'] = currency
                transactions.append(tx)
                tx_refs.append({
                    'statement_id': stmt_id,
                    'tx_index': idx,
                    'currency': currency,
                })

        return transactions, tx_refs

    def _fetch_documents(
        self, company_oid: ObjectId, doc_type: str,
        doc_ids: Optional[List[str]] = None,
    ) -> List[Dict]:
        """Fetch expense or income documents with projection."""
        collection = get_collection('documents')
        query: Dict[str, Any] = {
            'company_id': company_oid,
            'type': doc_type,
            'deleted_at': {'$exists': False},
        }
        if doc_ids:
            try:
                query['_id'] = {'$in': [ObjectId(did) for did in doc_ids]}
            except Exception:
                pass

        return list(collection.find(query, _DOC_PROJECTION))


# Singleton
_service = ReconciliationService()


def get_reconciliation_service() -> ReconciliationService:
    return _service
