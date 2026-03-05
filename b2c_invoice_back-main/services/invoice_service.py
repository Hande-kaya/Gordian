"""
Invoice Service - Business logic for invoice operations.

Handles invoice upload, storage, and management.
"""

import os
from typing import Optional, Dict, Any
from datetime import datetime
from bson import ObjectId
from werkzeug.datastructures import FileStorage

from repositories.invoice_repository import InvoiceRepository
from repositories.rfq_repository import RFQRepository
from models.invoice import (
    InvoiceUploadRequest,
    InvoiceResponse,
    InvoiceListResponse
)


import uuid

class InvoiceService:
    """Service for invoice business logic"""

    # Allowed file types
    ALLOWED_EXTENSIONS = {
        '.pdf', '.png', '.jpg', '.jpeg',
        '.webp', '.heic', '.heif', '.bmp', '.gif', '.tiff', '.tif',
        '.xlsx', '.xls',
    }
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

    def __init__(self):
        self.repository = InvoiceRepository()
        self.rfq_repository = RFQRepository()
        self.document_ai = None  # Lazy load Document AI service

    def upload_invoice(
        self,
        rfq_id: str,
        file: FileStorage,
        user_id: str,
        company_id: str,
        notes: Optional[str] = None,
        is_admin: bool = False
    ) -> Optional[Dict[str, Any]]:
        """
        Upload an invoice for an RFQ.

        Args:
            rfq_id: Related RFQ ID
            file: Uploaded file
            user_id: User uploading
            company_id: Company ID
            notes: Optional notes
            is_admin: Whether user is admin (skips company check)

        Returns:
            Created invoice data or None if failed
        """
        # Validate file
        if not self._validate_file(file):
            print("DEBUG: File validation failed")
            return None

        # Validate RFQ exists and user has access
        rfq = self.rfq_repository.get_rfq_by_id(rfq_id)
        if not rfq:
            print(f"DEBUG: RFQ not found: {rfq_id}")
            return None

        rfq_company_id = str(rfq.get('company_id', ''))
        
        # Admin users can upload to any RFQ, use RFQ's company_id
        if is_admin:
            company_id = rfq_company_id
        elif rfq_company_id != company_id:
            print(f"DEBUG: Company mismatch: rfq={rfq_company_id}, user={company_id}")
            return None

        filename = self._sanitize_filename(file.filename)
        
        # Save temp file for OCR
        from config import Config
        temp_dir = getattr(Config, 'UPLOAD_FOLDER', 'uploads')
        os.makedirs(temp_dir, exist_ok=True)
        temp_path = os.path.join(temp_dir, f"temp_{uuid.uuid4()}_{filename}")
        
        try:
            file.save(temp_path)
            
            # Document AI Processing (lazy load to avoid import errors)
            ocr_text = None
            extracted_data = None

            try:
                if self.document_ai is None:
                    from services.document_ai_service import get_document_ai_service
                    self.document_ai = get_document_ai_service()

                # Determine mime type
                _, ext = os.path.splitext(filename.lower())
                mime_type = 'application/pdf' if ext == '.pdf' else f'image/{ext[1:]}'

                result = self.document_ai.process_document(temp_path, mime_type)
                if result.get('success'):
                    ocr_text = result.get('text_content')
                    extracted_data = result.get('extracted_data')
                    print(f"Document AI: Extracted {len(extracted_data.get('items', []))} line items")
                else:
                    print(f"Document AI Error: {result.get('error')}")
            except Exception as e:
                print(f"Document AI Error: {e}")

            # Read file data for GridFS
            with open(temp_path, 'rb') as f:
                file_data = f.read()

            # Save to GridFS
            gridfs_id = self.repository.save_file_to_gridfs(file_data, filename)
            if not gridfs_id:
                return None

            # Create file URL
            file_url = f"/api/invoices/files/{gridfs_id}"

            # Create invoice record
            invoice_id = self.repository.create_invoice(
                rfq_id=rfq_id,
                company_id=company_id,
                user_id=user_id,
                file_id=gridfs_id,
                file_name=filename,
                file_url=file_url,
                ocr_text=ocr_text,
                extracted_data=extracted_data,
                notes=notes
            )

            if not invoice_id:
                return None

            # Return created invoice
            invoice = self.repository.get_invoice_by_id(invoice_id)
            if invoice:
                return self._transform_invoice(invoice, rfq.get('company_request_id', 0))

            return None
            
        finally:
            # Clean up temp file
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass

    def get_invoice(self, invoice_id: str, user_id: str, company_id: str) -> Optional[Dict[str, Any]]:
        """
        Get invoice by ID with authorization check.

        Args:
            invoice_id: Invoice ID
            user_id: User ID
            company_id: Company ID

        Returns:
            Invoice data or None
        """
        invoice = self.repository.get_invoice_by_id(invoice_id)
        if not invoice:
            return None

        # Authorization check
        invoice_company_id = str(invoice.get('company_id', ''))
        if invoice_company_id != company_id:
            return None

        # Get RFQ for company_request_id
        rfq_id = str(invoice.get('rfq_id', ''))
        rfq = self.rfq_repository.get_rfq_by_id(rfq_id)
        company_request_id = rfq.get('company_request_id', 0) if rfq else 0

        return self._transform_invoice(invoice, company_request_id)

    def get_invoices_for_rfq(self, rfq_id: str, company_id: str) -> list:
        """
        Get all invoices for an RFQ.

        Args:
            rfq_id: RFQ ID
            company_id: Company ID for authorization

        Returns:
            List of invoices
        """
        # First check authorization via RFQ
        rfq = self.rfq_repository.get_rfq_by_id(rfq_id)
        if not rfq:
            return []

        rfq_company_id = str(rfq.get('company_id', ''))
        if rfq_company_id != company_id:
            return []

        invoices = self.repository.get_invoices_for_rfq(rfq_id)
        company_request_id = rfq.get('company_request_id', 0)

        return [self._transform_invoice(inv, company_request_id) for inv in invoices]

    def delete_invoice(self, invoice_id: str, user_id: str, company_id: str) -> bool:
        """
        Delete an invoice.

        Args:
            invoice_id: Invoice ID
            user_id: User requesting deletion
            company_id: Company ID

        Returns:
            True if deleted
        """
        # Authorization check
        invoice = self.repository.get_invoice_by_id(invoice_id)
        if not invoice:
            return False

        invoice_company_id = str(invoice.get('company_id', ''))
        if invoice_company_id != company_id:
            return False

        return self.repository.delete_invoice(invoice_id, user_id)

    def update_invoice_match(self, invoice_id: str, company_id: str, match_data: Dict[str, Any]) -> bool:
        """
        Update invoice with match results.
        
        Args:
            invoice_id: Invoice ID
            company_id: Company ID for auth
            match_data: Match result data (comparison + status)
            
        Returns:
            True if successful
        """
        # Auth check
        invoice = self.repository.get_invoice_by_id(invoice_id)
        if not invoice:
            return False
            
        if str(invoice.get('company_id', '')) != company_id:
            return False
            
        return self.repository.update_invoice_comparison(invoice_id, match_data)

    def _validate_file(self, file: FileStorage) -> bool:
        """Validate uploaded file"""
        if not file or not file.filename:
            return False

        # Check file extension
        _, ext = os.path.splitext(file.filename.lower())
        if ext not in self.ALLOWED_EXTENSIONS:
            return False

        # Check file size
        file.seek(0, os.SEEK_END)
        size = file.tell()
        file.seek(0)

        if size > self.MAX_FILE_SIZE:
            return False

        return True

    @staticmethod
    def _sanitize_filename(filename: str) -> str:
        """Sanitize filename for storage"""
        # Keep only safe characters
        safe_chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-_"
        name, ext = os.path.splitext(filename)

        # Sanitize name part
        safe_name = ''.join(c if c in safe_chars else '_' for c in name)

        # Limit length
        safe_name = safe_name[:100]

        return f"{safe_name}{ext}"

    def _transform_invoice(self, invoice_data: Dict[str, Any], company_request_id: int) -> Dict[str, Any]:
        """Transform invoice data to response format"""
        return {
            'id': str(invoice_data.get('_id', '')),
            'rfq_id': str(invoice_data.get('rfq_id', '')),
            'rfq_company_request_id': company_request_id,
            'company_id': str(invoice_data.get('company_id', '')),
            'user_id': str(invoice_data.get('user_id', '')),
            'file_name': invoice_data.get('file_name', ''),
            'file_url': invoice_data.get('file_url', ''),
            'uploaded_at': invoice_data.get('uploaded_at').isoformat() if invoice_data.get('uploaded_at') else None,
            'extracted_data': invoice_data.get('extracted_data', {}),
            'comparison': invoice_data.get('comparison', {}),
            'status': invoice_data.get('status', 'uploaded'),
            'notes': invoice_data.get('notes'),
            'verified_by': str(invoice_data.get('verified_by', '')) if invoice_data.get('verified_by') else None,
            'verified_at': invoice_data.get('verified_at').isoformat() if invoice_data.get('verified_at') else None,
            'created_at': invoice_data.get('created_at').isoformat() if invoice_data.get('created_at') else None,
            'updated_at': invoice_data.get('updated_at').isoformat() if invoice_data.get('updated_at') else None
        }
