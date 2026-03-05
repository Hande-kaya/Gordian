/**
 * PdfViewerPanel - PDF/Image viewer with zoom-to-point and OCR overlays.
 *
 * Features:
 * - Click to zoom into clicked point (toggle 1x ↔ 2x)
 * - +/- buttons zoom to viewport center
 * - Ctrl+wheel / pinch zoom
 * - Free pan (scroll) when zoomed in
 * - Entity bounding-box highlights
 * - Excel preview for .xlsx/.xls files
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import { getEntityColor, getBorderColor } from './entityColors';
import { config } from '../../utils/config';
import { getAuthHeaders } from '../../services/api';
import { useLang } from '../../shared/i18n';
import ExcelPreview from '../../components/common/ExcelPreview/ExcelPreview';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export interface EntityWithBounds {
    type: string;
    value: string;
    confidence: number;
    bounding_box?: Array<{ x: number; y: number }> | null;
    page: number;
    source: string;
}

interface PdfViewerPanelProps {
    documentId: string;
    parentDocumentId?: string | null;
    entities: EntityWithBounds[];
    showHighlights: boolean;
    initialPage?: number;
    filename?: string;
}

interface CanvasRect {
    width: number;
    height: number;
    left: number;
    top: number;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;
const SCALE_STEP = 0.25;
const DEFAULT_SCALE = 1.0;
const QUICK_ZOOM_SCALE = 2.0;
const BASE_WIDTH = 560;

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.heif', '.tiff', '.tif'];
const EXCEL_EXTENSIONS = ['.xlsx', '.xls'];

function isImageFile(filename?: string): boolean {
    if (!filename) return false;
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
    return IMAGE_EXTENSIONS.includes(ext);
}

function isExcelFile(filename?: string): boolean {
    if (!filename) return false;
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
    return EXCEL_EXTENSIONS.includes(ext);
}

const PdfViewerPanel: React.FC<PdfViewerPanelProps> = ({
    documentId, parentDocumentId, entities, showHighlights, initialPage, filename
}) => {
    const { t } = useLang();
    const [numPages, setNumPages] = useState<number | null>(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [canvasRect, setCanvasRect] = useState<CanvasRect | null>(null);
    const [scale, setScale] = useState(DEFAULT_SCALE);
    const pageWrapperRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const pendingScrollRef = useRef<{ x: number; y: number } | null>(null);

    // Build file URL
    const docId = parentDocumentId || documentId;
    const fileUrl = useMemo(() => `${config.API_URL}/api/documents/${docId}/download`, [docId]);

    const pdfFile = useMemo(() => ({
        url: fileUrl, withCredentials: true, httpHeaders: getAuthHeaders(),
    }), [fileUrl]);

    // Image blob
    const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!isImageFile(filename)) return;
        let cancelled = false;
        fetch(fileUrl, { credentials: 'include', headers: getAuthHeaders() })
            .then(r => r.blob())
            .then(blob => { if (!cancelled) setImageBlobUrl(URL.createObjectURL(blob)); })
            .catch(() => { if (!cancelled) setError(t('imageLoadError')); });
        return () => { cancelled = true; };
    }, [fileUrl, filename]);

    // Excel blob
    const [excelBlob, setExcelBlob] = useState<Blob | null>(null);
    useEffect(() => {
        if (!isExcelFile(filename)) return;
        let cancelled = false;
        fetch(fileUrl, { credentials: 'include', headers: getAuthHeaders() })
            .then(r => r.blob())
            .then(blob => { if (!cancelled) { setExcelBlob(blob); setLoading(false); } })
            .catch(() => { if (!cancelled) setError(t('pdfLoadError')); });
        return () => { cancelled = true; };
    }, [fileUrl, filename]);

    useEffect(() => {
        if (initialPage != null && initialPage >= 0) {
            setPageNumber(initialPage + 1);
        }
    }, [initialPage]);

    const handleLoadSuccess = useCallback(({ numPages: total }: { numPages: number }) => {
        setNumPages(total);
        setLoading(false);
        setError(null);
    }, []);

    const handleLoadError = useCallback((err: Error) => {
        setError(t('pdfLoadError'));
        setLoading(false);
        console.error('PDF load error:', err);
    }, []);

    const updateCanvasRect = useCallback(() => {
        if (!pageWrapperRef.current) return;
        const canvas = pageWrapperRef.current.querySelector('canvas');
        if (!canvas) return;
        const wrapperRect = pageWrapperRef.current.getBoundingClientRect();
        const canvasRectVal = canvas.getBoundingClientRect();
        setCanvasRect({
            width: canvas.offsetWidth,
            height: canvas.offsetHeight,
            left: canvasRectVal.left - wrapperRect.left,
            top: canvasRectVal.top - wrapperRect.top,
        });
    }, []);

    const handleRenderSuccess = useCallback(() => {
        updateCanvasRect();
        // Apply deferred scroll after PDF re-renders at new scale
        if (pendingScrollRef.current && contentRef.current) {
            const { x, y } = pendingScrollRef.current;
            contentRef.current.scrollLeft = x;
            contentRef.current.scrollTop = y;
            pendingScrollRef.current = null;
        }
    }, [updateCanvasRect]);

    useEffect(() => {
        window.addEventListener('resize', updateCanvasRect);
        return () => window.removeEventListener('resize', updateCanvasRect);
    }, [updateCanvasRect]);

    const goToPrevPage = useCallback(() => {
        setPageNumber(prev => Math.max(1, prev - 1));
        setCanvasRect(null);
    }, []);

    const goToNextPage = useCallback(() => {
        setPageNumber(prev => Math.min(numPages || prev, prev + 1));
        setCanvasRect(null);
    }, [numPages]);

    // ---- Zoom helpers ----

    /** Schedule scroll so that content point (cx,cy) stays at viewport offset (vx,vy). */
    const scheduleScroll = useCallback((oldScale: number, newScale: number, cx: number, cy: number, vx: number, vy: number) => {
        const ratio = newScale / oldScale;
        pendingScrollRef.current = {
            x: Math.max(0, cx * ratio - vx),
            y: Math.max(0, cy * ratio - vy),
        };
    }, []);

    /** Apply scroll immediately (for non-async re-renders like images). */
    const applyScrollNow = useCallback(() => {
        if (pendingScrollRef.current && contentRef.current) {
            contentRef.current.scrollLeft = pendingScrollRef.current.x;
            contentRef.current.scrollTop = pendingScrollRef.current.y;
            pendingScrollRef.current = null;
        }
    }, []);

    /** Zoom keeping viewport center stable (for +/- buttons). */
    const zoomToCenter = useCallback((delta: number) => {
        setScale(prev => {
            const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta));
            if (next === prev) return prev;
            const ct = contentRef.current;
            if (ct) {
                const cx = ct.scrollLeft + ct.clientWidth / 2;
                const cy = ct.scrollTop + ct.clientHeight / 2;
                scheduleScroll(prev, next, cx, cy, ct.clientWidth / 2, ct.clientHeight / 2);
            }
            return next;
        });
    }, [scheduleScroll]);

    const zoomIn = useCallback(() => zoomToCenter(SCALE_STEP), [zoomToCenter]);
    const zoomOut = useCallback(() => zoomToCenter(-SCALE_STEP), [zoomToCenter]);
    const zoomReset = useCallback(() => {
        pendingScrollRef.current = { x: 0, y: 0 };
        setScale(DEFAULT_SCALE);
    }, []);

    /** Click: toggle between 1x ↔ 2x, zoom towards clicked point. */
    const handleContentClick = useCallback((e: React.MouseEvent) => {
        const ct = contentRef.current;
        if (!ct) return;
        const rect = ct.getBoundingClientRect();
        // Click position in content-scroll coordinates
        const cx = e.clientX - rect.left + ct.scrollLeft;
        const cy = e.clientY - rect.top + ct.scrollTop;
        // Viewport-relative click position
        const vx = e.clientX - rect.left;
        const vy = e.clientY - rect.top;

        setScale(prev => {
            const next = prev === DEFAULT_SCALE ? QUICK_ZOOM_SCALE : DEFAULT_SCALE;
            scheduleScroll(prev, next, cx, cy, vx, vy);
            return next;
        });
    }, [scheduleScroll]);

    /** Ctrl+Wheel / pinch: continuous zoom towards pointer. */
    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const ct = contentRef.current;
        if (!ct) return;
        const rect = ct.getBoundingClientRect();
        const cx = e.clientX - rect.left + ct.scrollLeft;
        const cy = e.clientY - rect.top + ct.scrollTop;
        const vx = e.clientX - rect.left;
        const vy = e.clientY - rect.top;
        const delta = e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP;

        setScale(prev => {
            const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta));
            if (next === prev) return prev;
            scheduleScroll(prev, next, cx, cy, vx, vy);
            return next;
        });
    }, [scheduleScroll]);

    // For images: apply scroll immediately after state update
    useEffect(() => {
        if (isImageFile(filename)) {
            requestAnimationFrame(applyScrollNow);
        }
    }, [scale, filename, applyScrollNow]);

    // ---- Entity highlights ----

    const pageEntities = useMemo(() => {
        if (!showHighlights) return [];
        return entities.filter(e =>
            e.bounding_box && e.bounding_box.length >= 4 && e.page === pageNumber - 1
        );
    }, [entities, pageNumber, showHighlights]);

    const getBboxStyle = useCallback((entity: EntityWithBounds): React.CSSProperties | null => {
        if (!canvasRect || !entity.bounding_box || entity.bounding_box.length < 4) return null;
        const vertices = entity.bounding_box;
        const xs = vertices.map(v => v.x || 0);
        const ys = vertices.map(v => v.y || 0);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs);
        const maxY = Math.max(...ys);
        const left = minX * canvasRect.width;
        const top = minY * canvasRect.height;
        const width = (maxX - minX) * canvasRect.width;
        const height = (maxY - minY) * canvasRect.height;
        if (width < 5 || height < 5) return null;
        return {
            position: 'absolute',
            left: `${left}px`, top: `${top}px`,
            width: `${width}px`, height: `${height}px`,
            backgroundColor: getEntityColor(entity.type),
            border: `1.5px solid ${getBorderColor(entity.type)}`,
            borderRadius: '2px', pointerEvents: 'none',
        };
    }, [canvasRect]);

    const cursorStyle = scale === DEFAULT_SCALE ? 'zoom-in' : 'zoom-out';

    // ---- Excel ----
    if (isExcelFile(filename)) {
        return (
            <div className="pdf-viewer-panel">
                <div className="pdf-viewer-panel__content pdf-viewer-panel__content--excel">
                    {excelBlob ? (
                        <ExcelPreview blob={excelBlob} filename={filename} />
                    ) : (
                        <div className="pdf-viewer-panel__loading">{t('pdfLoading')}</div>
                    )}
                </div>
            </div>
        );
    }

    // ---- Image ----
    if (isImageFile(filename)) {
        return (
            <div className="pdf-viewer-panel">
                <div className="pdf-viewer-panel__zoom-bar">
                    <button onClick={zoomOut} disabled={scale <= MIN_SCALE} title={t('zoomOut')}>&#x2212;</button>
                    <span className="pdf-viewer-panel__zoom-label">{Math.round(scale * 100)}%</span>
                    <button onClick={zoomIn} disabled={scale >= MAX_SCALE} title={t('zoomIn')}>+</button>
                    <button className="pdf-viewer-panel__zoom-fit" onClick={zoomReset} disabled={scale === DEFAULT_SCALE} title={t('zoomFit')}>{t('zoomFit')}</button>
                </div>
                <div
                    ref={contentRef}
                    className="pdf-viewer-panel__content"
                    onClick={handleContentClick}
                    onWheel={handleWheel}
                    style={{ cursor: cursorStyle }}
                >
                    {imageBlobUrl ? (
                        <img
                            src={imageBlobUrl}
                            alt={filename}
                            style={{ width: BASE_WIDTH * scale, maxWidth: 'none', display: 'block', margin: '0 auto' }}
                            onError={() => setError(t('imageLoadError'))}
                        />
                    ) : (
                        <div className="pdf-viewer-panel__loading">{t('pdfLoading')}</div>
                    )}
                </div>
            </div>
        );
    }

    // ---- Error ----
    if (error) {
        return (
            <div className="pdf-viewer-panel">
                <div className="pdf-viewer-panel__error">{error}</div>
            </div>
        );
    }

    // ---- PDF ----
    return (
        <div className="pdf-viewer-panel">
            <div className="pdf-viewer-panel__zoom-bar">
                <button onClick={zoomOut} disabled={scale <= MIN_SCALE} title={t('zoomOut')}>&#x2212;</button>
                <span className="pdf-viewer-panel__zoom-label">{Math.round(scale * 100)}%</span>
                <button onClick={zoomIn} disabled={scale >= MAX_SCALE} title={t('zoomIn')}>+</button>
                <button className="pdf-viewer-panel__zoom-fit" onClick={zoomReset} disabled={scale === DEFAULT_SCALE} title={t('zoomFit')}>{t('zoomFit')}</button>
            </div>

            <div
                ref={contentRef}
                className="pdf-viewer-panel__content"
                onClick={handleContentClick}
                onWheel={handleWheel}
                style={{ cursor: cursorStyle }}
            >
                <div className="pdf-viewer-panel__page-wrapper" ref={pageWrapperRef}>
                    <Document
                        file={pdfFile}
                        onLoadSuccess={handleLoadSuccess}
                        onLoadError={handleLoadError}
                        loading={<div className="pdf-viewer-panel__loading">{t('pdfLoading')}</div>}
                    >
                        <Page
                            pageNumber={pageNumber}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                            onRenderSuccess={handleRenderSuccess}
                            width={BASE_WIDTH * scale}
                        />
                    </Document>

                    {canvasRect && pageEntities.length > 0 && (
                        <div
                            className="pdf-viewer-panel__overlay"
                            style={{
                                width: canvasRect.width, height: canvasRect.height,
                                left: canvasRect.left, top: canvasRect.top,
                            }}
                        >
                            {pageEntities.map((entity, idx) => {
                                const style = getBboxStyle(entity);
                                if (!style) return null;
                                return (
                                    <div
                                        key={`${entity.type}-${idx}`}
                                        style={style}
                                        title={`${entity.type}: ${entity.value}`}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {numPages && numPages > 1 && (
                <div className="pdf-viewer-panel__controls">
                    <button onClick={goToPrevPage} disabled={pageNumber <= 1}>&#x2039;</button>
                    <span>{pageNumber} / {numPages}</span>
                    <button onClick={goToNextPage} disabled={pageNumber >= numPages}>&#x203a;</button>
                </div>
            )}
        </div>
    );
};

export default PdfViewerPanel;
