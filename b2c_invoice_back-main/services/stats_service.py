"""
Stats Service - Business logic for dashboard statistics.

Orchestrates stats repository calls and validates inputs.
"""

import logging
from datetime import datetime
from typing import Dict, Any, Optional

from repositories.stats_repository import StatsRepository, PERIOD_DAYS, GROUP_BY_FORMATS

logger = logging.getLogger(__name__)

VALID_PERIODS = set(PERIOD_DAYS.keys())
VALID_GROUP_BYS = set(GROUP_BY_FORMATS.keys())


class StatsService:
    """Service for dashboard statistics."""

    def __init__(self):
        self.repo = StatsRepository()

    def get_dashboard_stats(
        self,
        company_id: str,
        period: Optional[str] = '30d',
        group_by: str = 'day',
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        doc_type: str = 'invoice',
    ) -> Dict[str, Any]:
        """
        Get all dashboard statistics in one call.

        Args:
            company_id: Company ID string
            period: Time period (7d, 30d, 90d, 1y) -- ignored if dates given
            group_by: Date grouping (day, month, year)
            start_date: ISO date string (YYYY-MM-DD)
            end_date: ISO date string (YYYY-MM-DD)
        """
        if group_by not in VALID_GROUP_BYS:
            group_by = 'day'

        # Parse date strings
        sd = self._parse_date(start_date)
        ed = self._parse_date(end_date, end_of_day=True)

        # If custom dates, period is ignored
        use_period = None
        if sd or ed:
            use_period = None
        else:
            use_period = period if (period in VALID_PERIODS or period == 'all') else '30d'

        # Single $facet pipeline — 1 DB round trip instead of 4
        result = self.repo.get_all_stats(
            company_id, group_by,
            period=use_period, start_date=sd, end_date=ed,
            doc_type=doc_type,
        )
        result['period'] = use_period or 'custom'
        result['group_by'] = group_by
        return result

    @staticmethod
    def _parse_date(date_str: Optional[str], end_of_day: bool = False) -> Optional[datetime]:
        if not date_str:
            return None
        try:
            dt = datetime.strptime(date_str, '%Y-%m-%d')
            if end_of_day:
                dt = dt.replace(hour=23, minute=59, second=59)
            return dt
        except ValueError:
            return None


# Singleton
_stats_service: Optional[StatsService] = None


def get_stats_service() -> StatsService:
    """Get or create StatsService singleton."""
    global _stats_service
    if _stats_service is None:
        _stats_service = StatsService()
    return _stats_service
