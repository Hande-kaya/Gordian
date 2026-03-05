"""
Document AI Service - Google Cloud Document AI OCR + index building.

Handles only OCR text extraction and positional index building.
LLM extraction and multi-doc detection are in llm_extraction_service.py.
"""

import os
import logging
from typing import Optional, Dict, Any, List
from google.cloud import documentai_v1 as documentai
from google.api_core.client_options import ClientOptions

logger = logging.getLogger(__name__)


class DocumentAIService:
    """OCR text extraction via Document AI with positional index."""

    def __init__(self):
        self.project_id = os.getenv('GCP_PROJECT_ID', 'eco-muse-486406-i1')
        self.location = os.getenv('GCP_LOCATION', 'eu')
        self.processor_id = os.getenv('GCP_PROCESSOR_ID', 'a4bf82ab242acc63')
        self._client = None

    @property
    def client(self):
        """Lazy load Document AI client"""
        if self._client is None:
            opts = ClientOptions(
                api_endpoint=f"{self.location}-documentai.googleapis.com"
            )
            self._client = documentai.DocumentProcessorServiceClient(
                client_options=opts
            )
        return self._client

    @property
    def processor_name(self) -> str:
        """Full processor resource name"""
        return (
            f"projects/{self.project_id}/"
            f"locations/{self.location}/"
            f"processors/{self.processor_id}"
        )

    def process_document_bytes(
        self,
        content: bytes,
        mime_type: str = "application/pdf"
    ) -> Dict[str, Any]:
        """
        Process document: OCR text extraction + positional index.

        Returns:
            Dict with success, ocr_text, ocr_index, page_count
        """
        try:
            creds_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS', '(not set)')
            logger.info(
                f"OCR request: processor={self.processor_name}, "
                f"mime={mime_type}, size={len(content)} bytes, "
                f"creds={creds_path}"
            )

            request = documentai.ProcessRequest(
                name=self.processor_name,
                raw_document=documentai.RawDocument(
                    content=content,
                    mime_type=mime_type
                )
            )
            result = self.client.process_document(request=request)
            document = result.document
            ocr_text = document.text
            page_count = len(document.pages)

            logger.info(
                f"OCR completed: {len(ocr_text)} chars, {page_count} pages"
            )

            if not ocr_text or not ocr_text.strip():
                logger.warning(
                    f"OCR returned empty text! pages={page_count}, "
                    f"mime={mime_type}, content_size={len(content)}"
                )
                return {
                    'success': True,
                    'ocr_text': '',
                    'ocr_index': {'blocks': [], 'lines': [], 'tokens': []},
                    'page_count': page_count
                }

            ocr_index = self._build_ocr_index(document)

            return {
                'success': True,
                'ocr_text': ocr_text,
                'ocr_index': ocr_index,
                'page_count': page_count
            }

        except Exception as e:
            logger.error(
                f"Document AI error: {e} | processor={self.processor_name} | "
                f"creds={os.getenv('GOOGLE_APPLICATION_CREDENTIALS', '(not set)')}",
                exc_info=True
            )
            return {'success': False, 'error': str(e)}

    def _build_ocr_index(self, document) -> Dict[str, List[Dict]]:
        """Build index of blocks, lines, and tokens with positions."""
        index: Dict[str, List[Dict]] = {
            'blocks': [],
            'lines': [],
            'tokens': []
        }

        for page_idx, page in enumerate(document.pages):
            self._index_elements(
                index['blocks'], page.blocks, document.text, page_idx
            )
            self._index_elements(
                index['lines'], page.lines, document.text, page_idx
            )
            self._index_elements(
                index['tokens'], page.tokens, document.text, page_idx
            )

        for key in index:
            index[key] = sorted(index[key], key=lambda x: x['start'])

        logger.info(
            f"Built index: {len(index['blocks'])} blocks, "
            f"{len(index['lines'])} lines, {len(index['tokens'])} tokens"
        )
        return index

    def _index_elements(
        self,
        target: List[Dict],
        elements,
        full_text: str,
        page_idx: int
    ) -> None:
        """Index a set of layout elements (blocks/lines/tokens)."""
        for elem in elements:
            if not elem.layout or not elem.layout.text_anchor:
                continue
            for segment in elem.layout.text_anchor.text_segments:
                start = int(segment.start_index) if segment.start_index else 0
                end = int(segment.end_index) if segment.end_index else 0
                bbox = self._get_bbox_from_layout(elem.layout)
                if bbox:
                    target.append({
                        'start': start,
                        'end': end,
                        'text': full_text[start:end],
                        'bbox': bbox,
                        'page': page_idx
                    })

    def _get_bbox_from_layout(
        self, layout
    ) -> Optional[List[Dict[str, float]]]:
        """Extract bounding box from layout."""
        poly = layout.bounding_poly
        if not poly or not poly.normalized_vertices:
            return None
        return [{'x': v.x, 'y': v.y} for v in poly.normalized_vertices]


# Singleton instance
_document_ai_service = None


def get_document_ai_service() -> DocumentAIService:
    """Get or create Document AI service instance"""
    global _document_ai_service
    if _document_ai_service is None:
        _document_ai_service = DocumentAIService()
    return _document_ai_service
