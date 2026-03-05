"""
Layout Detection Strategies - Detection methods for multi-document analysis.
Side-by-side, stacked, page distribution, and adaptive gap-based detection.
"""

from typing import List, Dict, Optional
import logging
import re

from .models import DocumentBoundary, MultiDocResult

logger = logging.getLogger(__name__)


class LayoutDetectionMixin:
    """Mixin providing detection strategies for layout analysis"""

    # Thresholds for detection
    SIDE_BY_SIDE_GAP_THRESHOLD = 0.08  # 8% gap between columns
    SIDE_BY_SIDE_MIN_WIDTH = 0.35      # Each doc must be at least 35% width
    STACKED_GAP_THRESHOLD = 0.05       # 5% vertical gap between documents
    SUPPLIER_HEADER_KEYWORDS = [
        # Turkish
        'fatura', 'fiş', 'makbuz', 'toplam', 'kdv', 'tarih',
        # English
        'invoice', 'receipt', 'total', 'vat', 'date', 'amount',
        # German/Swiss
        'rechnung', 'beleg', 'quittung', 'summe', 'mwst', 'datum',
        'zwischenbeleg', 'betrag', 'netto', 'brutto', 'kasse',
        # French
        'facture', 'reçu', 'ticket', 'caisse', 'ttc', 'montant'
    ]

    def _detect_side_by_side(self, ocr_index: Dict[str, List[Dict]]) -> MultiDocResult:
        """Backwards compatible wrapper for side-by-side detection"""
        return self._detect_side_by_side_single_page(ocr_index, page=0)

    def _detect_side_by_side_single_page(
        self, ocr_index: Dict[str, List[Dict]], page: int = 0
    ) -> MultiDocResult:
        """Detect side-by-side documents on a single page."""
        blocks = ocr_index.get('blocks', [])
        page_blocks = [b for b in blocks if b.get('page', 0) == page]

        result = self._classify_side_by_side(page_blocks)
        if not result:
            return self._single_doc_result()

        left_blocks, right_blocks = result
        total = len(page_blocks)
        l_ratio = len(left_blocks) / total if total else 0
        r_ratio = len(right_blocks) / total if total else 0
        balance = min(l_ratio, r_ratio) / max(l_ratio, r_ratio) if max(l_ratio, r_ratio) > 0 else 0
        confidence = 0.5 + (balance * 0.3) + 0.15  # middle already validated

        logger.info(f"[Layout] Side-by-side page {page}: "
                   f"left={len(left_blocks)}, right={len(right_blocks)}")

        return MultiDocResult(
            is_multi_document=True, document_count=2,
            confidence=min(confidence, 0.95),
            boundaries=[
                self._calculate_boundary(left_blocks, page, 'side_by_side'),
                self._calculate_boundary(right_blocks, page, 'side_by_side')
            ],
            detection_method='side_by_side',
            notes=f'Page {page}: Left: {len(left_blocks)}, Right: {len(right_blocks)} blocks'
        )

    def _detect_stacked(self, ocr_index: Dict[str, List[Dict]]) -> MultiDocResult:
        """Detect stacked documents. Lower half must have header content (strict)."""
        blocks = ocr_index.get('blocks', [])
        if len(blocks) < 6:
            return self._single_doc_result()

        sorted_blocks = sorted(blocks, key=lambda b: self._get_y_center(b))

        gaps = []
        for i in range(len(sorted_blocks) - 1):
            y1 = self._get_y_max(sorted_blocks[i])
            y2 = self._get_y_min(sorted_blocks[i + 1])
            gap = y2 - y1

            if gap > self.STACKED_GAP_THRESHOLD:
                gaps.append({'index': i, 'gap': gap, 'y_position': (y1 + y2) / 2})

        if not gaps:
            return self._single_doc_result()

        best_gap = max(gaps, key=lambda g: g['gap'])
        upper_blocks = sorted_blocks[:best_gap['index'] + 1]
        lower_blocks = sorted_blocks[best_gap['index'] + 1:]

        if len(upper_blocks) < 3 or len(lower_blocks) < 3:
            return self._single_doc_result()

        if not (self._has_key_terms(upper_blocks) and self._has_key_terms(lower_blocks)):
            return self._single_doc_result()

        # Lower half must look like a new document header (strict: needs BOTH date + company)
        if not self._has_header_content(lower_blocks, strict=True):
            return self._single_doc_result()

        gap_confidence = min(best_gap['gap'] / 0.15, 1.0)
        balance = min(len(upper_blocks), len(lower_blocks)) / max(len(upper_blocks), len(lower_blocks))
        confidence = 0.4 + (gap_confidence * 0.4) + (balance * 0.2)

        upper_bounds = self._calculate_boundary(upper_blocks, 0, 'stacked')
        lower_bounds = self._calculate_boundary(lower_blocks, 0, 'stacked')

        return MultiDocResult(
            is_multi_document=True,
            document_count=2,
            confidence=min(confidence, 0.95),
            boundaries=[upper_bounds, lower_bounds],
            detection_method='stacked',
            notes=f'Upper: {len(upper_blocks)}, Lower: {len(lower_blocks)}, Gap: {best_gap["gap"]:.2%}'
        )

    def _detect_page_distribution(
        self,
        ocr_index: Dict[str, List[Dict]],
        page_count: int
    ) -> MultiDocResult:
        """Detect multiple documents across pages."""
        blocks = ocr_index.get('blocks', [])

        pages: Dict[int, List[Dict]] = {}
        for block in blocks:
            page = block.get('page', 0)
            if page not in pages:
                pages[page] = []
            pages[page].append(block)

        if len(pages) < 2:
            return self._single_doc_result()

        pages_with_headers = []
        for page_num, page_blocks in pages.items():
            if self._has_header_content(page_blocks):
                pages_with_headers.append(page_num)

        if len(pages_with_headers) > 1:
            pages_with_headers.sort()
            has_gap = any(
                pages_with_headers[i + 1] - pages_with_headers[i] > 1
                for i in range(len(pages_with_headers) - 1)
            )

            if has_gap:
                boundaries = [
                    self._calculate_boundary(pages[p], p, 'page_distribution')
                    for p in pages_with_headers if p in pages
                ]
                return MultiDocResult(
                    is_multi_document=True,
                    document_count=len(pages_with_headers),
                    confidence=0.85,
                    boundaries=boundaries,
                    detection_method='page_distribution',
                    notes=f'Headers on pages: {pages_with_headers}'
                )

            supplier_names = set()
            for page_num in pages_with_headers:
                supplier = self._extract_likely_supplier(pages[page_num])
                if supplier:
                    supplier_names.add(supplier.lower().strip())

            if len(supplier_names) > 1:
                boundaries = [
                    self._calculate_boundary(pages[p], p, 'page_distribution')
                    for p in pages_with_headers if p in pages
                ]
                return MultiDocResult(
                    is_multi_document=True,
                    document_count=len(pages_with_headers),
                    confidence=0.80,
                    boundaries=boundaries,
                    detection_method='page_distribution',
                    notes=f'Different suppliers: {supplier_names}'
                )

        return self._single_doc_result()

    def _detect_side_by_side_on_page(
        self, page_blocks: List[Dict], page_num: int
    ) -> Optional[List[DocumentBoundary]]:
        """Detect side-by-side documents on a single page (returns boundaries only).
        Delegates to _classify_side_by_side for shared validation logic."""
        result = self._classify_side_by_side(page_blocks)
        if not result:
            return None
        left_blocks, right_blocks = result
        return [
            self._calculate_boundary(left_blocks, page_num, 'side_by_side'),
            self._calculate_boundary(right_blocks, page_num, 'side_by_side')
        ]

    def _classify_side_by_side(
        self, page_blocks: List[Dict]
    ) -> Optional[tuple]:
        """Classify blocks into left/right and validate side-by-side criteria.
        Returns (left_blocks, right_blocks) or None."""
        if len(page_blocks) < 4:
            return None
        left, right, middle = [], [], []
        for block in page_blocks:
            bbox = block.get('bbox', [])
            if len(bbox) < 4:
                continue
            x_center = sum(v.get('x', 0) for v in bbox) / len(bbox)
            if x_center < 0.40:
                left.append(block)
            elif x_center > 0.60:
                right.append(block)
            else:
                middle.append(block)
        total = len(page_blocks)
        l_ratio = len(left) / total if total else 0
        r_ratio = len(right) / total if total else 0
        m_ratio = len(middle) / total if total else 0
        if not (l_ratio >= 0.10 or len(left) >= 5):
            return None
        if not (r_ratio >= 0.10 or len(right) >= 5):
            return None
        if m_ratio > 0.30:
            return None
        if not (self._has_key_terms(left) and self._has_key_terms(right)):
            return None
        if not (self._has_header_content(left, strict=True)
                and self._has_header_content(right, strict=True)):
            return None
        if self._has_bridging_blocks(page_blocks, split_x=0.50):
            return None
        return (left, right)

    def _detect_stacked_on_page(
        self,
        page_blocks: List[Dict],
        page_num: int
    ) -> Optional[List[DocumentBoundary]]:
        """Detect stacked documents on a single page.

        Lower half must have header content to prove it's a new document.
        """
        if len(page_blocks) < 6:
            return None

        sorted_blocks = sorted(page_blocks, key=lambda b: self._get_y_center(b))

        gaps = []
        for i in range(len(sorted_blocks) - 1):
            y1 = self._get_y_max(sorted_blocks[i])
            y2 = self._get_y_min(sorted_blocks[i + 1])
            gap = y2 - y1

            if gap > self.STACKED_GAP_THRESHOLD:
                gaps.append({'index': i, 'gap': gap})

        if not gaps:
            return None

        best_gap = max(gaps, key=lambda g: g['gap'])
        upper = sorted_blocks[:best_gap['index'] + 1]
        lower = sorted_blocks[best_gap['index'] + 1:]

        if len(upper) < 3 or len(lower) < 3:
            return None

        if not (self._has_key_terms(upper) and self._has_key_terms(lower)):
            return None

        # Lower half must look like a new document header (strict: needs BOTH date + company)
        if not self._has_header_content(lower, strict=True):
            return None

        return [
            self._calculate_boundary(upper, page_num, 'stacked'),
            self._calculate_boundary(lower, page_num, 'stacked')
        ]

    def _detect_adaptive_side_by_side(
        self,
        page_blocks: List[Dict],
        page_num: int
    ) -> Optional[List[DocumentBoundary]]:
        """Fallback: Find natural x-gap for shifted side-by-side receipts."""
        if len(page_blocks) < 6:
            return None

        block_centers = []
        for block in page_blocks:
            bbox = block.get('bbox', [])
            if len(bbox) < 4:
                continue
            xs = [v.get('x', 0) for v in bbox]
            x_center = sum(xs) / len(xs)
            block_centers.append((x_center, block))

        if len(block_centers) < 6:
            return None

        block_centers.sort(key=lambda t: t[0])

        # Collect all gaps >= 4% of page width, sorted largest first
        gaps = []
        for i in range(len(block_centers) - 1):
            gap = block_centers[i + 1][0] - block_centers[i][0]
            if gap >= 0.04:
                gaps.append((gap, i))
        gaps.sort(key=lambda t: t[0], reverse=True)

        if not gaps:
            return None

        # Try each gap from largest to smallest
        for gap_size, gap_idx in gaps:
            left_blocks = [bc[1] for bc in block_centers[:gap_idx + 1]]
            right_blocks = [bc[1] for bc in block_centers[gap_idx + 1:]]

            if len(left_blocks) < 3 or len(right_blocks) < 3:
                continue

            # Stricter than fixed detection: require >= 2 key terms
            # per side to avoid splitting a single invoice's totals
            # column as a separate document
            if not (self._has_key_terms(left_blocks, min_terms=2)
                    and self._has_key_terms(right_blocks, min_terms=2)):
                continue

            # Both sides must have proper invoice headers (date+company)
            # to avoid splitting utility bills with marketing columns
            if not (self._has_header_content(left_blocks, strict=True)
                    and self._has_header_content(right_blocks, strict=True)):
                continue

            split_x = (block_centers[gap_idx][0]
                        + block_centers[gap_idx + 1][0]) / 2

            # Split must be in reasonable range (not at page edges)
            # Edge splits (x>0.55) typically separate amounts columns
            if split_x > 0.55 or split_x < 0.15:
                continue

            # Bridging blocks prove single document
            if self._has_bridging_blocks(page_blocks, split_x=split_x):
                continue

            # Table-like y-alignment proves single document
            if self._has_shared_y_rows(left_blocks, right_blocks):
                continue

            # Y-extent balance: real side-by-side docs cover similar
            # vertical range. A single invoice with two-column header
            # has one side covering only the top portion.
            left_ys = [self._get_y_center(b) for b in left_blocks]
            right_ys = [self._get_y_center(b) for b in right_blocks]
            left_extent = max(left_ys) - min(left_ys)
            right_extent = max(right_ys) - min(right_ys)
            max_extent = max(left_extent, right_extent)
            if max_extent > 0:
                extent_ratio = min(left_extent, right_extent) / max_extent
                if extent_ratio < 0.65:
                    logger.info(
                        f"[Layout] Adaptive skip: y-extent imbalance "
                        f"L={left_extent:.3f} R={right_extent:.3f} "
                        f"ratio={extent_ratio:.2f}")
                    continue

            logger.info(
                f"[Layout] Adaptive side-by-side page {page_num}: "
                f"gap={gap_size:.3f} at x={split_x:.3f}, "
                f"left={len(left_blocks)}, right={len(right_blocks)}"
            )
            return [
                self._calculate_boundary(
                    left_blocks, page_num, 'side_by_side'),
                self._calculate_boundary(
                    right_blocks, page_num, 'side_by_side')
            ]

        return None

    def _has_bridging_blocks(
        self, page_blocks: List[Dict], split_x: float = 0.50, margin: float = 0.10
    ) -> bool:
        """Return True if >= 2 blocks span across split_x +/- margin."""
        count = 0
        for block in page_blocks:
            bbox = block.get('bbox', [])
            if len(bbox) < 4:
                continue
            xs = [v.get('x', 0) for v in bbox]
            x_min, x_max = min(xs), max(xs)
            if x_min < split_x - margin and x_max > split_x + margin:
                count += 1
        if count >= 2:
            logger.info(f"[Layout] Bridging blocks: {count} blocks span split at x={split_x:.2f}")
        return count >= 2

    def _has_shared_y_rows(self, left_blocks, right_blocks, y_tol=0.006):
        """Detect table-like y-alignment between groups (single doc signal).

        Uses bidirectional check: both L→R and R→L ratios must be high
        to distinguish real tables from coincidental side-by-side overlap.
        Tables have systematic alignment (>70% bidirectional); side-by-side
        receipts only have ~40-60% coincidental matches.
        """
        if len(left_blocks) < 3 or len(right_blocks) < 3:
            return False
        left_ys = [self._get_y_center(b) for b in left_blocks]
        right_ys = [self._get_y_center(b) for b in right_blocks]
        # Right→Left: how many right blocks have a y-match in left
        shared_r = sum(1 for ry in right_ys
                       if any(abs(ry - ly) <= y_tol for ly in left_ys))
        # Left→Right: how many left blocks have a y-match in right
        shared_l = sum(1 for ly in left_ys
                       if any(abs(ly - ry) <= y_tol for ry in right_ys))
        ratio_r = shared_r / len(right_blocks)
        ratio_l = shared_l / len(left_blocks)
        min_ratio = min(ratio_r, ratio_l)
        logger.info(
            f"[Layout] Table y-alignment: R→L {shared_r}/{len(right_blocks)} "
            f"({ratio_r:.0%}), L→R {shared_l}/{len(left_blocks)} ({ratio_l:.0%}), "
            f"min={min_ratio:.0%}")
        # Require high bidirectional alignment for table detection
        if shared_r >= 4 and min_ratio >= 0.70:
            return True
        return False

    def _has_key_terms(self, blocks: List[Dict], min_terms: int = 1) -> bool:
        """Check if blocks contain key invoice/receipt terms.

        Uses word boundary matching to avoid false positives
        (e.g. 'vat' matching inside 'hırdavat').
        """
        text = ' '.join(b.get('text', '') for b in blocks).lower()
        found = [term for term in self.SUPPLIER_HEADER_KEYWORDS
                 if re.search(r'\b' + re.escape(term) + r'\b', text)]
        return len(found) >= min_terms

    def _term_in_text(self, term: str, text: str) -> bool:
        """Check if term appears in text using word boundary for alpha terms,
        substring match for terms with special chars (e.g. 'a.ş.')."""
        if term.isalpha():
            return bool(re.search(r'\b' + re.escape(term) + r'\b', text))
        return term in text

    def _has_header_content(self, blocks: List[Dict], strict: bool = False) -> bool:
        """Check if blocks look like invoice header. strict=True requires both
        date AND company terms (used in stacked detection)."""
        if not blocks:
            return False

        sorted_blocks = sorted(blocks, key=lambda b: self._get_y_min(b))
        top_portion = sorted_blocks[:max(1, len(sorted_blocks) // 3)]

        text = ' '.join(b.get('text', '') for b in top_portion).lower()

        has_date = any(self._term_in_text(term, text) for term in [
            'tarih', 'date', 'fatura', 'invoice',          # TR / EN
            'rechnung', 'beleg', 'quittung', 'kasse',      # DE
            'datum', 'bon', 'kassenbon',                    # DE receipt
            'facture', 'reçu', 'ticket',                    # FR
        ])
        has_company = any(self._term_in_text(term, text) for term in [
            'a.ş.', 'ltd', 'tic', 'san', 'şti',           # TR
            'ag', 'gmbh', 'sa', 'sarl', 'sàrl',           # DE / FR / CH
        ])

        if strict:
            return has_date and has_company
        return has_date or has_company

    def _extract_likely_supplier(self, blocks: List[Dict]) -> Optional[str]:
        """Try to extract supplier name from blocks"""
        sorted_blocks = sorted(blocks, key=lambda b: self._get_y_min(b))
        top_blocks = sorted_blocks[:max(1, len(sorted_blocks) // 4)]

        for block in top_blocks:
            text = block.get('text', '')
            if any(suffix in text.lower() for suffix in [
                'a.ş.', 'ltd', 'tic.', 'san.',       # TR
                'gmbh', ' ag', ' sa', 'sarl', 'sàrl', # DE / FR / CH
            ]):
                return text

        return None
