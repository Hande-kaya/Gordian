"""
Exchange Rate Routes — sync and query exchange rates.

POST /api/exchange-rates/sync    — seed historical rates (2020→today)
GET  /api/exchange-rates/latest  — show latest rates from DB
POST /api/exchange-rates/update  — trigger daily rate update
"""

import logging

from flask import request
from flask_restx import Namespace, Resource

from services import exchange_rate_service
from utils.auth import token_required

logger = logging.getLogger(__name__)

exchange_rate_ns = Namespace('exchange-rates', description='Exchange rates')


@exchange_rate_ns.route('/sync')
class SyncRates(Resource):

    @exchange_rate_ns.doc('sync_historical_rates')
    @token_required
    def post(self):
        """Seed historical rates from 2020 to today (one-time)."""
        result = exchange_rate_service.sync_historical()
        if result.get('error'):
            return {'success': False, 'error': result['error']}, 500
        return {'success': True, 'data': result}


@exchange_rate_ns.route('/latest')
class LatestRates(Resource):

    @exchange_rate_ns.doc('get_latest_rates')
    @token_required
    def get(self):
        """Get the latest rates from DB."""
        from repositories import exchange_rate_repository as repo
        doc = repo.find_nearest('9999-12-31')  # latest available
        if not doc:
            return {'success': False, 'error': 'No rates in DB'}, 404
        return {'success': True, 'data': doc}


@exchange_rate_ns.route('/update')
class UpdateRates(Resource):

    @exchange_rate_ns.doc('update_daily_rates')
    @token_required
    def post(self):
        """Trigger daily rate update."""
        result = exchange_rate_service.update_daily()
        if result.get('error'):
            return {'success': False, 'error': result['error']}, 500
        return {'success': True, 'data': result}
