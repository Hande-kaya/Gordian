/**
 * Upload Panel Component
 * ======================
 * Reusable card with dropzone + recent documents list.
 * Used 3x in Reconciliation page (Expense / Bank Statement / Income).
 */

import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../../shared/i18n';
import { DocumentItem } from '../../services/documentApi';
import './UploadPanel.scss';

interface UploadPanelProps {
    title: string;
    icon: React.ReactNode;
    docType: 'invoice' | 'bank-statement' | 'income';
    documents: DocumentItem[];
    onUploadClick: () => void;
    onDrop: (files: File[]) => void;
    onCancel?: (docId: string) => void;
    compact?: boolean;
}

const MAX_RECENT = 5;

const fmtCurrency = (v?: number | null, currency = 'TRY') => {
    if (v == null) return '-';
    try {
        return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(v);
    } catch {
        return `${v.toLocaleString('tr-TR')} ${currency}`;
    }
};

const getDocMetric = (doc: DocumentItem): string => {
    if (doc.extracted_data?.closing_balance != null) {
        const curr = doc.extracted_data?.currency || 'TRY';
        return fmtCurrency(doc.extracted_data.closing_balance, curr);
    }
    const amount = doc.extracted_data?.financials?.total_amount || doc.extracted_data?.total_amount;
    const curr = doc.extracted_data?.financials?.currency || doc.extracted_data?.currency || 'TRY';
    return fmtCurrency(amount, curr);
};

const getDetailRoute = (doc: DocumentItem): string => {
    if (doc.type === 'bank-statement') return `/bank-statements/${doc.id}`;
    if (doc.type === 'income') return `/income/${doc.id}`;
    return `/invoices/${doc.id}`;
};

const UploadPanel: React.FC<UploadPanelProps> = ({
    title, icon, docType, documents, onUploadClick, onDrop, onCancel, compact,
}) => {
    const { t } = useLang();
    const navigate = useNavigate();
    const [hover, setHover] = useState(false);

    const processingDocs = documents.filter(
        d => d.ocr_status === 'pending' || d.ocr_status === 'processing',
    );
    const failedDocs = documents.filter(d => d.ocr_status === 'failed');
    const recentDocs = documents
        .filter(d => d.ocr_status === 'completed')
        .slice(0, MAX_RECENT);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setHover(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setHover(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setHover(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) onDrop(files);
    }, [onDrop]);

    return (
        <div className="upload-panel">
            <div className="upload-panel__header">
                <span className="upload-panel__icon">{icon}</span>
                <h3 className="upload-panel__title">{title}</h3>
            </div>

            <div
                className={`upload-panel__dropzone${hover ? ' upload-panel__dropzone--hover' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={onUploadClick}
            >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>{t('dropOrClick')}</span>
            </div>

            {/* Processing status */}
            {processingDocs.length > 0 && (
                <div className="upload-panel__processing">
                    <div className="upload-panel__processing-spinner" />
                    <span className="upload-panel__processing-text">
                        {processingDocs.length} {t('docsProcessing')}
                    </span>
                    <ul className="upload-panel__processing-list">
                        {processingDocs.map(doc => (
                            <li key={doc.id} className="upload-panel__processing-item">
                                <span className="upload-panel__doc-name" title={doc.filename}>
                                    {doc.filename}
                                </span>
                                <span className="upload-panel__status-badge upload-panel__status-badge--processing">
                                    {doc.ocr_status === 'pending' ? t('statusPending') : t('statusProcessing')}
                                </span>
                                {onCancel && (
                                    <button
                                        className="upload-panel__cancel-btn"
                                        onClick={() => onCancel(doc.id)}
                                        title={t('cancelProcessing')}
                                    >&times;</button>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Failed docs */}
            {failedDocs.length > 0 && (
                <div className="upload-panel__failed">
                    <span className="upload-panel__failed-text">
                        {failedDocs.length} {t('docsFailed')}
                    </span>
                    <ul className="upload-panel__processing-list">
                        {failedDocs.map(doc => (
                            <li key={doc.id} className="upload-panel__processing-item">
                                <span className="upload-panel__doc-name" title={doc.filename}>
                                    {doc.filename}
                                </span>
                                <span className="upload-panel__status-badge upload-panel__status-badge--failed">
                                    {t('statusFailed')}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className={`upload-panel__docs${compact ? ' upload-panel__docs--compact' : ''}`}>
                <span className="upload-panel__docs-label">{t('recentDocs')}</span>
                {recentDocs.length === 0 && processingDocs.length === 0 ? (
                    <p className="upload-panel__empty">{t('noDocs')}</p>
                ) : (
                    <ul className="upload-panel__doc-list">
                        {recentDocs.slice(0, compact ? 4 : MAX_RECENT).map(doc => (
                            <li
                                key={doc.id}
                                className="upload-panel__doc-item"
                                onClick={() => navigate(getDetailRoute(doc))}
                            >
                                <span className="upload-panel__doc-name" title={doc.filename}>
                                    {doc.filename}
                                </span>
                                <span className="upload-panel__doc-metric">
                                    {getDocMetric(doc)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default UploadPanel;
