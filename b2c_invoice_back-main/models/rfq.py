"""RFQ related models"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class SupplierInfo(BaseModel):
    """Supplier information model"""
    id: Optional[str] = None
    name: str
    region: Optional[str] = None
    country: Optional[str] = None


class OfferSummary(BaseModel):
    """Offer summary for display"""
    id: str
    supplier_name: str
    unit_price: float
    total_price: float
    currency: str
    lead_time: Optional[str] = None
    moq: Optional[int] = None
    status: str

    model_config = ConfigDict(from_attributes=True)


class RFQModel(BaseModel):
    """RFQ request model"""
    id: str = Field(..., alias="_id")
    company_request_id: int
    product_name: Optional[str] = None
    product_description: Optional[str] = None
    quantity: Optional[int] = None
    unit: Optional[str] = None
    budget: Optional[float] = None
    currency: Optional[str] = None
    total_savings: Optional[float] = None
    savings_currency: Optional[str] = None

    # Selected supplier info
    selected_supplier: Optional[object] = None # Accepts dict or str (ID)
    selected_supplier_name: Optional[str] = None

    # Status and dates
    status: str
    phase: str
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    # Additional info for list view
    offer_count: int = 0
    has_invoice: bool = False
    linked_invoice_count: int = 0
    attachment_count: int = 0

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True
    )


class RequestProduct(BaseModel):
    """Request product model"""
    id: str = Field(..., alias="_id")
    product_name: str
    quantity: int
    unit: str
    budget: Optional[float] = None
    product_description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class PhaseHistory(BaseModel):
    """Phase history entry"""
    phase: str
    timestamp: Optional[datetime] = None
    trigger: Optional[str] = None
    notes: Optional[str] = None
    completed_by: Optional[str] = None
    total_savings: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class RFQDetailResponse(BaseModel):
    """Detailed RFQ response"""
    rfq: RFQModel
    request_products: List[RequestProduct] = []
    offers: List[OfferSummary] = []
    phase_history: List[PhaseHistory] = []
    selected_supplier_info: Optional[SupplierInfo] = None


class RFQListResponse(BaseModel):
    """Paginated RFQ list response"""
    rfqs: List[RFQModel]
    total: int
    page: int
    page_size: int
    has_next: bool
    has_prev: bool
