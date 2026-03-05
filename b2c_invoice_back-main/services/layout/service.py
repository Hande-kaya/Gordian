"""
Layout Analysis Service - Main entry point for multi-document detection.

Uses composition of mixins for modular, testable code.
"""

from typing import Dict, List, Optional
import logging

from .models import MultiDocResult
from .detection import LayoutDetectionMixin
from .page_analysis import PageAnalysisMixin
from .extraction import ExtractionMixin
from .helpers import LayoutHelpersMixin

logger = logging.getLogger(__name__)


class LayoutAnalysisService(
    LayoutHelpersMixin,
    LayoutDetectionMixin,
    PageAnalysisMixin,
    ExtractionMixin
):
    """
    Service for analyzing document layout to detect multiple documents.

    Combines detection strategies, per-page analysis, and text extraction.
    """

    def analyze_for_multi_document(
        self,
        ocr_index: Dict[str, List[Dict]],
        page_count: int = 1
    ) -> MultiDocResult:
        """
        Main entry point: Analyze OCR data for multiple documents.

        Phase 6 Enhancement: Uses per-page analysis for multi-page PDFs
        to avoid false positives.

        Args:
            ocr_index: Index from DocumentOcrLlmService with blocks, lines, tokens
            page_count: Number of pages in the document

        Returns:
            MultiDocResult with detection info
        """
        if not ocr_index:
            return self._single_doc_result()

        # For multi-page documents, use per-page analysis
        if page_count > 1:
            logger.info(f"[Layout] Multi-page PDF ({page_count} pages), using per-page analysis")
            return self._analyze_multi_page_pdf(ocr_index, page_count)

        # Single page: Use standard detection strategies
        result = self._detect_single_page(ocr_index)

        # Deduplicate: remove boundaries with >80% text similarity
        if result.is_multi_document and result.boundaries:
            deduped = self._deduplicate_boundaries(result.boundaries, ocr_index)
            if len(deduped) <= 1:
                logger.info("[Layout] Single-page dedup: boundaries collapsed to 1, not multi-doc")
                return self._single_doc_result()
            if len(deduped) < len(result.boundaries):
                logger.info(f"[Layout] Single-page dedup: {len(result.boundaries)} -> {len(deduped)}")
                result.boundaries = deduped
                result.document_count = len(deduped)

        return result

    def _detect_single_page(self, ocr_index: Dict[str, List[Dict]]) -> MultiDocResult:
        """Run detection strategies on a single-page document."""
        # Strategy 1: Side-by-side (fixed threshold)
        side_result = self._detect_side_by_side_single_page(ocr_index, page=0)
        if side_result.is_multi_document and side_result.confidence >= 0.7:
            logger.info(f"[Layout] Side-by-side detected: {side_result}")
            return side_result

        # Strategy 1b: Adaptive side-by-side (gap-based fallback)
        page_blocks = [b for b in ocr_index.get('blocks', [])
                       if b.get('page', 0) == 0]
        adaptive_boundaries = self._detect_adaptive_side_by_side(page_blocks, 0)
        if adaptive_boundaries:
            return MultiDocResult(
                is_multi_document=True,
                document_count=len(adaptive_boundaries),
                confidence=0.80,
                boundaries=adaptive_boundaries,
                detection_method='side_by_side',
                notes=f'Adaptive gap detection: {len(adaptive_boundaries)} docs'
            )

        # Strategy 2: Stacked
        stacked_result = self._detect_stacked(ocr_index)
        if stacked_result.is_multi_document and stacked_result.confidence >= 0.7:
            logger.info(f"[Layout] Stacked detected: {stacked_result}")
            return stacked_result

        return self._single_doc_result()


# Singleton instance
_layout_analysis_service: Optional[LayoutAnalysisService] = None


def get_layout_analysis_service() -> LayoutAnalysisService:
    """Get or create layout analysis service instance"""
    global _layout_analysis_service
    if _layout_analysis_service is None:
        _layout_analysis_service = LayoutAnalysisService()
    return _layout_analysis_service
