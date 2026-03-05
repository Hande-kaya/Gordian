/**
 * DocPreview — Lightweight document preview for modals.
 * Fetches document as blob via authenticated API, renders PDF or image.
 * Avoids cross-origin URL issues by using blob URLs.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import { config } from '../../utils/config';
import { getAuthHeaders } from '../../services/api';
import { useLang } from '../../shared/i18n';
import ExcelPreview from '../../components/common/ExcelPreview/ExcelPreview';
import './DocPreview.scss';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export interface HighlightBox {
    x1: number; y1: number;  // top-left (normalized 0-1)
    x2: number; y2: number;  // bottom-right (normalized 0-1)
}

interface DocPreviewProps {
    documentId: string;
    filename?: string;
    initialPage?: number;          // 1-based page to navigate to
    highlightY?: [number, number]; // [y_min, y_max] normalized 0-1 (full-width band)
    highlightBox?: HighlightBox;   // specific rectangle (normalized 0-1)
}

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.heif', '.tiff', '.tif'];
const EXCEL_EXTS = ['.xlsx', '.xls'];
const BASE_WIDTH = 480;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

function isImage(name?: string): boolean {
    if (!name) return false;
    const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
    return IMAGE_EXTS.includes(ext);
}

function isExcel(name?: string, mimeType?: string): boolean {
    if (name) {
        const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
        if (EXCEL_EXTS.includes(ext)) return true;
    }
    if (mimeType) {
        return mimeType.includes('spreadsheet') || mimeType.includes('excel');
    }
    return false;
}

const DocPreview: React.FC<DocPreviewProps> = ({ documentId, filename, initialPage, highlightY, highlightBox }) => {
    const { t } = useLang();
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [isImg, setIsImg] = useState(false);
    const [isExcelFile, setIsExcelFile] = useState(false);
    const [excelBlob, setExcelBlob] = useState<Blob | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [numPages, setNumPages] = useState<number | null>(null);
    const [pageNumber, setPageNumber] = useState(initialPage || 1);
    const [zoom, setZoom] = useState(1);
    const revokeRef = useRef<string | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // Navigate to initialPage when it changes
    useEffect(() => {
        if (initialPage && initialPage >= 1) setPageNumber(initialPage);
    }, [initialPage]);

    // Ctrl+wheel zoom
    useEffect(() => {
        const el = contentRef.current;
        if (!el) return;
        const handler = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
                setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z + delta).toFixed(2))));
            }
        };
        el.addEventListener('wheel', handler, { passive: false });
        return () => el.removeEventListener('wheel', handler);
    }, []);

    const zoomIn = useCallback(() => setZoom(z => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2))), []);
    const zoomOut = useCallback(() => setZoom(z => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2))), []);
    const zoomReset = useCallback(() => setZoom(1), []);

    // Fetch file as blob
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        setBlobUrl(null);

        const url = `${config.API_URL}/api/documents/${documentId}/download`;

        fetch(url, { credentials: 'include', headers: getAuthHeaders() })
            .then(async res => {
                if (res.status === 404) {
                    throw new Error('FILE_NOT_FOUND');
                }
                if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
                }
                return res.blob();
            })
            .then(blob => {
                if (cancelled) return;
                if (revokeRef.current) URL.revokeObjectURL(revokeRef.current);
                const objUrl = URL.createObjectURL(blob);
                revokeRef.current = objUrl;

                const ct = blob.type || '';
                if (isExcel(filename, ct)) {
                    setIsExcelFile(true);
                    setExcelBlob(blob);
                    setLoading(false);
                    return;
                }
                setIsImg(ct.startsWith('image/') || isImage(filename));
                setBlobUrl(objUrl);
                setLoading(false);
            })
            .catch(err => {
                if (cancelled) return;
                if (err.message === 'FILE_NOT_FOUND') {
                    setError('FILE_NOT_FOUND');
                } else {
                    console.error('DocPreview fetch error:', documentId, err);
                    setError(`${t('pdfLoadError')} (${err.message})`);
                }
                setLoading(false);
            });

        return () => {
            cancelled = true;
            if (revokeRef.current) {
                URL.revokeObjectURL(revokeRef.current);
                revokeRef.current = null;
            }
        };
    }, [documentId, filename, t]);

    const handleLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
        setNumPages(n);
    }, []);

    const handleLoadError = useCallback((err: Error) => {
        console.error('DocPreview PDF parse error:', err);
        setError(`${t('pdfLoadError')} (parse: ${err.message?.slice(0, 100)})`);
    }, [t]);

    // PDF file object for react-pdf (stable reference via useMemo)
    const pdfFile = useMemo(() => {
        if (!blobUrl || isImg || isExcelFile) return null;
        return { url: blobUrl };
    }, [blobUrl, isImg, isExcelFile]);

    if (loading) {
        return (
            <div className="doc-preview doc-preview--loading">
                <div className="reconciliation-page__spinner" />
            </div>
        );
    }

    if (error) {
        const is404 = error === 'FILE_NOT_FOUND';
        return (
            <div className={`doc-preview ${is404 ? 'doc-preview--not-found' : 'doc-preview--error'}`}>
                {is404 ? (
                    <div className="doc-preview__not-found">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="9" y1="15" x2="15" y2="15" />
                        </svg>
                        <span>{t('fileNotFound')}</span>
                    </div>
                ) : (
                    <span>{error}</span>
                )}
            </div>
        );
    }

    const renderWidth = Math.round(BASE_WIDTH * zoom);

    const zoomControls = (
        <div className="doc-preview__zoom">
            <button onClick={zoomOut} disabled={zoom <= ZOOM_MIN}>&#x2212;</button>
            <button className="doc-preview__zoom-level" onClick={zoomReset}
                title="Reset zoom">{Math.round(zoom * 100)}%</button>
            <button onClick={zoomIn} disabled={zoom >= ZOOM_MAX}>&#x2b;</button>
        </div>
    );

    if (isExcelFile && excelBlob) {
        return (
            <div className="doc-preview">
                <div className="doc-preview__content" ref={contentRef}>
                    <ExcelPreview blob={excelBlob} filename={filename} />
                </div>
            </div>
        );
    }

    if (isImg && blobUrl) {
        return (
            <div className="doc-preview">
                <div className="doc-preview__content" ref={contentRef}>
                    <img src={blobUrl} alt={filename || 'document'}
                        style={{ width: renderWidth, maxWidth: 'none' }} />
                </div>
                <div className="doc-preview__controls">{zoomControls}</div>
            </div>
        );
    }

    return (
        <div className="doc-preview">
            <div className="doc-preview__content" ref={contentRef}>
                <Document
                    file={pdfFile}
                    onLoadSuccess={handleLoadSuccess}
                    onLoadError={handleLoadError}
                    loading={<div className="doc-preview--loading"><div className="reconciliation-page__spinner" /></div>}
                >
                    <div className="doc-preview__page-wrap">
                        <Page
                            pageNumber={pageNumber}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                            width={renderWidth}
                        />
                        {highlightBox && zoom === 1 && pageNumber === (initialPage || 1) && (
                            <div
                                className="doc-preview__highlight"
                                style={{
                                    top: `${highlightBox.y1 * 100}%`,
                                    left: `${highlightBox.x1 * 100}%`,
                                    height: `${Math.max((highlightBox.y2 - highlightBox.y1) * 100, 1.5)}%`,
                                    width: `${(highlightBox.x2 - highlightBox.x1) * 100}%`,
                                }}
                            />
                        )}
                        {!highlightBox && highlightY && zoom === 1 && pageNumber === (initialPage || 1) && (
                            <div
                                className="doc-preview__highlight"
                                style={{
                                    top: `${highlightY[0] * 100}%`,
                                    height: `${Math.max((highlightY[1] - highlightY[0]) * 100, 1.5)}%`,
                                }}
                            />
                        )}
                    </div>
                </Document>
            </div>
            <div className="doc-preview__controls">
                {zoomControls}
                {numPages && numPages > 1 && (
                    <div className="doc-preview__pagination">
                        <button onClick={() => setPageNumber(p => Math.max(1, p - 1))} disabled={pageNumber <= 1}>
                            &#x2039;
                        </button>
                        <span>{pageNumber} / {numPages}</span>
                        <button onClick={() => setPageNumber(p => Math.min(numPages || p, p + 1))} disabled={pageNumber >= numPages}>
                            &#x203a;
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DocPreview;
