"""
Billing Repository — CRUD for user_usage and billing_transactions collections.
No business logic, pure DB operations.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId

from database import get_collection


class BillingRepository:
    USAGE_COL = 'user_usage'
    TX_COL = 'billing_transactions'

    # ── user_usage ──

    def get_usage(self, user_id: str) -> Optional[Dict[str, Any]]:
        col = get_collection(self.USAGE_COL)
        return col.find_one({'user_id': ObjectId(user_id)})

    def create_usage(self, user_id: str, company_id: str,
                     period_start: datetime, period_end: datetime) -> Dict[str, Any]:
        col = get_collection(self.USAGE_COL)
        now = datetime.utcnow()
        doc = {
            'user_id': ObjectId(user_id),
            'company_id': ObjectId(company_id),
            'free_plan': {
                'uploads_used': 0,
                'uploads_limit': 50,
                'rematches_used': 0,
                'rematches_limit': 5,
                'period_start': period_start,
                'period_end': period_end,
            },
            'credits': {
                'uploads_remaining': 0,
                'regenerates_remaining': 0,
            },
            'created_at': now,
            'updated_at': now,
        }
        col.insert_one(doc)
        return doc

    def get_or_create_usage(self, user_id: str, company_id: str,
                            period_start: datetime, period_end: datetime) -> Dict[str, Any]:
        existing = self.get_usage(user_id)
        if existing:
            return existing
        return self.create_usage(user_id, company_id, period_start, period_end)

    def increment_free_uploads(self, user_id: str) -> Optional[Dict[str, Any]]:
        col = get_collection(self.USAGE_COL)
        return col.find_one_and_update(
            {'user_id': ObjectId(user_id)},
            {'$inc': {'free_plan.uploads_used': 1},
             '$set': {'updated_at': datetime.utcnow()}},
            return_document=True,
        )

    def increment_free_rematches(self, user_id: str) -> Optional[Dict[str, Any]]:
        col = get_collection(self.USAGE_COL)
        return col.find_one_and_update(
            {'user_id': ObjectId(user_id)},
            {'$inc': {'free_plan.rematches_used': 1},
             '$set': {'updated_at': datetime.utcnow()}},
            return_document=True,
        )

    def decrement_upload_credits(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Atomic decrement — only if credits > 0."""
        col = get_collection(self.USAGE_COL)
        return col.find_one_and_update(
            {'user_id': ObjectId(user_id),
             'credits.uploads_remaining': {'$gt': 0}},
            {'$inc': {'credits.uploads_remaining': -1},
             '$set': {'updated_at': datetime.utcnow()}},
            return_document=True,
        )

    def decrement_regenerate_credits(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Atomic decrement — only if credits > 0."""
        col = get_collection(self.USAGE_COL)
        return col.find_one_and_update(
            {'user_id': ObjectId(user_id),
             'credits.regenerates_remaining': {'$gt': 0}},
            {'$inc': {'credits.regenerates_remaining': -1},
             '$set': {'updated_at': datetime.utcnow()}},
            return_document=True,
        )

    def add_purchased_credits(self, user_id: str,
                              uploads: int, regenerates: int) -> Optional[Dict[str, Any]]:
        col = get_collection(self.USAGE_COL)
        return col.find_one_and_update(
            {'user_id': ObjectId(user_id)},
            {'$inc': {
                'credits.uploads_remaining': uploads,
                'credits.regenerates_remaining': regenerates,
             },
             '$set': {'updated_at': datetime.utcnow()}},
            return_document=True,
        )

    def reset_monthly_quotas(self, user_id: str,
                             new_start: datetime, new_end: datetime) -> Optional[Dict[str, Any]]:
        col = get_collection(self.USAGE_COL)
        return col.find_one_and_update(
            {'user_id': ObjectId(user_id)},
            {'$set': {
                'free_plan.uploads_used': 0,
                'free_plan.rematches_used': 0,
                'free_plan.period_start': new_start,
                'free_plan.period_end': new_end,
                'updated_at': datetime.utcnow(),
            }},
            return_document=True,
        )

    # ── billing_transactions ──

    def create_transaction(self, data: Dict[str, Any]) -> str:
        col = get_collection(self.TX_COL)
        data['created_at'] = datetime.utcnow()
        result = col.insert_one(data)
        return str(result.inserted_id)

    def get_transaction_by_session_id(self, session_id: str) -> Optional[Dict[str, Any]]:
        col = get_collection(self.TX_COL)
        return col.find_one({'stripe_session_id': session_id})

    def update_transaction_status(self, session_id: str, status: str,
                                  payment_intent_id: str = None) -> Optional[Dict[str, Any]]:
        col = get_collection(self.TX_COL)
        update: Dict[str, Any] = {
            '$set': {'status': status, 'updated_at': datetime.utcnow()}
        }
        if payment_intent_id:
            update['$set']['stripe_payment_intent_id'] = payment_intent_id
        return col.find_one_and_update(
            {'stripe_session_id': session_id},
            update,
            return_document=True,
        )

    def get_user_transactions(self, user_id: str,
                              page: int = 1, page_size: int = 20) -> Dict[str, Any]:
        col = get_collection(self.TX_COL)
        query = {'user_id': ObjectId(user_id)}
        total = col.count_documents(query)
        page_size = min(max(1, page_size), 100)
        skip = (page - 1) * page_size

        items = list(col.find(query).sort('created_at', -1).skip(skip).limit(page_size))
        for item in items:
            item['_id'] = str(item['_id'])
            item['user_id'] = str(item['user_id'])
            if 'company_id' in item:
                item['company_id'] = str(item['company_id'])
        return {
            'items': items,
            'total': total,
            'page': page,
            'page_size': page_size,
        }


# Singleton
_billing_repo = None

def get_billing_repository() -> BillingRepository:
    global _billing_repo
    if _billing_repo is None:
        _billing_repo = BillingRepository()
    return _billing_repo
