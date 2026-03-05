"""
Billing Service — Stripe checkout + webhook handling.

Custom amount: user chooses how much to pay (preset $5).
Credits scale proportionally: $5 = 100 uploads + 20 regenerates.
"""

import logging
import math

import stripe
from bson import ObjectId

from config import config
from repositories.billing_repository import get_billing_repository

logger = logging.getLogger(__name__)

# Base rate: per $5 (500 cents)
BASE_AMOUNT_CENTS = 500
BASE_UPLOADS = 100
BASE_REGENERATES = 20


def _calculate_credits(amount_cents: int):
    """Proportional credit calculation based on amount paid."""
    if amount_cents <= 0:
        return 0, 0
    ratio = amount_cents / BASE_AMOUNT_CENTS
    uploads = math.floor(BASE_UPLOADS * ratio)
    regenerates = math.floor(BASE_REGENERATES * ratio)
    return max(uploads, 1), max(regenerates, 1)


class BillingService:

    def __init__(self):
        self.repo = get_billing_repository()
        stripe.api_key = config.STRIPE_SECRET_KEY
        self._frontend_url = config.B2C_FRONTEND_URL or config.FRONTEND_URL

        if 'localhost' in self._frontend_url:
            logger.warning(
                "FRONTEND_URL contains localhost (%s) — "
                "Stripe redirects will fail in production. "
                "Set B2C_FRONTEND_URL or FRONTEND_URL to your deployed URL.",
                self._frontend_url
            )
        if not config.STRIPE_WEBHOOK_SECRET:
            logger.warning(
                "STRIPE_WEBHOOK_SECRET not configured — "
                "webhooks will be rejected and credits won't be granted."
            )

    def create_checkout_session(self, user_id: str, company_id: str,
                                user_email: str = None, amount_cents: int = None):
        """Create a Stripe Checkout Session for credit purchase."""
        if not config.STRIPE_SECRET_KEY:
            return {'success': False, 'message': 'Stripe not configured'}
        if not config.STRIPE_PRODUCT_ID:
            return {'success': False, 'message': 'Stripe product not configured'}

        final_amount = amount_cents or BASE_AMOUNT_CENTS
        uploads, regenerates = _calculate_credits(final_amount)

        try:
            session_params = {
                'mode': 'payment',
                'line_items': [{
                    'price_data': {
                        'currency': 'usd',
                        'product_data': {
                            'name': 'Invoice Manager — Credit Pack',
                            'description': f'{uploads} document uploads + {regenerates} regenerates',
                        },
                        'unit_amount': final_amount,
                    },
                    'quantity': 1,
                }],
                'metadata': {
                    'user_id': user_id,
                    'company_id': company_id,
                },
                'success_url': f'{self._frontend_url}/settings?tab=subscription&payment=success',
                'cancel_url': f'{self._frontend_url}/settings?tab=subscription&payment=cancelled',
            }
            if user_email:
                session_params['customer_email'] = user_email

            session = stripe.checkout.Session.create(**session_params)

            self.repo.create_transaction({
                'user_id': ObjectId(user_id),
                'company_id': ObjectId(company_id),
                'stripe_session_id': session.id,
                'amount_cents': final_amount,
                'currency': 'usd',
                'status': 'pending',
                'credits_granted': {'uploads': uploads, 'regenerates': regenerates},
            })

            return {
                'success': True,
                'checkout_url': session.url,
                'session_id': session.id,
            }

        except stripe.error.StripeError as e:
            logger.error(f"Stripe checkout error: {e}")
            return {'success': False, 'message': 'Payment service error'}

    def handle_webhook(self, payload: bytes, sig_header: str):
        """Process Stripe webhook events."""
        if not config.STRIPE_WEBHOOK_SECRET:
            logger.error(
                "STRIPE_WEBHOOK_SECRET not set — cannot verify webhook. "
                "Add it to .env from Stripe Dashboard > Webhooks."
            )
            return False

        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, config.STRIPE_WEBHOOK_SECRET
            )
        except (ValueError, stripe.error.SignatureVerificationError) as e:
            logger.error(f"Webhook signature verification failed: {e}")
            return False

        if event['type'] == 'checkout.session.completed':
            return self._handle_checkout_completed(event['data']['object'])

        return True

    def _handle_checkout_completed(self, session):
        """Grant credits proportional to amount paid."""
        session_id = session.get('id')
        metadata = session.get('metadata', {})
        user_id = metadata.get('user_id')
        payment_intent = session.get('payment_intent')
        amount_total = session.get('amount_total', 0)

        if not user_id or not session_id:
            logger.error(f"Webhook missing metadata: {session_id}")
            return False

        # Idempotency check
        existing = self.repo.get_transaction_by_session_id(session_id)
        if existing and existing.get('status') == 'completed':
            logger.info(f"Webhook already processed for session {session_id}")
            return True

        # Calculate credits proportionally
        uploads, regenerates = _calculate_credits(amount_total)

        # Update transaction with actual amount and credits
        from database import get_collection
        get_collection('billing_transactions').update_one(
            {'stripe_session_id': session_id},
            {'$set': {
                'amount_cents': amount_total,
                'credits_granted': {'uploads': uploads, 'regenerates': regenerates},
            }}
        )
        self.repo.update_transaction_status(session_id, 'completed', payment_intent)

        # Grant credits
        from services.usage_service import get_usage_service
        company_id = metadata.get('company_id', '')
        usage_svc = get_usage_service()
        usage_svc._ensure_usage(user_id, company_id)
        self.repo.add_purchased_credits(user_id, uploads, regenerates)

        logger.info(
            f"Credits granted to user {user_id}: "
            f"+{uploads} uploads, +{regenerates} regenerates "
            f"(${amount_total / 100:.2f} paid)"
        )
        return True

    def get_billing_history(self, user_id: str, page: int = 1, page_size: int = 20):
        return self.repo.get_user_transactions(user_id, page, page_size)


# Singleton
_billing_service = None

def get_billing_service() -> BillingService:
    global _billing_service
    if _billing_service is None:
        _billing_service = BillingService()
    return _billing_service
