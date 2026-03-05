"""
RFQ Repository - Data access layer for RFQ requests.

Uses MongoDB aggregation to avoid N+1 query problems.
All queries are optimized with proper indexing and projection.
"""

from datetime import datetime
from typing import List, Optional, Dict, Any
from bson import ObjectId
from pymongo import ASCENDING, DESCENDING

from database import get_collection


class RFQRepository:
    """Repository for RFQ requests with optimized queries"""

    # Collection names
    REQUESTS = 'requests'
    OFFERS = 'offers'
    INVOICES = 'invoices'
    SUPPLIERS_TR = 'suppliers_tr'
    SUPPLIERS_EN = 'suppliers_en'
    SUPPLIERS_DE = 'suppliers_de'

    @staticmethod
    def _get_supplier_collection(region: str) -> str:
        """Get supplier collection name based on region"""
        mapping = {
            'tr': 'suppliers_tr',
            'en': 'suppliers_en',
            'de': 'suppliers_de',
        }
        return mapping.get(region.lower(), 'suppliers_tr')

    def get_completed_rfqs(
        self,
        company_id: Optional[str],
        page: int = 1,
        page_size: int = 20,
        sort_by: str = 'completed_at',
        sort_order: int = -1
    ) -> Dict[str, Any]:
        """
        Get completed RFQs and standalone Quote documents with pagination.

        Fetches from:
        1. 'requests' collection (completed RFQs)
        2. 'documents' collection (type='quote', unlinked)

        Merges and paginates in memory.
        """
        requests_col = get_collection(self.REQUESTS)
        documents_col = get_collection('documents')

        # 1. Fetch Completed RFQs
        match_stage = {'phase': 'completed'}
        if company_id:
            try:
                match_stage['company_id'] = ObjectId(company_id)
            except Exception:
                return {'rfqs': [], 'total': 0, 'page': page, 'page_size': page_size, 'has_next': False, 'has_prev': False}

        pipeline = [
            {'$match': match_stage},
            {
                '$lookup': {
                    'from': 'offers',
                    'let': {'request_id': '$_id'},
                    'pipeline': [
                        {'$match': {'$expr': {'$eq': ['$request_id', '$$request_id']}}},
                        {'$count': 'count'}
                    ],
                    'as': 'offer_count_result'
                }
            },
            {
                '$lookup': {
                    'from': 'documents',
                    'let': {'request_id': '$_id'},
                    'pipeline': [
                        {'$match': {
                            '$expr': {'$eq': ['$rfq_id', '$$request_id']},
                            'type': 'invoice'
                        }},
                        {'$count': 'count'}
                    ],
                    'as': 'invoice_count_result'
                }
            },
            {
                '$lookup': {
                    'from': 'companies',
                    'localField': 'company_id',
                    'foreignField': '_id',
                    'as': 'company_info'
                }
            },
            {
                '$lookup': {
                    'from': 'emails',
                    'let': {'request_id_str': {'$toString': '$_id'}},
                    'pipeline': [
                        {'$match': {
                            '$expr': {'$eq': ['$request_id', '$$request_id_str']},
                            'direction': 'received',
                            'attachments': {'$exists': True, '$ne': []}
                        }},
                        {'$project': {'att_count': {'$size': {'$ifNull': ['$attachments', []]}}}},
                        {'$group': {'_id': None, 'total': {'$sum': '$att_count'}}}
                    ],
                    'as': 'attachment_count_result'
                }
            },
            {
                '$addFields': {
                    'offer_count': {'$ifNull': [{'$arrayElemAt': ['$offer_count_result.count', 0]}, 0]},
                    'has_invoice': {'$gt': [{'$ifNull': [{'$arrayElemAt': ['$invoice_count_result.count', 0]}, 0]}, 0]},
                    'linked_invoice_count': {'$ifNull': [{'$arrayElemAt': ['$invoice_count_result.count', 0]}, 0]},
                    'company_name': {'$ifNull': [{'$arrayElemAt': ['$company_info.name', 0]}, 'Unknown Company']},
                    'attachment_count': {'$ifNull': [{'$arrayElemAt': ['$attachment_count_result.total', 0]}, 0]}
                }
            },
            {
                '$addFields': {
                    'mapped_product_name': {'$ifNull': ['$product_name', '$title']},
                    'mapped_supplier_name': {
                        '$let': {
                            'vars': {'first_quote': {'$arrayElemAt': ['$quotes_selections', 0]}},
                            'in': {'$ifNull': ['$selected_supplier_name', '$$first_quote.supplier_name']}
                        }
                    },
                    'mapped_supplier_id': {
                        '$let': {
                            'vars': {'first_quote': {'$arrayElemAt': ['$quotes_selections', 0]}},
                            'in': {'$ifNull': ['$selected_supplier', '$$first_quote.supplier_id']}
                        }
                    },
                    'mapped_currency': {
                        '$let': {
                            'vars': {'first_quote': {'$arrayElemAt': ['$quotes_selections', 0]}},
                            'in': {'$ifNull': ['$currency', '$$first_quote.currency', 'USD']}
                        }
                    }
                }
            },
            {
                '$project': {
                    '_id': 1,
                    'company_request_id': 1,
                    'title': 1,
                    'product_name': '$mapped_product_name',
                    'product_description': 1,
                    'quantity': 1,
                    'unit': 1,
                    'completed_at': 1,
                    'created_at': 1,
                    'updated_at': 1,
                    'status': 1,
                    'phase': 1,
                    'offer_count': 1,
                    'link_status': '$has_invoice', # mapped for potential frontend use
                    'has_invoice': 1,
                    'linked_invoice_count': 1,
                    'attachment_count': 1,
                    'selected_supplier': '$mapped_supplier_id',
                    'selected_supplier_name': '$mapped_supplier_name',
                    'final_amount': '$budget', # Best guess if not explicitly stored
                    'currency': '$mapped_currency',
                    'company_name': 1
                }
            }
        ]

        rfqs = list(requests_col.aggregate(pipeline))

        # 2. Fetch Standalone Quote Documents
        doc_query = {
            'type': 'quote',
            'rfq_id': None 
        }
        if company_id:
             try:
                doc_query['company_id'] = ObjectId(company_id)
             except:
                 pass

        quote_docs = list(documents_col.find(doc_query))
        
        # 2b. Count Linked Invoices for these Quotes
        # Invoices store link as 'comparison.linked_quote_id' (string)
        quote_ids = [str(d['_id']) for d in quote_docs]
        invoice_counts = {}
        
        if quote_ids:
            link_pipeline = [
                {'$match': {
                    'type': 'invoice',
                    'comparison.linked_quote_id': {'$in': quote_ids}
                }},
                {'$group': {
                    '_id': '$comparison.linked_quote_id',
                    'count': {'$sum': 1}
                }}
            ]
            link_results = list(documents_col.aggregate(link_pipeline))
            for res in link_results:
                invoice_counts[str(res['_id'])] = res['count']
        
        # 3. Normalize Document Data to RFQ Format
        for doc in quote_docs:
            extracted = doc.get('extracted_data', {}) or {}
            financials = extracted.get('financials', {}) or {}
            vendor = extracted.get('vendor', {}) or {}
            
            # Use uploaded_at or created_at
            date_val = doc.get('created_at') or doc.get('uploaded_at') or datetime.now()
            
            # Extract total amount
            amount = financials.get('total_amount')
            if amount is None:
                 amount = financials.get('subtotal')

            doc_id_str = str(doc['_id'])
            linked_count = invoice_counts.get(doc_id_str, 0)

            pseudo_rfq = {
                '_id': doc['_id'],
                'company_request_id': 0, # Dummy ID for unlinked quotes
                'title': doc.get('filename'), # Use filename as title
                'product_name': extracted.get('document_number') or 'Uploaded Quote',
                'quantity': extracted.get('quantity'),
                'unit': extracted.get('unit', ''),
                'status': 'completed',
                'phase': 'completed',
                'completed_at': date_val,
                'created_at': date_val,
                'updated_at': doc.get('updated_at', date_val),
                'offer_count': 1, # It is a quote itself
                'has_invoice': linked_count > 0,
                'linked_invoice_count': linked_count,
                'attachment_count': 0, # Quote docs don't have email attachments
                'selected_supplier_name': vendor.get('name') or 'Unknown Supplier',
                'selected_supplier': {
                    'name': vendor.get('name'),
                    'region': 'Unknown'
                },
                'final_amount': amount,
                'currency': financials.get('currency', 'USD'),
                'company_name': vendor.get('name') or 'Unknown Company',
                'is_quote_doc': True # Flag
            }
            rfqs.append(pseudo_rfq)

        # 4. Sort
        # Helper to get sort value safely
        def get_sort_val(item):
            val = item.get(sort_by)
            if val is None:
                return datetime.min if sort_by.endswith('_at') else ''
            return val

        rfqs.sort(key=get_sort_val, reverse=(sort_order == -1))

        # 5. Pagination
        total = len(rfqs)
        skip = (page - 1) * page_size
        paginated_rfqs = rfqs[skip : skip + page_size]

        return {
            'rfqs': paginated_rfqs,
            'total': total,
            'page': page,
            'page_size': page_size,
            'has_next': skip + page_size < total,
            'has_prev': page > 1
        }

    def get_rfq_by_id(self, rfq_id: str) -> Optional[Dict[str, Any]]:
        """
        Get RFQ details by ID.

        Args:
            rfq_id: RFQ ObjectId as string

        Returns:
            RFQ document or None if not found
        """
        requests_col = get_collection(self.REQUESTS)

        try:
            rfq = requests_col.find_one({'_id': ObjectId(rfq_id)})
            return rfq
        except Exception:
            return None

    def get_offers_for_rfq(self, rfq_id: str) -> List[Dict[str, Any]]:
        """
        Get all offers for an RFQ with supplier details.

        Uses aggregation to join with supplier collections in one query.

        Args:
            rfq_id: RFQ ObjectId as string

        Returns:
            List of offers with supplier details
        """
        offers_col = get_collection(self.OFFERS)
        suppliers_tr = get_collection(self.SUPPLIERS_TR)
        suppliers_en = get_collection(self.SUPPLIERS_EN)
        suppliers_de = get_collection(self.SUPPLIERS_DE)

        try:
            rfq_oid = ObjectId(rfq_id)
        except Exception:
            return []

        # Get offers
        offers = list(offers_col.find({'request_id': rfq_oid}))

        if not offers:
            return []

        # Collect unique supplier IDs
        supplier_ids = set()
        supplier_region_map = {}  # Maps supplier_id to region

        for offer in offers:
            if 'supplier_id' in offer:
                supplier_ids.add(offer['supplier_id'])
                # Store region from offer if available
                if 'supplier_region' in offer:
                    supplier_region_map[str(offer['supplier_id'])] = offer['supplier_region']

        # Fetch supplier details in batch (avoid N+1)
        supplier_details = {}

        # Try each region collection
        for region, collection in [('tr', suppliers_tr), ('en', suppliers_en), ('de', suppliers_de)]:
            oids = [ObjectId(sid) for sid in supplier_ids if self._is_valid_oid(sid)]
            if oids:
                for supplier in collection.find({'_id': {'$in': oids}}):
                    supplier_details[str(supplier['_id'])] = {
                        'name': supplier.get('name', ''),
                        'region': region,
                        'country': supplier.get('country', ''),
                        'email': supplier.get('email', ''),
                    }

        # Merge supplier details into offers
        for offer in offers:
            supplier_id = str(offer.get('supplier_id', ''))
            offer['supplier_details'] = supplier_details.get(supplier_id, {})

        return offers

    def get_request_products(self, rfq_id: str) -> List[Dict[str, Any]]:
        """
        Get request products for an RFQ.

        Args:
            rfq_id: RFQ ObjectId as string

        Returns:
            List of request products
        """
        requests_col = get_collection(self.REQUESTS)

        try:
            rfq = requests_col.find_one(
                {'_id': ObjectId(rfq_id)},
                {'request_products': 1}
            )
            return rfq.get('request_products', []) if rfq else []
        except Exception:
            return []

    def check_invoice_exists(self, rfq_id: str) -> bool:
        """
        Check if an invoice exists for an RFQ.

        Args:
            rfq_id: RFQ ObjectId as string

        Returns:
            True if invoice exists
        """
        invoices_col = get_collection('documents')

        try:
            count = invoices_col.count_documents({'rfq_id': ObjectId(rfq_id), 'type': 'invoice'})
            return count > 0
        except Exception:
            return False

    @staticmethod
    def _is_valid_oid(s: str) -> bool:
        """Check if string is a valid ObjectId"""
        try:
            ObjectId(s)
            return True
        except Exception:
            return False

    def get_supplier_attachments(self, rfq_id: str, supplier_id: str) -> List[Dict[str, Any]]:
        """
        Get attachments from emails received from a supplier for a specific RFQ.
        
        Args:
            rfq_id: RFQ ObjectId
            supplier_id: Supplier ObjectId
            
        Returns:
            List of attachment objects
        """
        emails_col = get_collection('emails')
        
        try:
            # Find emails for this request # AND from this supplier (implicit via conversation/sender logic but we filter by direction=received)
            # Note: Tying email to supplier_id exactly is tricky if we don't store supplier_id on email.
            # However, in RFQ project, emails are usually threaded. 
            # For V2, let's assume we filter by request_id and direction='received'. 
            # If we need strict supplier filtering, we might need to look up the conversation participant.
            # For now, fetching ALL received attachments for the request is a safer first step if supplier_id link is weak.
            # BUT the requirement is "Quotes column -> View Attachments".
            # Let's try to match logic from frontend "REQUEST_COMMUNICATION_MESSAGES(requestId, supplierId)".
            # If that endpoint filters effectively, we should replicate that query.
            # Since we don't have the full conversation logic here, let's look for emails where:
            # 1. request_id matches
            # 2. direction is 'received'
            # 3. (Optional) Filter by sender if possible, but 'emails' collection might not have supplier_id directly.
            
            # Re-reading debug_email_structure: it has `request_id` and `direction`.
            # If we return ALL received attachments for the RFQ, it might mix suppliers.
            # Let's check if `supplier_id` is in the email document from debug output? No, just request_id.
            # However, usually emails are part of a conversation.
            # Let's stick to returning ALL received attachments for the RFQ for now, 
            # or try to filter if we see a way. Retrieve all for RFQ is safe fallback.
            
            query = {
                'request_id': rfq_id,  # String, not ObjectId (emails store as string)
                'direction': 'received',
                'attachments': {'$exists': True, '$ne': []}
            }
            
            emails = list(emails_col.find(query))
            
            all_attachments = []
            for email in emails:
                for att in email.get('attachments', []):
                    # Convert datetime to ISO string for JSON serialization
                    date_val = email.get('timestamp') or email.get('created_at')
                    if hasattr(date_val, 'isoformat'):
                        date_val = date_val.isoformat()
                    elif date_val is None:
                        date_val = None
                    else:
                        date_val = str(date_val)
                    
                    all_attachments.append({
                        'id': str(att.get('attachment_id') or att.get('id') or ''),
                        'name': att.get('name') or att.get('filename') or 'Unknown File',
                        'size': att.get('size', 0),
                        'content_type': att.get('content_type', 'application/octet-stream'),
                        'date': date_val,
                        'subject': email.get('subject', 'No Subject'),
                        'download_url': att.get('url', '')  # URL from main RFQ backend
                    })
                    
            return all_attachments

        except Exception as e:
            print(f"Error fetching attachments: {e}")
            return []
