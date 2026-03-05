"""
Reconciliation Routes — match bank transactions to expense/income docs.

POST  /api/reconciliation/match           — run matching engine
GET   /api/reconciliation/matching-status — check if matching is in progress
GET   /api/reconciliation/matches         — list saved matches (paginated)
DELETE /api/reconciliation/matches/<id>   — remove a single match
GET   /api/reconciliation/transactions    — unified tx list (matched+unmatched)
POST  /api/reconciliation/matches/manual  — manual link
PATCH /api/reconciliation/matches/<id>    — update match status
"""

import logging

from flask import request
from flask_restx import Namespace, Resource

from services.reconciliation_service import get_reconciliation_service
from utils.auth import token_required
from utils.validators import safe_string_param

logger = logging.getLogger(__name__)

reconciliation_ns = Namespace('reconciliation', description='Bank reconciliation')


@reconciliation_ns.route('/match')
class RunMatching(Resource):

    @reconciliation_ns.doc('run_matching')
    @token_required
    def post(self):
        """Run reconciliation matching for the current company."""
        user = request.current_user
        company_id = user.get('company_id')
        user_id = user.get('user_id')

        if not company_id:
            return {'success': False, 'message': 'Company not found'}, 400

        # Rematch quota check
        from services.usage_service import get_usage_service
        quota = get_usage_service().check_rematch_quota(user_id, company_id)
        if not quota['allowed']:
            return {'success': False, 'message': quota['message'], 'code': 'QUOTA_EXCEEDED'}, 402

        body = request.get_json(silent=True) or {}
        bank_statement_ids = body.get('bank_statement_ids')
        expense_ids = body.get('expense_ids')
        income_ids = body.get('income_ids')
        rematch_mode = body.get('rematch_mode', 'preserve_all')
        language = body.get('language', 'en')
        preserve_match_ids = body.get('preserve_match_ids')

        service = get_reconciliation_service()
        result = service.run_matching(
            company_id=company_id,
            user_id=user_id,
            bank_statement_ids=bank_statement_ids,
            expense_ids=expense_ids,
            income_ids=income_ids,
            rematch_mode=rematch_mode,
            language=language,
            preserve_match_ids=preserve_match_ids,
        )

        if not result.get('success'):
            msg = result.get('message', '')
            if 'already in progress' in msg:
                return result, 409
            return result, 400

        # Consume rematch quota
        get_usage_service().consume_rematch(user_id, company_id)

        return {'success': True, 'data': result}, 200


@reconciliation_ns.route('/matching-status')
class MatchingStatus(Resource):

    @reconciliation_ns.doc('matching_status')
    @token_required
    def get(self):
        """Check if matching is currently in progress."""
        user = request.current_user
        company_id = user.get('company_id')

        if not company_id:
            return {'success': False, 'message': 'Company not found'}, 400

        service = get_reconciliation_service()
        in_progress = service.get_matching_status(company_id)

        return {
            'success': True,
            'data': {'matching_in_progress': in_progress},
        }, 200


@reconciliation_ns.route('/matches')
class ListMatches(Resource):

    @reconciliation_ns.doc('list_matches')
    @token_required
    def get(self):
        """List reconciliation matches (paginated)."""
        user = request.current_user
        company_id = user.get('company_id')

        if not company_id:
            return {'success': False, 'message': 'Company not found'}, 400

        try:
            page = int(request.args.get('page', 1))
            page_size = int(request.args.get('page_size', 50))
        except (ValueError, TypeError):
            page, page_size = 1, 50

        status = safe_string_param(
            request.args.get('status'),
            ('confirmed', 'pending', 'rejected'),
        )
        match_type = safe_string_param(
            request.args.get('match_type'),
            ('auto', 'manual'),
        )

        service = get_reconciliation_service()
        result = service.get_matches(
            company_id=company_id,
            page=page,
            page_size=page_size,
            status=status,
            match_type=match_type,
        )

        return {'success': True, 'data': result}, 200


@reconciliation_ns.route('/matches/<string:match_id>')
class MatchDetail(Resource):

    @reconciliation_ns.doc('delete_match')
    @token_required
    def delete(self, match_id):
        """Delete a single reconciliation match."""
        user = request.current_user
        company_id = user.get('company_id')

        if not company_id:
            return {'success': False, 'message': 'Company not found'}, 400

        service = get_reconciliation_service()
        deleted = service.delete_match(match_id, company_id)

        if not deleted:
            return {'success': False, 'message': 'Match not found'}, 404

        return {'success': True, 'message': 'Match deleted'}, 200

    @reconciliation_ns.doc('update_match_status')
    @token_required
    def patch(self, match_id):
        """Update match status (confirmed / rejected)."""
        user = request.current_user
        company_id = user.get('company_id')

        if not company_id:
            return {'success': False, 'message': 'Company not found'}, 400

        body = request.get_json(silent=True) or {}
        new_status = body.get('status')
        if not new_status:
            return {'success': False, 'message': 'status is required'}, 400

        service = get_reconciliation_service()
        result = service.update_match_status(match_id, company_id, new_status)

        if not result.get('success'):
            return result, 400

        return {'success': True}, 200


@reconciliation_ns.route('/transactions')
class TransactionList(Resource):

    @reconciliation_ns.doc('list_transactions')
    @token_required
    def get(self):
        """Unified transaction list with match info."""
        user = request.current_user
        company_id = user.get('company_id')

        if not company_id:
            return {'success': False, 'message': 'Company not found'}, 400

        try:
            page = int(request.args.get('page', 1))
            page_size = int(request.args.get('page_size', 50))
        except (ValueError, TypeError):
            page, page_size = 1, 50

        filter_status = request.args.get('filter_status', 'all')

        service = get_reconciliation_service()
        result = service.get_all_transactions(
            company_id=company_id,
            page=page,
            page_size=page_size,
            filter_status=filter_status,
        )

        return {'success': True, 'data': result}, 200


@reconciliation_ns.route('/matches/manual')
class ManualMatch(Resource):

    @reconciliation_ns.doc('create_manual_match')
    @token_required
    def post(self):
        """Create a manual match between a transaction and a document."""
        user = request.current_user
        company_id = user.get('company_id')
        user_id = user.get('user_id')

        if not company_id:
            return {'success': False, 'message': 'Company not found'}, 400

        body = request.get_json(silent=True) or {}
        statement_id = body.get('statement_id')
        tx_index = body.get('tx_index')
        document_id = body.get('document_id')

        if not statement_id or tx_index is None or not document_id:
            return {
                'success': False,
                'message': 'statement_id, tx_index, document_id are required',
            }, 400

        try:
            tx_index = int(tx_index)
        except (ValueError, TypeError):
            return {'success': False, 'message': 'tx_index must be integer'}, 400

        service = get_reconciliation_service()
        result = service.create_manual_match(
            company_id=company_id,
            user_id=user_id,
            statement_id=statement_id,
            tx_index=tx_index,
            document_id=document_id,
        )

        if not result.get('success'):
            return result, 400

        return {'success': True, 'data': result}, 200
