"""
Layout Analysis Models - Data classes for layout detection results.
"""

from typing import List, Optional
from dataclasses import dataclass, field


@dataclass
class DocumentBoundary:
    """Represents detected boundary of a document within a page/file"""
    page: int
    x_min: float  # Normalized 0-1
    x_max: float
    y_min: float
    y_max: float
    confidence: float
    detection_method: str  # 'side_by_side', 'stacked', 'page_distribution'
    pages: List[int] = field(default_factory=list)  # For multi-page documents


@dataclass
class PageAnalysisResult:
    """Result of per-page analysis"""
    page: int
    layout_type: str  # 'single', 'side_by_side', 'stacked'
    boundaries: List[DocumentBoundary]
    is_continuation: bool = False  # True if page is continuation of previous
    supplier_hint: Optional[str] = None


@dataclass
class MultiDocResult:
    """Result of multi-document detection"""
    is_multi_document: bool
    document_count: int
    confidence: float
    boundaries: List[DocumentBoundary]
    detection_method: str
    notes: str
