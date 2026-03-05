"""
Stats API Routes

Dashboard statistics endpoint for invoice counts and spending charts.
"""

from flask_restx import Namespace, Resource
from flask import request
from utils.auth import token_required
from utils.validators import safe_string_param
from services.stats_service import get_stats_service

stats_ns = Namespace('stats', description='Dashboard Statistics')


@stats_ns.route('/')
class DashboardStats(Resource):
    """Dashboard statistics endpoint."""

    @stats_ns.doc('get_dashboard_stats')
    @stats_ns.param('period', 'Time period: 7d, 30d, 90d, 1y (default: 30d)')
    @stats_ns.param('group_by', 'Date grouping: day, month, year (default: day)')
    @token_required
    def get(self):
        """Get dashboard statistics (counts + spending charts)."""
        user = request.current_user
        company_id = str(user.get('company_id'))

        if not company_id:
            return {'success': False, 'message': 'Company not found'}, 400

        period = safe_string_param(
            request.args.get('period', '30d'),
            ('7d', '30d', '90d', '1y', 'all'),
        ) or '30d'
        group_by = safe_string_param(
            request.args.get('group_by', 'day'),
            ('day', 'month', 'year'),
        ) or 'day'
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        doc_type = safe_string_param(
            request.args.get('doc_type', 'invoice'),
            ('invoice', 'quote', 'income', 'bank-statement'),
        ) or 'invoice'

        data = get_stats_service().get_dashboard_stats(
            company_id, period, group_by,
            start_date=start_date, end_date=end_date,
            doc_type=doc_type,
        )

        return {'success': True, 'data': data}
