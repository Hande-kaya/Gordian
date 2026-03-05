"""Invoice related models"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class InvoiceUploadRequest(BaseModel):
    """Request model for invoice upload"""
    rfq_id: str = Field(..., description="ID of the related RFQ")
    notes: Optional[str] = Field(None, max_length=1000)


class InvoiceComparison(BaseModel):
    """Invoice comparison data"""
    expected_amount: Optional[float] = None
    actual_amount: Optional[float] = None
    difference: Optional[float] = None
    status: str = "pending_review"  # match, discrepancy, pending_review, partial
    
    # New fields for Phase 2
    linked_quote_id: Optional[str] = None
    match_score: Optional[float] = None
    verification_result: Optional[dict] = None # Full GPT output


class ExtractedInvoiceData(BaseModel):
    """OCR extracted invoice data"""
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    supplier_name: Optional[str] = None
    total_amount: Optional[float] = None
    currency: Optional[str] = None
    items: List[dict] = []
    raw_data: Optional[dict] = None


class InvoiceResponse(BaseModel):
    """Invoice response model"""
    id: str = Field(..., alias="_id")
    rfq_id: str
    rfq_company_request_id: int
    company_id: str
    user_id: str

    # File info
    file_name: str
    file_url: str
    file_gridfs_id: Optional[str] = None
    uploaded_at: datetime
    
    # OCR Data
    ocr_text: Optional[str] = None
    extracted_data: Optional[ExtractedInvoiceData] = None

    # Comparison
    comparison: Optional[InvoiceComparison] = None

    # Status
    status: str
    notes: Optional[str] = None
    verified_by: Optional[str] = None
    verified_at: Optional[datetime] = None

    created_at: datetime
    updated_at: datetime


class InvoiceListResponse(BaseModel):
    """Paginated invoice list response"""
    invoices: List[InvoiceResponse]
    total: int
    page: int
    page_size: int
    has_next: bool
    has_prev: bool
