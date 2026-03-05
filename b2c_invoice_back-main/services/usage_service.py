"""
Usage Service — Quota checking and consumption logic.

Credit consumption order: free monthly quota FIRST, then purchased credits.
Monthly reset: lazy (no cron), triggered on next request after period_end.
"""

import logging
import math
from datetime import datetime, timedelta

from repositories.billing_repository import get_billing_repository

logger = logging.getLogger(__name__)

PERIOD_DAYS = 30


def _new_period_from(anchor: datetime):
    """Return (start, end) for a 30-day period starting at anchor."""
    start = anchor.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=PERIOD_DAYS)


def _days_remaining(period_end: datetime) -> int:
    total_seconds = (period_end - datetime.utcnow()).total_seconds()
    if total_seconds <= 0:
        return 0
    return math.ceil(total_seconds / 86400)


class UsageService:

    def __init__(self):
        self.repo = get_billing_repository()

    def _ensure_usage(self, user_id: str, company_id: str):
        """Get or create usage doc, reset period if expired."""
        now = datetime.utcnow()
        start, end = _new_period_from(now)
        usage = self.repo.get_or_create_usage(user_id, company_id, start, end)
        return self._maybe_reset_period(usage, user_id)

    def _maybe_reset_period(self, usage, user_id: str):
        """Lazy reset: if period_end is past, start new 30-day cycle from old period_end."""
        period_end = usage.get('free_plan', {}).get('period_end')
        if period_end and period_end <= datetime.utcnow():
            new_start, new_end = _new_period_from(period_end)
            usage = self.repo.reset_monthly_quotas(user_id, new_start, new_end)
            logger.info(f"Quota reset for user {user_id}: {new_start} → {new_end}")
        return usage

    # ── Upload quota ──

    def check_upload_quota(self, user_id: str, company_id: str):
        usage = self._ensure_usage(user_id, company_id)
        fp = usage.get('free_plan', {})
        cr = usage.get('credits', {})

        free_remaining = fp.get('uploads_limit', 50) - fp.get('uploads_used', 0)
        credit_remaining = cr.get('uploads_remaining', 0)

        if free_remaining > 0:
            return {'allowed': True, 'source': 'free', 'remaining': free_remaining + credit_remaining}
        if credit_remaining > 0:
            return {'allowed': True, 'source': 'credit', 'remaining': credit_remaining}

        return {
            'allowed': False,
            'source': None,
            'remaining': 0,
            'message': 'Upload quota exceeded. Purchase credits to continue.',
        }

    def consume_upload(self, user_id: str, company_id: str):
        usage = self._ensure_usage(user_id, company_id)
        fp = usage.get('free_plan', {})
        free_remaining = fp.get('uploads_limit', 50) - fp.get('uploads_used', 0)

        if free_remaining > 0:
            self.repo.increment_free_uploads(user_id)
            return 'free'

        result = self.repo.decrement_upload_credits(user_id)
        if result:
            return 'credit'

        logger.warning(f"consume_upload called but no quota for user {user_id}")
        return None

    # ── Regenerate quota (credit-only, no free plan) ──

    def check_regenerate_quota(self, user_id: str, company_id: str):
        usage = self._ensure_usage(user_id, company_id)
        cr = usage.get('credits', {})
        remaining = cr.get('regenerates_remaining', 0)

        if remaining > 0:
            return {'allowed': True, 'source': 'credit', 'remaining': remaining}

        return {
            'allowed': False,
            'source': None,
            'remaining': 0,
            'message': 'Regenerate credits exhausted. Purchase credits to continue.',
        }

    def consume_regenerate(self, user_id: str, company_id: str):
        usage = self._ensure_usage(user_id, company_id)
        result = self.repo.decrement_regenerate_credits(user_id)
        if result:
            return 'credit'
        logger.warning(f"consume_regenerate called but no credits for user {user_id}")
        return None

    # ── Rematch quota (free plan first, then credits) ──

    def check_rematch_quota(self, user_id: str, company_id: str):
        usage = self._ensure_usage(user_id, company_id)
        fp = usage.get('free_plan', {})
        cr = usage.get('credits', {})

        free_remaining = fp.get('rematches_limit', 5) - fp.get('rematches_used', 0)
        credit_remaining = cr.get('regenerates_remaining', 0)

        if free_remaining > 0:
            return {'allowed': True, 'source': 'free', 'remaining': free_remaining + credit_remaining}
        if credit_remaining > 0:
            return {'allowed': True, 'source': 'credit', 'remaining': credit_remaining}

        return {
            'allowed': False,
            'source': None,
            'remaining': 0,
            'message': 'Rematch quota exceeded. Purchase credits to continue.',
        }

    def consume_rematch(self, user_id: str, company_id: str):
        usage = self._ensure_usage(user_id, company_id)
        fp = usage.get('free_plan', {})
        free_remaining = fp.get('rematches_limit', 5) - fp.get('rematches_used', 0)

        if free_remaining > 0:
            self.repo.increment_free_rematches(user_id)
            return 'free'

        result = self.repo.decrement_regenerate_credits(user_id)
        if result:
            return 'credit'

        logger.warning(f"consume_rematch called but no quota for user {user_id}")
        return None

    # ── Usage summary (for Settings page) ──

    def get_usage_summary(self, user_id: str, company_id: str):
        usage = self._ensure_usage(user_id, company_id)
        fp = usage.get('free_plan', {})
        cr = usage.get('credits', {})

        period_end = fp.get('period_end', datetime.utcnow())

        return {
            'free_plan': {
                'uploads_used': fp.get('uploads_used', 0),
                'uploads_limit': fp.get('uploads_limit', 50),
                'rematches_used': fp.get('rematches_used', 0),
                'rematches_limit': fp.get('rematches_limit', 5),
                'period_end': period_end.isoformat() if hasattr(period_end, 'isoformat') else str(period_end),
                'days_remaining': _days_remaining(period_end),
            },
            'credits': {
                'uploads_remaining': cr.get('uploads_remaining', 0),
                'regenerates_remaining': cr.get('regenerates_remaining', 0),
            },
        }


# Singleton
_usage_service = None

def get_usage_service() -> UsageService:
    global _usage_service
    if _usage_service is None:
        _usage_service = UsageService()
    return _usage_service
