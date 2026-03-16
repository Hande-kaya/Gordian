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
from services.bank_statement_utils import (
    has_meaningful_description as _has_desc,
)

logger = logging.getLogger(__name__)

_repo = ReconciliationRepository()


def _tx_matches_search(tx: Dict[str, Any], query: str) -> bool:
    """Check if a transaction matches a search query (case-insensitive)."""
    q = query.lower()
    if q in (tx.get('description') or '').lower():
        return True
    if q in (tx.get('bank_name') or '').lower():
        return True
    if q in (tx.get('date') or ''):
        return True
    if q in str(tx.get('amount', '')):
        return True
    for m in tx.get('matches') or []:
        dr = m.get('document_ref') or {}
        if q in (dr.get('filename') or '').lower():
            return True
        if q in (dr.get('vendor_name') or '').lower():
            return True
    return False


def _apply_column_filters(enriched: list, filters: Dict[str, Any]) -> list:
    """Apply text-based column filters — substring match per field."""
    if not filters:
        return enriched

    # Map filter keys to field extractors (all produce lowercase strings)
    def _get_field(tx, key):
        if key == 'date':
            return str(tx.get('date') or '')
        if key == 'description':
            return str(tx.get('description') or '')
        if key == 'type':
            return str(tx.get('type') or '')
        if key == 'amount':
            return str(tx.get('amount', ''))
        if key == 'match_doc':
            # Search in matched document filenames
            matches = tx.get('matches') or []
            return ' '.join(
                str(m.get('document_ref', {}).get('filename', ''))
                for m in matches
            )
        if key == 'confidence':
            matches = tx.get('matches') or []
            parts = []
            for m in matches:
                score = m.get('score', {})
                parts.append(str(score.get('total_score', '')))
                parts.append(str(score.get('final_score', '')))
            return ' '.join(parts)
        if key == 'bank_name':
            return str(tx.get('bank_name') or '')
        if key == 'currency':
            return str(tx.get('currency') or '')
        # Fallback: try direct field access
        return str(tx.get(key) or '')

    result = enriched
    for key, query in filters.items():
        q = str(query).lower().strip()
        if not q:
            continue
        # Support range matching for date filter: "YYYY-MM..YYYY-MM"
        if key == 'date' and '..' in q:
            parts = q.split('..')
            range_from = parts[0].strip() if len(parts) > 0 else ''
            range_to = parts[1].strip() if len(parts) > 1 else ''
            def _date_in_range(tx):
                d = _get_field(tx, 'date')
                # Extract YYYY-MM from date string (supports DD.MM.YYYY, YYYY-MM-DD, MM/DD/YYYY etc.)
                import re
                # Try to find a year-month pattern
                m1 = re.search(r'(\d{4})-(\d{1,2})', d)  # YYYY-MM-DD
                m2 = re.search(r'(\d{1,2})[./](\d{1,2})[./](\d{4})', d)  # DD.MM.YYYY or MM/DD/YYYY
                ym = None
                if m1:
                    ym = f"{m1.group(1)}-{m1.group(2).zfill(2)}"
                elif m2:
                    ym = f"{m2.group(3)}-{m2.group(2).zfill(2)}"
                if not ym:
                    return False
                if range_from and ym < range_from:
                    return False
                if range_to and ym > range_to:
                    return False
                return True
            result = [e for e in result if _date_in_range(e)]
        # Support comma-separated OR matching for date filter (multi-month)
        elif key == 'date' and ',' in q:
            parts = [p.strip() for p in q.split(',') if p.strip()]
            result = [
                e for e in result
                if any(p in _get_field(e, key).lower() for p in parts)
            ]
        else:
            result = [
                e for e in result
                if q in _get_field(e, key).lower()
            ]
    return result


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
        # 0. Clean up stale matches (referencing deleted docs/statements)
        stale_deleted = self._cleanup_stale_matches(company_id, company_oid)
        if stale_deleted:
            logger.info(f"Cleaned up {stale_deleted} stale matches (deleted docs/statements)")

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
        search: str = '',
        filters: Optional[Dict[str, Any]] = None,
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
                'bank_name': ref.get('bank_name') or tx.get('bank_name') or '',
                'currency': ref.get('currency') or None,
                'page': tx.get('page'), 'y_min': tx.get('y_min'), 'y_max': tx.get('y_max'),
                'matches': matches,
                'match': matches[0] if matches else None,
            })

        # 4. Summary counts (before any filtering)
        matched_count = sum(1 for e in enriched if e['matches'])
        unmatched_count = len(enriched) - matched_count

        # 5. Status filter
        if filter_status == 'matched':
            enriched = [e for e in enriched if e['matches']]
        elif filter_status == 'unmatched':
            enriched = [e for e in enriched if not e['matches']]

        # 6. Search filter (after status filter, before pagination)
        if search:
            enriched = [e for e in enriched if _tx_matches_search(e, search)]

        # 6b. Column filters
        if filters:
            enriched = _apply_column_filters(enriched, filters)

        total = len(enriched)

        # 7. Paginate (allow up to 10000 for dashboard aggregation)
        page_size = min(max(1, page_size), 10000)
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

    def _cleanup_stale_matches(
        self, company_id: str, company_oid: ObjectId,
    ) -> int:
        """Delete matches referencing deleted/missing documents or statements.

        When a document or bank statement is deleted, cascade should remove
        its matches. But if cascade failed or was incomplete, stale matches
        linger and block re-matching. This sweep catches them.
        """
        collection = get_collection('documents')
        matches = _repo.get_all_matches_for_company(company_id)
        if not matches:
            return 0

        # Collect all referenced doc IDs and statement IDs
        ref_ids: set = set()
        for m in matches:
            dr = m.get('document_ref', {})
            doc_id = dr.get('document_id')
            if doc_id:
                ref_ids.add(doc_id)
            tr = m.get('transaction_ref', {})
            stmt_id = tr.get('statement_id')
            if stmt_id:
                ref_ids.add(stmt_id)

        if not ref_ids:
            return 0

        # Query which of these IDs still exist and are NOT deleted
        try:
            oids = [ObjectId(rid) for rid in ref_ids]
        except Exception:
            return 0

        alive = set()
        for doc in collection.find(
            {
                '_id': {'$in': oids},
                'company_id': company_oid,
                'deleted_at': {'$exists': False},
            },
            {'_id': 1},
        ):
            alive.add(str(doc['_id']))

        # Delete matches where doc or statement is gone
        stale_count = 0
        match_coll = get_collection(_repo.COLLECTION)
        stale_ids = []
        for m in matches:
            doc_id = (m.get('document_ref') or {}).get('document_id')
            stmt_id = (m.get('transaction_ref') or {}).get('statement_id')
            if (doc_id and doc_id not in alive) or (stmt_id and stmt_id not in alive):
                stale_ids.append(m['_id'])

        if stale_ids:
            try:
                oid_list = [ObjectId(sid) for sid in stale_ids]
                result = match_coll.delete_many({'_id': {'$in': oid_list}})
                stale_count = result.deleted_count
            except Exception as e:
                logger.warning(f"Stale match cleanup failed: {e}")

        return stale_count

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
            'status': {'$ne': 'deleted'},
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
            stmt_bank_name = ed.get('bank_name') or stmt.get('filename') or stmt.get('file_name') or ''

            # Collect known balance amounts from statement header
            _balance_amounts: set = set()
            for _bf in ('opening_balance', 'closing_balance'):
                _bv = ed.get(_bf)
                if _bv is not None:
                    try:
                        _balance_amounts.add(round(abs(float(_bv)), 2))
                    except (ValueError, TypeError):
                        pass

            for idx, tx in enumerate(txs):
                desc = tx.get('description') or ''

                # Structural guard: no real description AND amount matches a
                # known balance → almost certainly a balance line, skip it.
                # If desc has real text (even "BALANCE-xxx"), it passes through.
                if not _has_desc(desc) and _balance_amounts:
                    try:
                        tx_amt = round(abs(float(tx.get('amount', 0))), 2)
                        if tx_amt in _balance_amounts:
                            continue
                    except (ValueError, TypeError):
                        pass

                # Carry normalized_amount for cross-currency matching
                if 'normalized_amount' not in tx and currency:
                    tx['_stmt_currency'] = currency
                transactions.append(tx)
                tx_refs.append({
                    'statement_id': stmt_id,
                    'tx_index': idx,
                    'currency': currency,
                    'bank_name': stmt_bank_name,
                })

        return transactions, tx_refs

    def _fetch_documents(
        self, company_oid: ObjectId, doc_type: str,
        doc_ids: Optional[List[str]] = None,
    ) -> List[Dict]:
        """Fetch expense or income documents with projection.

        Excludes deleted documents via BOTH mechanisms:
        - deleted_at field (document_service soft-delete)
        - status='deleted' (invoice_service soft-delete)
        """
        collection = get_collection('documents')
        query: Dict[str, Any] = {
            'company_id': company_oid,
            'type': doc_type,
            'deleted_at': {'$exists': False},
            'status': {'$ne': 'deleted'},
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
