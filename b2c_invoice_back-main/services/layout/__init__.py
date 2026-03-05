"""
Layout Analysis Package - Multi-Document Detection via Layout Analysis.

Analyzes OCR block/line coordinates to detect multiple documents in a single scan.

Modules:
- models: Data classes for boundaries and results
- detection: Detection strategies (side-by-side, stacked, page distribution)
- page_analysis: Per-page analysis for multi-page PDFs (Phase 6)
- extraction: Text extraction by boundary
"""

from .models import DocumentBoundary, PageAnalysisResult, MultiDocResult
from .service import LayoutAnalysisService, get_layout_analysis_service

__all__ = [
    'DocumentBoundary',
    'PageAnalysisResult',
    'MultiDocResult',
    'LayoutAnalysisService',
    'get_layout_analysis_service',
]
