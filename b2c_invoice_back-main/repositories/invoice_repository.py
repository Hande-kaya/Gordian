from datetime import datetime
from typing import List, Optional, Dict, Any
from bson import ObjectId

from database import get_db, get_collection
from repositories.mixins.gridfs_mixin import GridFSMixin


class InvoiceRepository(GridFSMixin):
    """Repository for invoice documents with GridFS support"""

    COLLECTION = 'documents'

    def create_invoice(
        self,
        rfq_id: str,
        company_id: str,
        user_id: str,
        file_id: str,
        file_name: str,
        file_url: str,
        ocr_text: Optional[str] = None,
        extracted_data: Optional[Dict[str, Any]] = None,
        notes: Optional[str] = None
    ) -> Optional[str]:
        """
        Create a new invoice record.

        Args:
            rfq_id: Related RFQ ID
            company_id: Company ID
            user_id: User ID who uploaded
            file_id: GridFS file ID
            file_name: Original file name
            file_url: URL to access file
            ocr_text: Extracted OCR text
            extracted_data: Structured extracted data
            notes: Optional notes

        Returns:
            Created invoice ID or None
        """
        collection = get_collection(self.COLLECTION)

        try:
            rfq_oid = ObjectId(rfq_id)
            company_oid = ObjectId(company_id)
            user_oid = ObjectId(user_id)
        except Exception:
            return None

        document = {
            'type': 'invoice', # Important for documents collection
            'rfq_id': rfq_oid,
            'company_id': company_oid,
            'user_id': user_oid,
            'file_id': ObjectId(file_id),
            'file_name': file_name,
            'file_url': file_url,
            'uploaded_at': datetime.utcnow(),
            'ocr_text': ocr_text,
            'extracted_data': extracted_data or {},
            'comparison': {
                'status': 'pending_review'
            },
            'status': 'uploaded',
            'notes': notes,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }

        result = collection.insert_one(document)
        return str(result.inserted_id) if result.inserted_id else None

    def get_invoice_by_id(self, invoice_id: str) -> Optional[Dict[str, Any]]:
        """
        Get invoice by ID.

        Args:
            invoice_id: Invoice ObjectId as string

        Returns:
            Invoice document or None
        """
        collection = get_collection(self.COLLECTION)

        try:
            # Also ensure type is invoice
            invoice = collection.find_one({'_id': ObjectId(invoice_id), 'type': 'invoice'})
            return invoice
        except Exception:
            return None

    def get_invoices_for_rfq(self, rfq_id: str) -> List[Dict[str, Any]]:
        """
        Get all invoices for an RFQ.

        Args:
            rfq_id: RFQ ObjectId as string

        Returns:
            List of invoices
        """
        collection = get_collection(self.COLLECTION)

        try:
            invoices = list(collection.find({'rfq_id': ObjectId(rfq_id), 'type': 'invoice'}))
            return invoices
        except Exception:
            return []

    def get_invoices_by_company(
        self,
        company_id: str,
        page: int = 1,
        page_size: int = 20,
        match_status: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get invoices for a company with pagination.

        Args:
            company_id: Company ID
            page: Page number
            page_size: Items per page
            match_status: Filter by match status ('matched', 'unmatched', 'discrepancy')

        Returns:
            Dict with invoices list and pagination info
        """
        collection = get_collection(self.COLLECTION)

        try:
            company_oid = ObjectId(company_id)
        except Exception:
            return {
                'invoices': [],
                'total': 0,
                'page': page,
                'page_size': page_size,
                'has_next': False,
                'has_prev': False
            }

        skip = (page - 1) * page_size

        query = {'company_id': company_oid, 'type': 'invoice'}

        # Add match status filter (defense-in-depth: ensure string)
        if match_status and not isinstance(match_status, str):
            match_status = None
        if match_status == 'matched':
            query['$or'] = [
                {'comparison.status': 'matched'},
                {'comparison.linked_quote_id': {'$exists': True, '$ne': None}}
            ]
        elif match_status == 'unmatched':
            query['$and'] = [
                {'$or': [
                    {'comparison.status': {'$exists': False}},
                    {'comparison.status': {'$in': ['pending', 'pending_review', None]}}
                ]},
                {'$or': [
                    {'comparison.linked_quote_id': {'$exists': False}},
                    {'comparison.linked_quote_id': None}
                ]}
            ]
        elif match_status == 'discrepancy':
            query['comparison.status'] = 'discrepancy'

        invoices = list(
            collection
            .find(query)
            .sort('created_at', -1)
            .skip(skip)
            .limit(page_size)
        )

        total = collection.count_documents(query)

        return {
            'invoices': invoices,
            'total': total,
            'page': page,
            'page_size': page_size,
            'has_next': skip + page_size < total,
            'has_prev': page > 1
        }

    def update_invoice_status(
        self,
        invoice_id: str,
        status: str,
        verified_by: Optional[str] = None
    ) -> bool:
        """
        Update invoice status.

        Args:
            invoice_id: Invoice ID
            status: New status
            verified_by: User ID who verified

        Returns:
            True if successful
        """
        collection = get_collection(self.COLLECTION)

        try:
            invoice_oid = ObjectId(invoice_id)
        except Exception:
            return False

        update_data = {
            'status': status,
            'updated_at': datetime.utcnow()
        }

        if verified_by:
            try:
                update_data['verified_by'] = ObjectId(verified_by)
                update_data['verified_at'] = datetime.utcnow()
            except Exception:
                pass

        result = collection.update_one(
            {'_id': invoice_oid},
            {'$set': update_data}
        )

        return result.modified_count > 0

    def update_invoice_comparison(
        self,
        invoice_id: str,
        comparison_data: Dict[str, Any]
    ) -> bool:
        """
        Update invoice comparison data.
        
        Args:
            invoice_id: Invoice ID
            comparison_data: Comparison dictionary
            
        Returns:
            True if successful
        """
        collection = get_collection(self.COLLECTION)
        
        try:
            invoice_oid = ObjectId(invoice_id)
        except Exception:
            return False
            
        # Determine status from comparison data if available
        status = comparison_data.get('status', 'pending_review')
        
        update_data = {
            'comparison': comparison_data,
            'status': status,
            'updated_at': datetime.utcnow()
        }
        
        result = collection.update_one(
            {'_id': invoice_oid},
            {'$set': update_data}
        )
        
        return result.modified_count > 0

    def delete_invoice(self, invoice_id: str, user_id: str) -> bool:
        """
        Delete an invoice (soft delete by changing status).

        Args:
            invoice_id: Invoice ID
            user_id: User ID requesting deletion

        Returns:
            True if successful
        """
        collection = get_collection(self.COLLECTION)

        try:
            invoice_oid = ObjectId(invoice_id)
            user_oid = ObjectId(user_id)
        except Exception:
            return False

        result = collection.update_one(
            {'_id': invoice_oid, 'user_id': user_oid},
            {'$set': {
                'status': 'deleted',
                'updated_at': datetime.utcnow()
            }}
        )

        return result.modified_count > 0
