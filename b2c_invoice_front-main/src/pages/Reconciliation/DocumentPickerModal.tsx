/**
 * Document Picker Modal (Multi-link aware)
 * =========================================
 * Split layout: left = searchable document list with proximity scores,
 * right = PDF/image preview of selected doc.
 *
 * Features:
 * - Confirmation step before linking
 * - Stays open after link (user can add more)
 * - "Added" badge on just-linked documents
 * - Proximity score (amount + date) per document
 * - Hides documents with date > 2 months from transaction
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useLang } from '../../shared/i18n';
import { DocumentItem } from '../../services/documentApi';
import { UnifiedTransaction } from '../../services/reconciliationApi';
import DocPreview from './DocPreview';
import './DocumentPickerModal.scss';

interface DocumentPickerModalProps {
    transaction: UnifiedTransaction;
    expenses: DocumentItem[];
    revenues: DocumentItem[];
    linkedDocIds?: Set<string>;
    onSelect: (documentId: string) => Promise<boolean>;
    onClose: () => void;
}

const fmtCurrency = (v?: number | null, currency = 'TRY') => {
    if (v == null) return '-';
    try {
        return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(v);
    } catch {
        return `${v.toLocaleString('tr-TR')} ${currency}`;
    }
};

const getDocAmount = (doc: DocumentItem): number => {
    const ed = doc.extracted_data;
    if (!ed) return 0;
    const val = ed.financials?.total_amount || ed.total_amount || 0;
    try { return Math.abs(Number(val)); } catch { return 0; }
};

const getDocVendor = (doc: DocumentItem): string => {
    const ed = doc.extracted_data;
    if (!ed) return '';
    return ed.vendor?.name || ed.supplier_name || '';
};

const getDocInvoiceNo = (doc: DocumentItem): string => {
    const ed = doc.extracted_data;
    if (!ed) return '';
    return ed.invoice_number || '';
};

/** Parse a date string (various formats) into a Date object, or null. */
function parseDocDate(raw?: string): Date | null {
    if (!raw) return null;
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
    // Try DD.MM.YYYY
    const parts = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (parts) return new Date(+parts[3], +parts[2] - 1, +parts[1]);
    return null;
}

/** Days between two dates (absolute). */
function daysBetween(a: Date, b: Date): number {
    return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

const MAX_DATE_DIFF_DAYS = 62; // ~2 months

/** Calculate proximity score 0-100 based on amount and date similarity. */
function calcProximityScore(
    txAmount: number, txDate: Date | null,
    docAmount: number, docDateStr?: string,
): number {
    // Amount score (0-60): 0% diff = 60, >50% diff = 0
    const amountDiff = txAmount > 0 ? Math.abs(docAmount - txAmount) / txAmount : 1;
    const amountScore = Math.max(0, 60 * (1 - amountDiff / 0.5));

    // Date score (0-40): 0 days diff = 40, 31+ days = 0
    const docDate = parseDocDate(docDateStr);
    let dateScore = 20; // default if no date
    if (txDate && docDate) {
        const diff = daysBetween(txDate, docDate);
        dateScore = Math.max(0, 40 * (1 - diff / MAX_DATE_DIFF_DAYS));
    }

    return Math.round(amountScore + dateScore);
}

function getScoreLevel(score: number): 'high' | 'medium' | 'low' {
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
}

const DocumentPickerModal: React.FC<DocumentPickerModalProps> = ({
    transaction, expenses, revenues, linkedDocIds, onSelect, onClose,
}) => {
    const { t } = useLang();
    const [search, setSearch] = useState('');
    const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
    const [confirmDoc, setConfirmDoc] = useState<DocumentItem | null>(null);
    const [linking, setLinking] = useState(false);
    const [addedIds, setAddedIds] = useState<Set<string>>(() => {
        const ids = new Set<string>();
        (transaction.matches || []).forEach(m => {
            if (m.document_ref?.document_id) ids.add(m.document_ref.document_id);
        });
        return ids;
    });
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const isCredit = transaction.type === 'credit';
    const txAmount = Math.abs(transaction.amount);
    const txDate = parseDocDate(transaction.date);
    const txCurrency = transaction.currency || 'TRY';

    // Pick relevant docs: debit -> expenses, credit -> revenues
    // Exclude docs already linked to OTHER transactions
    const candidates = useMemo(() => {
        const docs = isCredit ? revenues : expenses;
        const ownLinkedIds = new Set(
            (transaction.matches || [])
                .map(m => m.document_ref?.document_id)
                .filter(Boolean)
        );
        return docs.filter(d => {
            if (d.ocr_status !== 'completed') return false;
            if (linkedDocIds?.has(d.id) && !ownLinkedIds.has(d.id)) return false;
            return true;
        });
    }, [isCredit, expenses, revenues, linkedDocIds, transaction.matches]);

    // Filter by search + date proximity (<=1 month) + sort by score
    const filtered = useMemo(() => {
        const term = search.toLowerCase().trim();
        let items = candidates;

        // Date filter: hide docs > 1 month away
        if (txDate) {
            items = items.filter(d => {
                const docDate = parseDocDate(d.extracted_data?.invoice_date);
                if (!docDate) return true; // keep docs without date
                return daysBetween(txDate, docDate) <= MAX_DATE_DIFF_DAYS;
            });
        }

        if (term) {
            items = items.filter(d => {
                const name = (d.filename || '').toLowerCase();
                const vendor = getDocVendor(d).toLowerCase();
                return name.includes(term) || vendor.includes(term);
            });
        }

        // Sort by proximity score (highest first)
        return [...items].sort((a, b) => {
            const scoreA = calcProximityScore(txAmount, txDate, getDocAmount(a), a.extracted_data?.invoice_date);
            const scoreB = calcProximityScore(txAmount, txDate, getDocAmount(b), b.extracted_data?.invoice_date);
            return scoreB - scoreA;
        });
    }, [candidates, search, txAmount, txDate]);

    const handleOverlayClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
    }, [onClose]);

    const handleItemClick = useCallback((doc: DocumentItem) => {
        setPreviewDoc(doc);
    }, []);

    /** User clicked "Seç" → show confirmation */
    const handleSelectClick = useCallback((doc: DocumentItem) => {
        setConfirmDoc(doc);
        setPreviewDoc(doc);
    }, []);

    /** User confirmed → actually link */
    const handleConfirmLink = useCallback(async () => {
        if (!confirmDoc) return;
        setLinking(true);
        const success = await onSelect(confirmDoc.id);
        setLinking(false);
        if (success) {
            setAddedIds(prev => new Set(prev).add(confirmDoc.id));
            setConfirmDoc(null);
        }
    }, [confirmDoc, onSelect]);

    const handleCancelConfirm = useCallback(() => {
        setConfirmDoc(null);
    }, []);

    return (
        <div className="doc-picker-overlay" onClick={handleOverlayClick}>
            <div className="doc-picker doc-picker--wide">
                <div className="doc-picker__header">
                    <h3 className="doc-picker__title">{t('linkTransaction')}</h3>
                    <button className="doc-picker__close" onClick={onClose}>&times;</button>
                </div>

                <div className="doc-picker__tx-context">
                    <span className="doc-picker__tx-desc" title={transaction.description}>
                        {transaction.description || '-'}
                    </span>
                    <span className="doc-picker__tx-amount">
                        {fmtCurrency(txAmount, txCurrency)}
                    </span>
                </div>

                {/* Confirmation bar */}
                {confirmDoc && (
                    <div className="doc-picker__confirm-bar">
                        <span className="doc-picker__confirm-text">
                            {t('confirmLinkTitle')}
                            {' '}
                            <strong>{confirmDoc.filename}</strong>
                        </span>
                        <div className="doc-picker__confirm-actions">
                            <button
                                className="doc-picker__confirm-yes"
                                onClick={handleConfirmLink}
                                disabled={linking}
                            >
                                {linking ? '...' : t('confirmLinkYes')}
                            </button>
                            <button
                                className="doc-picker__confirm-no"
                                onClick={handleCancelConfirm}
                                disabled={linking}
                            >
                                {t('confirmLinkCancel')}
                            </button>
                        </div>
                    </div>
                )}

                <div className="doc-picker__body">
                    {/* Left: document list */}
                    <div className="doc-picker__list-panel">
                        <div className="doc-picker__search">
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder={t('searchDocuments')}
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>

                        <div className="doc-picker__list">
                            {filtered.length === 0 ? (
                                <div className="doc-picker__empty">
                                    {t('noDocumentsAvailable')}
                                </div>
                            ) : (
                                filtered.map(doc => {
                                    const isActive = previewDoc?.id === doc.id;
                                    const isAdded = addedIds.has(doc.id);
                                    const score = calcProximityScore(
                                        txAmount, txDate, getDocAmount(doc),
                                        doc.extracted_data?.invoice_date,
                                    );
                                    const level = getScoreLevel(score);

                                    return (
                                        <div
                                            key={doc.id}
                                            className={`doc-picker__item${isActive ? ' doc-picker__item--active' : ''}${isAdded ? ' doc-picker__item--added' : ''}`}
                                            onClick={() => handleItemClick(doc)}
                                        >
                                            <div className="doc-picker__item-score">
                                                <span className={`doc-picker__score-badge doc-picker__score-badge--${level}`}>
                                                    {score}
                                                </span>
                                            </div>
                                            <div className="doc-picker__item-info">
                                                <div className="doc-picker__item-name" title={doc.filename}>
                                                    {doc.filename}
                                                    {isAdded && (
                                                        <span className="doc-picker__added-badge">{t('docAdded')}</span>
                                                    )}
                                                </div>
                                                <div className="doc-picker__item-meta">
                                                    {getDocVendor(doc) || '-'}
                                                    {' \u00b7 '}
                                                    {doc.extracted_data?.invoice_date || '-'}
                                                    {getDocInvoiceNo(doc) && (
                                                        <> {' \u00b7 '} #{getDocInvoiceNo(doc)}</>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="doc-picker__item-amount">
                                                {fmtCurrency(getDocAmount(doc), txCurrency)}
                                            </span>
                                            {isAdded ? (
                                                <span className="doc-picker__item-added-check">&#10003;</span>
                                            ) : (
                                                <button
                                                    className="doc-picker__item-select"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleSelectClick(doc);
                                                    }}
                                                >
                                                    {t('selectDocument')}
                                                </button>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Right: preview panel */}
                    <div className="doc-picker__preview-panel">
                        {previewDoc ? (
                            <>
                                <div className="doc-picker__preview-meta">
                                    <div className="doc-picker__preview-filename" title={previewDoc.filename}>
                                        {previewDoc.filename}
                                    </div>
                                    <div className="doc-picker__preview-details">
                                        {getDocVendor(previewDoc) && (
                                            <span>{t('vendorName')}: {getDocVendor(previewDoc)}</span>
                                        )}
                                        <span>{t('colAmount')}: {fmtCurrency(getDocAmount(previewDoc), txCurrency)}</span>
                                    </div>
                                </div>
                                <div className="doc-picker__preview-viewer">
                                    <DocPreview
                                        documentId={previewDoc.id}
                                        filename={previewDoc.filename}
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="doc-picker__preview-placeholder">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                                    stroke="currentColor" strokeWidth="1.5">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="16" y1="13" x2="8" y2="13" />
                                    <line x1="16" y1="17" x2="8" y2="17" />
                                    <polyline points="10 9 9 9 8 9" />
                                </svg>
                                <p>{t('previewDocument')}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DocumentPickerModal;
