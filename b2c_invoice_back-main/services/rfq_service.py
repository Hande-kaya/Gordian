"""
RFQ Service - Business logic for RFQ operations.

Handles validation, transformation, and coordination between repositories.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
from bson import ObjectId

from repositories.rfq_repository import RFQRepository
from models.rfq import (
    RFQModel,
    RFQListResponse,
    RFQDetailResponse,
    OfferSummary,
    RequestProduct,
    PhaseHistory,
    SupplierInfo
)


class RFQService:
    """Service for RFQ business logic"""

    def __init__(self):
        self.repository = RFQRepository()

    def get_completed_rfqs(
        self,
        company_id: Optional[str],
        page: int = 1,
        page_size: int = 20
    ) -> RFQListResponse:
        """
        Get paginated list of completed RFQs.

        Args:
            company_id: Filter by company
            page: Page number (1-indexed)
            page_size: Items per page (max 100)

        Returns:
            RFQListResponse with RFQs and pagination info
        """
        # Validate and cap page_size
        page_size = min(max(1, page_size), 100)

        # Get data from repository
        result = self.repository.get_completed_rfqs(
            company_id=company_id,
            page=page,
            page_size=page_size
        )

        # Transform to models
        rfqs = [self._transform_rfq(r) for r in result['rfqs']]

        return RFQListResponse(
            rfqs=rfqs,
            total=result['total'],
            page=result['page'],
            page_size=result['page_size'],
            has_next=result['has_next'],
            has_prev=result['has_prev']
        )

    def get_rfq_detail(self, rfq_id: str, user_id: str, company_id: str) -> Optional[RFQDetailResponse]:
        """
        Get detailed RFQ information including offers and products.

        Args:
            rfq_id: RFQ ID
            user_id: User ID for authorization check
            company_id: Company ID for authorization check

        Returns:
            RFQDetailResponse or None if not found or unauthorized
        """
        # Get RFQ
        rfq = self.repository.get_rfq_by_id(rfq_id)
        if not rfq:
            return None

        # Authorization check - user must belong to the company
        rfq_company_id = str(rfq.get('company_id', ''))
        if rfq_company_id != company_id:
            return None

        # Get related data
        offers_data = self.repository.get_offers_for_rfq(rfq_id)
        products_data = self.repository.get_request_products(rfq_id)

        # Transform to models
        rfq_model = self._transform_rfq(rfq)
        offers = [self._transform_offer(o) for o in offers_data]
        products = [self._transform_product(p) for p in products_data]
        phase_history = [self._transform_phase(h) for h in rfq.get('phase_history', [])]

        # Get selected supplier info
        selected_supplier_info = None
        if rfq.get('selected_supplier'):
            selected_supplier_info = self._extract_supplier_info(rfq['selected_supplier'])

        return RFQDetailResponse(
            rfq=rfq_model,
            request_products=products,
            offers=offers,
            phase_history=phase_history,
            selected_supplier_info=selected_supplier_info
        )

    def _transform_rfq(self, rfq_data: Dict[str, Any]) -> RFQModel:
        """Transform database document to RFQ model"""
        # Convert ObjectId to string
        rfq_data['_id'] = str(rfq_data.get('_id', ''))

        # Handle dates
        for field in ['completed_at', 'created_at', 'updated_at']:
            if field in rfq_data and rfq_data[field] is not None:
                if not isinstance(rfq_data[field], datetime):
                    rfq_data[field] = datetime.fromisoformat(rfq_data[field]) if isinstance(rfq_data[field], str) else None

        return RFQModel(**rfq_data)

    def _transform_offer(self, offer_data: Dict[str, Any]) -> OfferSummary:
        """Transform offer data to summary model"""
        supplier_details = offer_data.get('supplier_details', {})

        return OfferSummary(
            id=str(offer_data.get('_id', '')),
            supplier_name=supplier_details.get('name', offer_data.get('supplier_name', 'Unknown')),
            unit_price=float(offer_data.get('unit_price', 0)),
            total_price=float(offer_data.get('total_price', 0)),
            currency=offer_data.get('currency', 'USD'),
            lead_time=offer_data.get('lead_time'),
            moq=offer_data.get('moq'),
            status=offer_data.get('status', 'pending')
        )

    def _transform_product(self, product_data: Dict[str, Any]) -> RequestProduct:
        """Transform product data to model"""
        product_data['_id'] = str(product_data.get('_id', ''))
        return RequestProduct(**product_data)

    def _transform_phase(self, phase_data: Dict[str, Any]) -> PhaseHistory:
        """Transform phase history data to model"""
        # Handle timestamp
        if 'timestamp' in phase_data and not isinstance(phase_data['timestamp'], datetime):
            if isinstance(phase_data['timestamp'], str):
                phase_data['timestamp'] = datetime.fromisoformat(phase_data['timestamp'])

        return PhaseHistory(**phase_data)

    def _extract_supplier_info(self, supplier_data: Dict[str, Any]) -> Optional[SupplierInfo]:
        """Extract supplier info from selected_supplier data"""
        if not supplier_data:
            return None

        return SupplierInfo(
            id=str(supplier_data.get('supplier_id', '')),
            name=supplier_data.get('name', ''),
            region=supplier_data.get('region'),
            country=supplier_data.get('country')
        )

    def validate_rfq_access(self, rfq_id: str, company_id: str) -> bool:
        """
        Validate that a company can access an RFQ.

        Args:
            rfq_id: RFQ ID
            company_id: Company ID

        Returns:
            True if authorized
        """
        rfq = self.repository.get_rfq_by_id(rfq_id)
        if not rfq:
            return False

        rfq_company_id = str(rfq.get('company_id', ''))
        return rfq_company_id == company_id
