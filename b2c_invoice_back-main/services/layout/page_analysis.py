"""
Page Analysis Module - Per-page analysis for multi-page PDFs (Phase 6).

Handles:
- Per-page detection to avoid false positives
- Continuation page detection
- Multi-page document merging
- Boundary deduplication
"""

from typing import List, Dict, Optional, Set
from difflib import SequenceMatcher
import re
import logging

from .models import DocumentBoundary, PageAnalysisResult, MultiDocResult

logger = logging.getLogger(__name__)


class PageAnalysisMixin:
    """Mixin providing per-page analysis for multi-page PDFs"""

    def _analyze_multi_page_pdf(
        self,
        ocr_index: Dict[str, List[Dict]],
        page_count: int
    ) -> MultiDocResult:
        """
        Phase 6: Analyze multi-page PDF with per-page detection.

        Steps:
        1. Analyze each page separately for side-by-side/stacked
        2. Detect continuation pages
        3. Merge consecutive pages that belong to the same invoice
        4. Deduplicate boundaries
        """
        blocks = ocr_index.get('blocks', [])

        pages: Dict[int, List[Dict]] = {}
        for block in blocks:
            page = block.get('page', 0)
            if page not in pages:
                pages[page] = []
            pages[page].append(block)

        logger.info(f"[Layout] Analyzing {len(pages)} pages: {list(pages.keys())}")

        # Step 1: Analyze each page separately
        page_results: List[PageAnalysisResult] = []
        for page_num in sorted(pages.keys()):
            page_blocks = pages[page_num]
            result = self._analyze_single_page(page_blocks, page_num)
            page_results.append(result)
            logger.info(f"[Layout] Page {page_num}: {result.layout_type}, "
                       f"boundaries={len(result.boundaries)}, "
                       f"is_continuation={result.is_continuation}")

        # Step 2: Check for continuation pages
        # Pages with multi-doc layout (side_by_side/stacked) are never continuations
        for i in range(1, len(page_results)):
            prev = page_results[i - 1]
            curr = page_results[i]
            if curr.layout_type in ('side_by_side', 'stacked'):
                logger.info(f"[Layout] Page {curr.page}: skip continuation (has {curr.layout_type})")
                continue
            if self._is_continuation_page(pages.get(curr.page, []), pages.get(prev.page, [])):
                page_results[i] = PageAnalysisResult(
                    page=curr.page,
                    layout_type=curr.layout_type,
                    boundaries=curr.boundaries,
                    is_continuation=True,
                    supplier_hint=prev.supplier_hint
                )
                logger.info(f"[Layout] Page {curr.page} marked as continuation of {prev.page}")

        # Step 3: Merge consecutive pages into documents
        merged_boundaries = self._merge_consecutive_pages(page_results, pages)

        # Step 4: Deduplicate boundaries
        final_boundaries = self._deduplicate_boundaries(merged_boundaries, ocr_index)

        if len(final_boundaries) <= 1:
            return self._single_doc_result()

        return MultiDocResult(
            is_multi_document=True,
            document_count=len(final_boundaries),
            confidence=0.85,
            boundaries=final_boundaries,
            detection_method='per_page_analysis',
            notes=f'Analyzed {page_count} pages, found {len(final_boundaries)} documents'
        )

    def _analyze_single_page(
        self,
        page_blocks: List[Dict],
        page_num: int
    ) -> PageAnalysisResult:
        """Analyze a single page for document layout."""
        if len(page_blocks) < 3:
            return PageAnalysisResult(
                page=page_num,
                layout_type='single',
                boundaries=[self._calculate_boundary(page_blocks, page_num, 'single')],
                supplier_hint=self._extract_likely_supplier(page_blocks)
            )

        # Check for side-by-side (fixed threshold, then adaptive fallback)
        side_result = self._detect_side_by_side_on_page(page_blocks, page_num)
        if not side_result:
            side_result = self._detect_adaptive_side_by_side(page_blocks, page_num)
        if side_result:
            return PageAnalysisResult(
                page=page_num,
                layout_type='side_by_side',
                boundaries=side_result,
                supplier_hint=None
            )

        # Check for stacked
        stacked_result = self._detect_stacked_on_page(page_blocks, page_num)
        if stacked_result:
            return PageAnalysisResult(
                page=page_num,
                layout_type='stacked',
                boundaries=stacked_result,
                supplier_hint=None
            )

        # Single document on this page
        return PageAnalysisResult(
            page=page_num,
            layout_type='single',
            boundaries=[self._calculate_boundary(page_blocks, page_num, 'single')],
            supplier_hint=self._extract_likely_supplier(page_blocks)
        )

    def _is_continuation_page(
        self,
        current_blocks: List[Dict],
        previous_blocks: List[Dict]
    ) -> bool:
        """
        Check if current page is a continuation of the previous invoice.

        Indicators:
        - No header content
        - Contains continuation text
        - Starts with line items
        - No new supplier header
        """
        if not current_blocks:
            return False

        indicators = {
            'no_header': not self._has_header_content(current_blocks),
            'has_continuation_text': self._contains_continuation_text(current_blocks),
            'starts_with_items': self._starts_with_line_items(current_blocks),
            'no_new_supplier': not self._has_new_supplier_header(current_blocks)
        }

        # Check if same supplier
        curr_supplier = self._extract_likely_supplier(current_blocks)
        prev_supplier = self._extract_likely_supplier(previous_blocks) if previous_blocks else None

        if curr_supplier and prev_supplier:
            similarity = self._text_similarity(curr_supplier, prev_supplier)
            if similarity > 0.8:
                indicators['same_supplier'] = True

        positive_count = sum(1 for v in indicators.values() if v)
        logger.debug(f"[Layout] Continuation check: {indicators}, positive={positive_count}")

        return positive_count >= 2

    def _contains_continuation_text(self, blocks: List[Dict]) -> bool:
        """Check if blocks contain continuation indicators"""
        text = ' '.join(b.get('text', '') for b in blocks).lower()
        continuation_terms = [
            'brought forward', 'carried forward', 'continued', 'devam',
            'sayfa', 'page', 'of', 'toplam aktarma', 'subtotal'
        ]
        return any(term in text for term in continuation_terms)

    def _starts_with_line_items(self, blocks: List[Dict]) -> bool:
        """Check if page starts with line items"""
        if not blocks:
            return False

        sorted_blocks = sorted(blocks, key=lambda b: self._get_y_min(b))
        top_blocks = sorted_blocks[:max(1, len(sorted_blocks) // 4)]
        text = ' '.join(b.get('text', '') for b in top_blocks).lower()

        has_numbers = bool(re.search(r'\d+[.,]\d{2}', text))
        has_qty_pattern = bool(re.search(r'\d+\s*(adet|pcs|kg|lt|m2)', text, re.I))

        return has_numbers and not self._has_header_content(top_blocks)

    def _has_new_supplier_header(self, blocks: List[Dict]) -> bool:
        """Check if page has a new supplier header at the top"""
        if not blocks:
            return False

        sorted_blocks = sorted(blocks, key=lambda b: self._get_y_min(b))
        top_blocks = sorted_blocks[:max(1, len(sorted_blocks) // 4)]

        text = ' '.join(b.get('text', '') for b in top_blocks).lower()

        has_company = any(self._term_in_text(s, text) for s in [
            'a.ş.', 'ltd', 'tic.', 'san.', 'şti',   # TR
            'gmbh', 'ag', 'sa', 'sarl', 'sàrl',      # DE / FR / CH
        ])
        has_invoice_header = any(self._term_in_text(t, text) for t in [
            'fatura', 'invoice', 'rechnung', 'fiş', 'receipt',   # TR / EN / DE
            'quittung', 'beleg', 'kasse', 'kassenbon',           # DE receipt
            'facture', 'reçu', 'ticket',                         # FR
        ])

        return has_company and has_invoice_header

    def _merge_consecutive_pages(
        self,
        page_results: List[PageAnalysisResult],
        pages: Dict[int, List[Dict]]
    ) -> List[DocumentBoundary]:
        """Merge consecutive pages that belong to the same document.

        Side-by-side and stacked boundaries are emitted individually
        (each boundary = separate document). Only 'single' layout pages
        participate in continuation merging.
        """
        if not page_results:
            return []

        merged_boundaries: List[DocumentBoundary] = []
        current_doc_pages: List[int] = []
        current_boundaries: List[DocumentBoundary] = []

        for result in page_results:
            if result.layout_type in ('side_by_side', 'stacked'):
                # Flush any accumulated single-page group first
                if current_boundaries:
                    merged = self._merge_boundaries(current_boundaries, current_doc_pages)
                    merged_boundaries.append(merged)
                # Emit all but last boundary as separate documents
                for boundary in result.boundaries[:-1]:
                    merged_boundaries.append(boundary)
                # Keep last boundary for potential continuation merging
                current_doc_pages = [result.page]
                current_boundaries = [result.boundaries[-1]]
                logger.info(
                    f"[Layout] Page {result.page}: {result.layout_type} → "
                    f"emitted {len(result.boundaries) - 1}, kept last for merging"
                )
            elif result.is_continuation and current_doc_pages:
                current_doc_pages.append(result.page)
                current_boundaries.extend(result.boundaries)
            else:
                if current_boundaries:
                    merged = self._merge_boundaries(current_boundaries, current_doc_pages)
                    merged_boundaries.append(merged)

                current_doc_pages = [result.page]
                current_boundaries = list(result.boundaries)

        if current_boundaries:
            merged = self._merge_boundaries(current_boundaries, current_doc_pages)
            merged_boundaries.append(merged)

        return merged_boundaries

    def _merge_boundaries(
        self,
        boundaries: List[DocumentBoundary],
        pages: List[int]
    ) -> DocumentBoundary:
        """Merge multiple boundaries into one"""
        if not boundaries:
            return DocumentBoundary(0, 0, 1, 0, 1, 0.5, 'merged', pages=[])

        x_mins = [b.x_min for b in boundaries]
        x_maxs = [b.x_max for b in boundaries]
        y_mins = [b.y_min for b in boundaries]
        y_maxs = [b.y_max for b in boundaries]

        return DocumentBoundary(
            page=min(pages) if pages else 0,
            x_min=min(x_mins),
            x_max=max(x_maxs),
            y_min=min(y_mins),
            y_max=max(y_maxs),
            confidence=sum(b.confidence for b in boundaries) / len(boundaries),
            detection_method='merged',
            pages=sorted(pages)
        )

    def _deduplicate_boundaries(
        self,
        boundaries: List[DocumentBoundary],
        ocr_index: Dict[str, List[Dict]]
    ) -> List[DocumentBoundary]:
        """Remove duplicate or highly overlapping boundaries."""
        if len(boundaries) <= 1:
            return boundaries

        unique: List[DocumentBoundary] = []

        for boundary in boundaries:
            is_duplicate = False

            for existing in unique:
                # Different pages = different receipts, never deduplicate
                if boundary.pages and existing.pages:
                    if set(boundary.pages) != set(existing.pages):
                        continue

                # Same page: skip if no spatial overlap (e.g. side-by-side or stacked)
                y_overlap = max(0, min(boundary.y_max, existing.y_max) - max(boundary.y_min, existing.y_min))
                x_overlap = max(0, min(boundary.x_max, existing.x_max) - max(boundary.x_min, existing.x_min))
                if x_overlap * y_overlap < 0.01:
                    continue

                # Overlapping region: check text similarity
                text1 = self.extract_text_by_boundary(ocr_index, boundary)
                text2 = self.extract_text_by_boundary(ocr_index, existing)

                if text1 and text2:
                    similarity = self._text_similarity(text1, text2)
                    if similarity > 0.8:
                        is_duplicate = True
                        logger.debug(f"[Layout] Duplicate: {similarity:.2%} similarity")
                        break

            if not is_duplicate:
                unique.append(boundary)

        logger.info(f"[Layout] Deduplication: {len(boundaries)} -> {len(unique)} boundaries")
        return unique

    def _text_similarity(self, text1: str, text2: str) -> float:
        """Calculate text similarity ratio"""
        if not text1 or not text2:
            return 0.0
        return SequenceMatcher(None, text1.lower(), text2.lower()).ratio()
