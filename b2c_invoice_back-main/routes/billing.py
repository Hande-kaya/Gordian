"""
Billing Routes — Stripe checkout, webhook, usage summary, billing history.

POST /api/billing/checkout  — Create Stripe Checkout session (@token_required)
POST /api/billing/webhook   — Stripe webhook (no auth, signature verified)
GET  /api/billing/usage     — Usage summary (@token_required)
GET  /api/billing/history   — Billing history paginated (@token_required)
"""

import logging

from flask import request
from flask_restx import Namespace, Resource

from utils.auth import token_required

logger = logging.getLogger(__name__)

billing_ns = Namespace('billing', description='Billing & usage operations')


@billing_ns.route('/checkout')
class BillingCheckout(Resource):

    @billing_ns.doc('create_checkout')
    @token_required
    def post(self):
        """Create a Stripe Checkout session for credit pack purchase."""
        try:
            user = request.current_user
            user_id = user.get('user_id')
            company_id = user.get('company_id')
            email = user.get('email')

            if not company_id:
                return {'success': False, 'message': 'User company not found'}, 400

            data = request.get_json(silent=True) or {}
            amount_cents = data.get('amount_cents')
            if amount_cents is not None:
                try:
                    amount_cents = int(amount_cents)
                    if amount_cents < 100:
                        return {'success': False, 'message': 'Minimum amount is $1'}, 400
                except (ValueError, TypeError):
                    return {'success': False, 'message': 'Invalid amount'}, 400

            from services.billing_service import get_billing_service
            result = get_billing_service().create_checkout_session(
                user_id, company_id, email, amount_cents=amount_cents
            )

            if not result.get('success'):
                return result, 400

            return {'success': True, 'data': result}, 200

        except Exception as e:
            logger.error(f"Checkout error: {e}")
            return {'success': False, 'message': 'Checkout failed'}, 500


@billing_ns.route('/webhook')
class BillingWebhook(Resource):

    @billing_ns.doc('stripe_webhook')
    def post(self):
        """Handle Stripe webhook events (no auth — verified by signature)."""
        try:
            payload = request.get_data()
            sig_header = request.headers.get('Stripe-Signature', '')

            from services.billing_service import get_billing_service
            success = get_billing_service().handle_webhook(payload, sig_header)

            if not success:
                return {'success': False}, 400

            return {'success': True}, 200

        except Exception as e:
            logger.error(f"Webhook error: {e}")
            return {'success': False}, 500


@billing_ns.route('/usage')
class BillingUsage(Resource):

    @billing_ns.doc('get_usage')
    @token_required
    def get(self):
        """Get usage summary for the current user."""
        try:
            user = request.current_user
            user_id = user.get('user_id')
            company_id = user.get('company_id')

            if not company_id:
                return {'success': False, 'message': 'User company not found'}, 400

            from services.usage_service import get_usage_service
            summary = get_usage_service().get_usage_summary(user_id, company_id)

            return {'success': True, 'data': summary}, 200

        except Exception as e:
            logger.error(f"Usage error: {e}")
            return {'success': False, 'message': 'Failed to get usage'}, 500


@billing_ns.route('/history')
class BillingHistory(Resource):

    @billing_ns.doc('get_billing_history')
    @token_required
    def get(self):
        """Get billing transaction history (paginated)."""
        try:
            user = request.current_user
            user_id = user.get('user_id')

            try:
                page = int(request.args.get('page', 1))
                page_size = int(request.args.get('page_size', 20))
            except (ValueError, TypeError):
                page, page_size = 1, 20

            from services.billing_service import get_billing_service
            result = get_billing_service().get_billing_history(
                user_id, page, page_size
            )

            return {'success': True, 'data': result}, 200

        except Exception as e:
            logger.error(f"History error: {e}")
            return {'success': False, 'message': 'Failed to get history'}, 500
