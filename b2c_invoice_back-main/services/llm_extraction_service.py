"""
LLM Extraction Service - GPT-4o-mini entity extraction + multi-doc detection.

Handles:
- Structured entity extraction from OCR text via LLM
- Multi-document detection (layout analysis + LLM confirmation)
- Boundary-based per-document extraction for multi-doc PDFs
"""

import os
import re
import json
import logging
from typing import Optional, Dict, Any, List
from dataclasses import dataclass

logger = logging.getLogger(__name__)

from services.bank_statement_utils import normalize_currency as _normalize_currency


@dataclass
class MultiDocDetection:
    """Multi-document detection result."""
    is_multi_document: bool
    document_count: int
    confidence: float
    detection_reason: str
    boundaries: List = None


class LlmExtractionService:
    """LLM-based invoice entity extraction with multi-doc support."""

    def __init__(self):
        self._openai = None
        self._bank_extractor = None

    @property
    def openai_client(self):
        """Lazy load OpenAI client."""
        if self._openai is None:
            from openai import OpenAI
            self._openai = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
        return self._openai

    def extract_from_ocr(
        self,
        ocr_text: str,
        ocr_index: Dict[str, List[Dict]],
        page_count: int,
        doc_type: str = 'invoice'
    ) -> Dict[str, Any]:
        """
        Main entry: detect multi-doc, extract entities per document.

        Returns:
            {extracted_data, multi_document, extracted_documents (if multi)}
        """
        # Bank statements: skip multi-doc detection, use dedicated extractor
        if doc_type == 'bank-statement':
            if self._bank_extractor is None:
                from services.bank_statement_extractor import (
                    BankStatementExtractor,
                )
                self._bank_extractor = BankStatementExtractor(
                    self.openai_client
                )
            extracted_data = self._bank_extractor.extract(
                ocr_text, ocr_index, page_count
            )
            return {
                'extracted_data': extracted_data,
                'multi_document': {
                    'detected': False,
                    'document_count': 1,
                    'confidence': 1.0
                },
                'extracted_documents': None
            }

        # Step 1: Multi-document detection
        multi_doc = self._detect_multiple_documents(
            ocr_text, ocr_index, page_count
        )

        # Step 2: Extract entities
        if multi_doc and multi_doc.is_multi_document:
            extracted_documents = self._extract_by_boundaries(
                ocr_index, multi_doc
            )
        else:
            extracted_documents = [self._llm_extract_entities(ocr_text)]

        # Step 2b: Add bounding boxes to all extracted documents
        from utils.bbox_matcher import add_bounding_boxes
        for doc_data in extracted_documents:
            add_bounding_boxes(doc_data, ocr_text, ocr_index)

        # Build response
        if len(extracted_documents) <= 1:
            return {
                'extracted_data': extracted_documents[0] if extracted_documents else self._empty_extracted_data(),
                'multi_document': {
                    'detected': False,
                    'document_count': 1,
                    'confidence': 1.0
                },
                'extracted_documents': None
            }

        boundaries_serialized = self._serialize_boundaries(multi_doc)

        return {
            'extracted_data': extracted_documents[0],
            'multi_document': {
                'detected': True,
                'document_count': len(extracted_documents),
                'confidence': multi_doc.confidence if multi_doc else 0.8,
                'detection_reason': multi_doc.detection_reason if multi_doc else 'layout',
                'boundaries': boundaries_serialized,
                'is_parent': True
            },
            'extracted_documents': extracted_documents
        }

    def _detect_multiple_documents(
        self,
        ocr_text: str,
        ocr_index: Dict[str, List[Dict]],
        page_count: int
    ) -> Optional[MultiDocDetection]:
        """Hybrid detection: layout analysis first, LLM confirmation if needed."""
        layout_result = None

        try:
            from services.layout.service import get_layout_analysis_service
            layout_service = get_layout_analysis_service()
            layout_result = layout_service.analyze_for_multi_document(
                ocr_index, page_count
            )

            logger.info(
                f"Layout analysis: multi_doc={layout_result.is_multi_document}, "
                f"count={layout_result.document_count}, "
                f"confidence={layout_result.confidence:.2f}"
            )

            if layout_result.is_multi_document and layout_result.confidence >= 0.7:
                return MultiDocDetection(
                    is_multi_document=True,
                    document_count=layout_result.document_count,
                    confidence=layout_result.confidence,
                    detection_reason=f'layout:{layout_result.detection_method}',
                    boundaries=layout_result.boundaries
                )
        except Exception as e:
            logger.error(f"Layout analysis error: {e}")

        # LLM confirmation for borderline cases (confidence 0.4-0.7)
        if (layout_result and layout_result.is_multi_document
                and layout_result.confidence >= 0.4):
            llm_result = self._llm_detect_multi_doc(ocr_text)
            if llm_result and llm_result.is_multi_document:
                llm_result.boundaries = layout_result.boundaries
                return llm_result

        return None

    def _extract_by_boundaries(
        self,
        ocr_index: Dict[str, List[Dict]],
        multi_doc: MultiDocDetection
    ) -> List[Dict[str, Any]]:
        """Extract per-document using layout boundaries."""
        from services.layout.service import get_layout_analysis_service
        from difflib import SequenceMatcher

        layout_service = get_layout_analysis_service()
        boundaries = multi_doc.boundaries

        if not boundaries:
            full_text = '\n'.join(
                b.get('text', '') for b in ocr_index.get('blocks', [])
            )
            return [self._llm_extract_entities(full_text)]

        boundary_texts = layout_service.extract_texts_for_boundaries(
            ocr_index, boundaries
        )

        # Safety check: if boundary texts are too similar, it's the same document
        if len(boundary_texts) == 2:
            t1, t2 = boundary_texts[0].strip(), boundary_texts[1].strip()
            if t1 and t2:
                similarity = SequenceMatcher(None, t1.lower(), t2.lower()).ratio()
                logger.info(f"Boundary text similarity: {similarity:.2%}")
                if similarity > 0.6:
                    logger.warning(
                        f"Boundary texts too similar ({similarity:.2%}), "
                        f"treating as single document"
                    )
                    full_text = '\n'.join(
                        b.get('text', '') for b in ocr_index.get('blocks', [])
                    )
                    return [self._llm_extract_entities(full_text)]

        extracted_docs = []
        for idx, text in enumerate(boundary_texts):
            if len(text.strip()) < 50:
                continue

            doc_data = self._llm_extract_entities(text)
            doc_data['_split_index'] = idx
            if idx < len(boundaries):
                b = boundaries[idx]
                doc_data['_boundary'] = {
                    'page': b.page,
                    'pages': b.pages if b.pages else [b.page],
                    'x_min': b.x_min, 'x_max': b.x_max,
                    'y_min': b.y_min, 'y_max': b.y_max,
                    'confidence': b.confidence,
                    'detection_method': b.detection_method
                }
            extracted_docs.append(doc_data)

        if not extracted_docs:
            full_text = '\n'.join(
                b.get('text', '') for b in ocr_index.get('blocks', [])
            )
            return [self._llm_extract_entities(full_text)]

        return extracted_docs

    def _llm_detect_multi_doc(
        self, ocr_text: str
    ) -> Optional[MultiDocDetection]:
        """LLM-based multi-document detection."""
        prompt = f"""Analyze this OCR text and determine if it contains MULTIPLE separate invoices or receipts.

OCR TEXT (first 3000 chars):
{ocr_text[:3000]}

Signs of multiple documents:
1. Multiple different supplier/company names
2. Multiple different invoice numbers
3. Multiple different dates (not just invoice date + due date)
4. Multiple "Total" amounts with different values
5. Multiple tax IDs (VKN/TCKN)
6. Repeated header sections

RESPOND WITH JSON ONLY:
{{
    "multiple_documents": true/false,
    "document_count": 1 or 2 or 3,
    "confidence": 0.0-1.0,
    "reason": "brief explanation"
}}"""

        try:
            response = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                max_tokens=200,
                response_format={"type": "json_object"}
            )
            result = json.loads(response.choices[0].message.content)

            if result.get('multiple_documents'):
                return MultiDocDetection(
                    is_multi_document=True,
                    document_count=result.get('document_count', 2),
                    confidence=result.get('confidence', 0.7),
                    detection_reason=f"llm:{result.get('reason', 'detected')}"
                )
        except Exception as e:
            logger.error(f"Multi-doc LLM detection error: {e}")

        return None

    def _llm_extract_entities(self, ocr_text: str) -> Dict[str, Any]:
        """Extract structured invoice fields via GPT-4o-mini."""
        prompt = f"""You are an invoice data extraction assistant. Extract all relevant information from this invoice OCR text.

OCR TEXT:
{ocr_text[:6000]}

Extract the following fields (return null if not found):

RESPOND WITH JSON ONLY:
{{
    "invoice_number": "string or null",
    "invoice_date": "string or null",
    "invoice_type": "string or null",
    "due_date": "string or null",
    "supplier_name": "company name (not website), string or null",
    "supplier_address": "full address, string or null",
    "supplier_tax_id": "string or null",
    "supplier_email": "must match supplier domain, string or null",
    "supplier_phone": "string or null",
    "supplier_website": "string or null",
    "supplier_iban": "primary IBAN, string or null",
    "all_ibans": ["list of ALL IBANs found"],
    "receiver_name": "customer/buyer name, string or null",
    "receiver_address": "string or null",
    "receiver_email": "customer email, string or null",
    "receiver_tax_id": "string or null",
    "total_amount": "number or null",
    "net_amount": "subtotal before tax, number or null",
    "total_tax_amount": "VAT/KDV amount, number or null",
    "currency": "MUST be 3-letter ISO 4217 code (EUR, USD, GBP, TRY, CHF, etc). Convert symbols: €=EUR, $=USD, £=GBP, ₺=TRY, TL=TRY. Detect from symbols or context (country, language, address). Return null if cannot be determined. NEVER return symbols like € or ₺.",
    "line_items": [
        {{
            "description": "item name",
            "quantity": "number",
            "unit": "Adet, Kg, etc.",
            "unit_price": "number",
            "amount": "total for this line"
        }}
    ],
    "expense_category": "one of: food, fuel, accommodation, transport, toll, parking, office_supplies, communication, other"
}}

IMPORTANT:
- supplier_name should be the COMPANY NAME (with A.S., LTD, etc.), NOT a website
- supplier_email domain should match supplier_website domain
- receiver_email is the CUSTOMER's email (under Musteri/Alici section)
- Find ALL IBANs in the document (may have multiple bank accounts)
- For Turkish invoices: KDV = VAT, Genel Toplam = Total, Ara Toplam = Subtotal
- expense_category: Detect from vendor type, line items, and keywords.
  food=restaurant/cafe/supermarket/mensa/kantine
  fuel=gas station/petrol/benzin/bleifrei/diesel/tankstelle/enilive/eni/shell/bp
  accommodation=hotel/hostel/pension/unterkunft
  transport=train/bus/taxi/flight/sbb/bahn
  toll=highway toll/bridge toll/peage/maut/vignette
  parking=parking lot/garage/parkhaus
  office_supplies=stationery/office equipment/burobedarf
  communication=phone/internet/telefon
  other=if none match"""

        try:
            response = self.openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                max_tokens=2000,
                response_format={"type": "json_object"}
            )
            llm_result = json.loads(response.choices[0].message.content)
            logger.info(f"LLM extracted fields: {list(llm_result.keys())}")
            # If LLM returned null, try regex fallback from OCR text
            llm_currency = llm_result.get('currency')
            if not llm_currency:
                from services.bank_statement_utils import detect_currency_from_text
                detected = detect_currency_from_text(ocr_text)
                if detected:
                    llm_result['currency'] = detected
                    logger.info(f"Currency fallback: {detected}")
            return self._convert_to_standard_format(llm_result)

        except Exception as e:
            logger.error(f"LLM extraction error: {e}")
            return self._empty_extracted_data()

    def _convert_to_standard_format(self, llm_result: Dict) -> Dict[str, Any]:
        """Convert LLM JSON result to standard extracted_data format."""
        data = {
            'invoice_number': llm_result.get('invoice_number'),
            'invoice_date': llm_result.get('invoice_date'),
            'invoice_type': llm_result.get('invoice_type'),
            'due_date': llm_result.get('due_date'),
            'supplier_name': llm_result.get('supplier_name'),
            'supplier_tax_id': llm_result.get('supplier_tax_id'),
            'supplier_address': llm_result.get('supplier_address'),
            'supplier_email': llm_result.get('supplier_email'),
            'supplier_phone': llm_result.get('supplier_phone'),
            'supplier_website': llm_result.get('supplier_website'),
            'supplier_iban': llm_result.get('supplier_iban'),
            'receiver_name': llm_result.get('receiver_name'),
            'receiver_address': llm_result.get('receiver_address'),
            'receiver_email': llm_result.get('receiver_email'),
            'total_amount': self._parse_amount(llm_result.get('total_amount')),
            'total_tax_amount': self._parse_amount(
                llm_result.get('total_tax_amount')
            ),
            'net_amount': self._parse_amount(llm_result.get('net_amount')),
            'currency': _normalize_currency(llm_result.get('currency')),
            'items': [],
            'entities_with_bounds': [],
            'all_ibans': [],
            'expense_category': llm_result.get('expense_category', 'other')
        }

        for item in llm_result.get('line_items', []):
            if not isinstance(item, dict):
                continue
            data['items'].append({
                'description': item.get('description'),
                'quantity': self._parse_number(item.get('quantity')),
                'unit': item.get('unit'),
                'unit_price': self._parse_amount(item.get('unit_price')),
                'amount': self._parse_amount(item.get('amount'))
            })

        for iban in llm_result.get('all_ibans', []):
            if iban:
                data['all_ibans'].append({
                    'value': iban,
                    'confidence': 0.95,
                    'source': 'llm_extracted'
                })

        if not data['supplier_iban'] and data['all_ibans']:
            data['supplier_iban'] = data['all_ibans'][0]['value']

        # Normalize amounts to EUR for cross-currency matching
        try:
            from services.exchange_rate_service import normalize_document_amounts
            normalize_document_amounts(data)
        except Exception as e:
            logger.warning(f"Amount normalization failed: {e}")

        return data

    @staticmethod
    def _empty_extracted_data() -> Dict[str, Any]:
        """Return empty extracted data structure."""
        return {
            'invoice_number': None, 'invoice_date': None,
            'invoice_type': None, 'due_date': None,
            'supplier_name': None, 'supplier_tax_id': None,
            'supplier_address': None, 'supplier_email': None,
            'supplier_phone': None, 'supplier_website': None,
            'supplier_iban': None,
            'receiver_name': None, 'receiver_address': None,
            'total_amount': None, 'total_tax_amount': None,
            'net_amount': None, 'currency': None,
            'items': [], 'entities_with_bounds': [],
            'all_ibans': [], 'expense_category': 'other'
        }

    @staticmethod
    def _parse_amount(value) -> Optional[float]:
        """Parse amount string/number to float."""
        if value is None:
            return None
        try:
            if isinstance(value, (int, float)):
                return float(value)
            cleaned = str(value).replace('.', '').replace(',', '.').strip()
            return float(cleaned)
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _parse_number(value) -> Optional[float]:
        """Parse number string to float."""
        if value is None:
            return None
        try:
            if isinstance(value, (int, float)):
                return float(value)
            cleaned = str(value).replace(',', '.').strip()
            return float(cleaned)
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _serialize_boundaries(multi_doc: MultiDocDetection) -> List[Dict]:
        """Serialize boundary objects for storage."""
        if not multi_doc or not multi_doc.boundaries:
            return []
        result = []
        for b in multi_doc.boundaries:
            result.append({
                'page': b.page,
                'pages': b.pages if b.pages else [b.page],
                'x_min': b.x_min, 'x_max': b.x_max,
                'y_min': b.y_min, 'y_max': b.y_max,
                'confidence': b.confidence,
                'detection_method': b.detection_method
            })
        return result


# Singleton
_llm_extraction_service = None


def get_llm_extraction_service() -> LlmExtractionService:
    """Get or create LLM extraction service instance."""
    global _llm_extraction_service
    if _llm_extraction_service is None:
        _llm_extraction_service = LlmExtractionService()
    return _llm_extraction_service
