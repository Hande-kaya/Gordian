"""
Extraction Module - Text extraction by document boundary.
"""

from typing import List, Dict, Set
import logging

from .models import DocumentBoundary

logger = logging.getLogger(__name__)


class ExtractionMixin:
    """Mixin providing text extraction by boundary"""

    def extract_text_by_boundary(
        self,
        ocr_index: Dict[str, List[Dict]],
        boundary: DocumentBoundary
    ) -> str:
        """
        Extract OCR text for blocks within a boundary region.

        Phase 6: Handles multi-page boundaries (boundary.pages list).

        Args:
            ocr_index: OCR index with blocks, lines, tokens
            boundary: DocumentBoundary with coordinates and pages

        Returns:
            Concatenated text from blocks within the boundary
        """
        blocks = ocr_index.get('blocks', [])

        # Determine which pages to include
        target_pages: Set[int] = set()
        if boundary.pages:
            target_pages = set(boundary.pages)
        else:
            target_pages = {boundary.page}

        # Collect blocks with their positions for sorting
        blocks_with_position = []

        for block in blocks:
            block_page = block.get('page', 0)

            if block_page not in target_pages:
                continue

            bbox = block.get('bbox', [])
            if len(bbox) < 4:
                continue

            xs = [v.get('x', 0) for v in bbox]
            ys = [v.get('y', 0) for v in bbox]
            x_center = sum(xs) / len(xs)
            y_center = sum(ys) / len(ys)

            tolerance = 0.05
            if (boundary.x_min - tolerance <= x_center <= boundary.x_max + tolerance and
                boundary.y_min - tolerance <= y_center <= boundary.y_max + tolerance):
                text = block.get('text', '')
                if text.strip():
                    sort_key = (block_page, y_center)
                    blocks_with_position.append((sort_key, text.strip()))

        blocks_with_position.sort(key=lambda x: x[0])

        return '\n'.join([text for _, text in blocks_with_position])

    def extract_texts_for_boundaries(
        self,
        ocr_index: Dict[str, List[Dict]],
        boundaries: List[DocumentBoundary]
    ) -> List[str]:
        """
        Extract separate OCR texts for each detected document boundary.

        Args:
            ocr_index: OCR index with blocks, lines, tokens
            boundaries: List of DocumentBoundary objects

        Returns:
            List of OCR texts, one per boundary
        """
        if not boundaries:
            full_text = '\n'.join(
                block.get('text', '')
                for block in ocr_index.get('blocks', [])
            )
            return [full_text]

        texts = []
        for boundary in boundaries:
            text = self.extract_text_by_boundary(ocr_index, boundary)
            logger.info(f"[Layout] Extracted {len(text)} chars for boundary "
                       f"x:[{boundary.x_min:.2f}-{boundary.x_max:.2f}]")
            texts.append(text)

        return texts
