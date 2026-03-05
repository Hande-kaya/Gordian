"""
Stats Repository - Data access layer for dashboard statistics.

Aggregation pipelines for invoice counts, spending by date, and spending by category.
"""

from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from bson import ObjectId
import logging

from database import get_collection

logger = logging.getLogger(__name__)

# Period string -> days lookup
PERIOD_DAYS = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '1y': 365,
}

# Date format strings for $dateToString grouping
GROUP_BY_FORMATS = {
    'day': '%Y-%m-%d',
    'month': '%Y-%m',
    'year': '%Y',
}

# Normalize currency aliases
CURRENCY_ALIASES = {'TL': 'TRY'}


class StatsRepository:
    """Repository for dashboard statistics queries."""

    COLLECTION = 'documents'

    def _base_match(
        self, company_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        period: Optional[str] = None,
        doc_type: str = 'invoice',
    ) -> Dict:
        """
        Base $match stage: invoices only, skip multi-doc parents, within date range.

        Uses explicit start_date/end_date if provided, otherwise falls back to period.
        """
        try:
            company_oid = ObjectId(company_id)
        except Exception:
            company_oid = company_id

        # Defense-in-depth: ensure params are plain strings
        if not isinstance(doc_type, str):
            doc_type = 'invoice'
        if period is not None and not isinstance(period, str):
            period = None

        date_filter = {}
        if start_date:
            date_filter['$gte'] = start_date
        if end_date:
            date_filter['$lte'] = end_date
        if not date_filter and period and period != 'all':
            days = PERIOD_DAYS.get(period, 30)
            date_filter['$gte'] = datetime.utcnow() - timedelta(days=days)

        match: Dict[str, Any] = {
            'company_id': company_oid,
            'type': doc_type,
            'child_document_ids.0': {'$exists': False},
            'deleted_at': {'$exists': False},
        }
        if date_filter:
            match['created_at'] = date_filter

        return {'$match': match}

    def _currency_normalize_stage(self) -> Dict:
        """$addFields stage to normalize currency (TL->TRY, default TRY)."""
        return {
            '$addFields': {
                '_currency': {
                    '$switch': {
                        'branches': [
                            {
                                'case': {'$in': [
                                    {'$toUpper': {'$ifNull': ['$extracted_data.currency', 'UNKNOWN']}},
                                    ['TL', 'TRY'],
                                ]},
                                'then': 'TRY',
                            },
                        ],
                        'default': {'$toUpper': {'$ifNull': ['$extracted_data.currency', 'UNKNOWN']}},
                    }
                }
            }
        }

    def _parsed_date_stage(self) -> Dict:
        """$addFields stage to parse invoice_date with fallback to created_at."""
        return {
            '$addFields': {
                '_parsed_date': {
                    '$ifNull': [
                        {'$dateFromString': {
                            'dateString': '$extracted_data.invoice_date',
                            'onError': '$created_at',
                            'onNull': '$created_at',
                        }},
                        '$created_at',
                    ]
                }
            }
        }

    def get_all_stats(
        self, company_id: str, group_by: str,
        period: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        doc_type: str = 'invoice',
    ) -> Dict[str, Any]:
        """
        Single aggregation pipeline that returns counts, spending-by-date,
        spending-by-category, and date-range in one DB round trip.
        """
        collection = get_collection(self.COLLECTION)
        if collection is None:
            return self._empty_all_stats()

        try:
            company_oid = ObjectId(company_id)
        except Exception:
            return self._empty_all_stats()

        if not isinstance(doc_type, str):
            doc_type = 'invoice'

        # Base filter: no date constraint (counts need all docs)
        base_filter = {
            'company_id': company_oid,
            'type': doc_type,
            'child_document_ids.0': {'$exists': False},
            'deleted_at': {'$exists': False},
        }

        # Date filter for spending sub-pipelines
        date_match: Dict[str, Any] = {}
        if start_date:
            date_match.setdefault('created_at', {})['$gte'] = start_date
        if end_date:
            date_match.setdefault('created_at', {})['$lte'] = end_date
        if not date_match and period and period != 'all':
            days = PERIOD_DAYS.get(period, 30)
            date_match['created_at'] = {'$gte': datetime.utcnow() - timedelta(days=days)}

        date_fmt = GROUP_BY_FORMATS.get(group_by, '%Y-%m-%d')
        currency_stage = self._currency_normalize_stage()
        parsed_date_stage = self._parsed_date_stage()

        # --- Sub-pipeline: status counts ---
        counts_pipeline: List[Dict] = [
            {'$group': {
                '_id': None,
                'total': {'$sum': 1},
                'matched': {'$sum': {'$cond': [
                    {'$eq': ['$comparison.status', 'matched']}, 1, 0]}},
                'discrepancy': {'$sum': {'$cond': [
                    {'$eq': ['$comparison.status', 'discrepancy']}, 1, 0]}},
                'pending': {'$sum': {'$cond': [
                    {'$in': [
                        {'$ifNull': ['$comparison.status', 'pending']},
                        ['pending', None],
                    ]}, 1, 0]}},
            }},
        ]

        # --- Sub-pipeline: spending by date ---
        spending_date_pipeline: List[Dict] = []
        if date_match:
            spending_date_pipeline.append({'$match': date_match})
        spending_date_pipeline.extend([
            {'$match': {'extracted_data.total_amount': {'$exists': True, '$ne': None}}},
            currency_stage,
            parsed_date_stage,
            {'$group': {
                '_id': {
                    'currency': '$_currency',
                    'date': {'$dateToString': {'format': date_fmt, 'date': '$_parsed_date'}},
                },
                'total': {'$sum': {'$toDouble': '$extracted_data.total_amount'}},
                'count': {'$sum': 1},
            }},
            {'$sort': {'_id.date': 1}},
            {'$group': {
                '_id': '$_id.currency',
                'time_series': {'$push': {
                    'date': '$_id.date',
                    'total': {'$round': ['$total', 2]},
                    'count': '$count',
                }},
                'currency_total': {'$sum': '$total'},
            }},
            {'$sort': {'currency_total': -1}},
            {'$project': {
                '_id': 0, 'currency': '$_id',
                'time_series': 1,
                'currency_total': {'$round': ['$currency_total', 2]},
            }},
        ])

        # --- Sub-pipeline: spending by category ---
        spending_cat_pipeline: List[Dict] = []
        if date_match:
            spending_cat_pipeline.append({'$match': date_match})
        spending_cat_pipeline.extend([
            {'$match': {
                'extracted_data.total_amount': {'$exists': True, '$ne': None},
                'expense_category': {'$exists': True, '$ne': None},
            }},
            currency_stage,
            parsed_date_stage,
            {'$group': {
                '_id': {
                    'category': '$expense_category',
                    'currency': '$_currency',
                    'date': {'$dateToString': {'format': date_fmt, 'date': '$_parsed_date'}},
                },
                'total': {'$sum': {'$toDouble': '$extracted_data.total_amount'}},
                'count': {'$sum': 1},
            }},
            {'$sort': {'_id.date': 1}},
            {'$group': {
                '_id': {'category': '$_id.category', 'currency': '$_id.currency'},
                'time_series': {'$push': {
                    'date': '$_id.date',
                    'total': {'$round': ['$total', 2]},
                    'count': '$count',
                }},
                'category_total': {'$sum': '$total'},
            }},
            {'$sort': {'category_total': -1}},
            {'$project': {
                '_id': 0,
                'category': '$_id.category', 'currency': '$_id.currency',
                'time_series': 1,
                'category_total': {'$round': ['$category_total', 2]},
            }},
        ])

        # --- Sub-pipeline: date range ---
        date_range_pipeline: List[Dict] = [
            parsed_date_stage,
            {'$group': {
                '_id': None,
                'min_date': {'$min': '$_parsed_date'},
                'max_date': {'$max': '$_parsed_date'},
            }},
        ]

        # Execute single aggregation with $facet
        pipeline = [
            {'$match': base_filter},
            {'$facet': {
                'counts': counts_pipeline,
                'spending_by_date': spending_date_pipeline,
                'spending_by_category': spending_cat_pipeline,
                'date_range': date_range_pipeline,
            }},
        ]

        try:
            result = list(collection.aggregate(pipeline))
            if not result:
                return self._empty_all_stats()

            facets = result[0]

            # Parse counts
            c = facets['counts'][0] if facets['counts'] else {}
            counts = {
                'total': c.get('total', 0),
                'matched': c.get('matched', 0),
                'discrepancy': c.get('discrepancy', 0),
                'pending': c.get('pending', 0),
            }

            # Parse date range
            dr = facets['date_range'][0] if facets['date_range'] else {}
            min_d = dr.get('min_date')
            max_d = dr.get('max_date')
            date_range = {
                'min_month': min_d.strftime('%Y-%m') if min_d else None,
                'max_month': max_d.strftime('%Y-%m') if max_d else None,
            }

            return {
                'counts': counts,
                'spending_by_date': facets.get('spending_by_date', []),
                'spending_by_category': facets.get('spending_by_category', []),
                'date_range': date_range,
            }
        except Exception as e:
            logger.error(f"Failed to get all stats: {e}")
            return self._empty_all_stats()

    @staticmethod
    def _empty_all_stats() -> Dict[str, Any]:
        return {
            'counts': {'total': 0, 'matched': 0, 'discrepancy': 0, 'pending': 0},
            'spending_by_date': [],
            'spending_by_category': [],
            'date_range': {'min_month': None, 'max_month': None},
        }

    @staticmethod
    def _empty_counts() -> Dict[str, int]:
        return {'total': 0, 'matched': 0, 'discrepancy': 0, 'pending': 0}
