"""
Layout Helpers - Utility functions for layout analysis.
"""

from typing import List, Dict, Set, Optional
import logging

from .models import DocumentBoundary, MultiDocResult

logger = logging.getLogger(__name__)


class LayoutHelpersMixin:
    """Mixin providing helper methods for layout analysis"""

    def _calculate_boundary(
        self,
        blocks: List[Dict],
        page: int,
        method: str
    ) -> DocumentBoundary:
        """Calculate bounding box for a set of blocks"""
        if not blocks:
            return DocumentBoundary(page, 0, 1, 0, 1, 0.5, method, pages=[page])

        x_mins, x_maxs, y_mins, y_maxs = [], [], [], []
        pages_seen: Set[int] = set()

        for block in blocks:
            bbox = block.get('bbox', [])
            block_page = block.get('page', page)
            pages_seen.add(block_page)

            if len(bbox) >= 4:
                xs = [v.get('x', 0) for v in bbox]
                ys = [v.get('y', 0) for v in bbox]
                x_mins.append(min(xs))
                x_maxs.append(max(xs))
                y_mins.append(min(ys))
                y_maxs.append(max(ys))

        if not x_mins:
            return DocumentBoundary(page, 0, 1, 0, 1, 0.5, method, pages=[page])

        return DocumentBoundary(
            page=page,
            x_min=min(x_mins),
            x_max=max(x_maxs),
            y_min=min(y_mins),
            y_max=max(y_maxs),
            confidence=0.8,
            detection_method=method,
            pages=sorted(pages_seen)
        )

    def _get_y_center(self, block: Dict) -> float:
        """Get Y center of a block"""
        bbox = block.get('bbox', [])
        if len(bbox) < 4:
            return 0.5
        ys = [v.get('y', 0) for v in bbox]
        return sum(ys) / len(ys)

    def _get_y_min(self, block: Dict) -> float:
        """Get minimum Y of a block"""
        bbox = block.get('bbox', [])
        if len(bbox) < 4:
            return 0
        return min(v.get('y', 0) for v in bbox)

    def _get_y_max(self, block: Dict) -> float:
        """Get maximum Y of a block"""
        bbox = block.get('bbox', [])
        if len(bbox) < 4:
            return 1
        return max(v.get('y', 0) for v in bbox)

    def _single_doc_result(self) -> MultiDocResult:
        """Return result for single document"""
        return MultiDocResult(
            is_multi_document=False,
            document_count=1,
            confidence=1.0,
            boundaries=[],
            detection_method='none',
            notes='Single document detected'
        )
