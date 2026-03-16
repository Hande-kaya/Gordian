/** TransactionModal — Unified 2×2 grid: PDFs (top), info + picker (bottom). */
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useLang } from '../../shared/i18n';
import { DocumentItem, DocumentFilters, getDocuments } from '../../services/documentApi';
import { UnifiedTransaction } from '../../services/reconciliationApi';
import {
    fmtCurrency, getMatches, getMatchScore, getConfidenceLevel,
    getDocAmount, getDocCurrency,
} from './matchingPanelUtils';
import DocPreview, { HighlightBox } from './DocPreview';
import './TransactionModal.scss';

/* SVG icons */
const ZoomIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
        <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
    </svg>
);
const EyeIcon: React.FC<{ open: boolean }> = ({ open }) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        {open ? (
            <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
        ) : (
            <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" /></>
        )}
    </svg>
);

/* Circular progress score (0–100) */
const CR = 15, CC = 2 * Math.PI * CR;
const ScoreCircle: React.FC<{ score: number; level: string }> = ({ score, level }) => (
    <div className={`tx-modal__score-circle tx-modal__score-circle--${level}`}>
        <svg viewBox="0 0 36 36" width="36" height="36">
            <circle className="tx-modal__score-bg" cx="18" cy="18" r={CR} />
            <circle className="tx-modal__score-fg" cx="18" cy="18" r={CR}
                strokeDasharray={CC} strokeDashoffset={CC * (1 - score / 100)}
                transform="rotate(-90 18 18)" />
        </svg>
        <span className="tx-modal__score-val">{score}</span>
    </div>
);

interface TransactionModalProps {
    transaction: UnifiedTransaction;
    expenses: DocumentItem[];
    revenues: DocumentItem[];
    linkedDocIds: Set<string>;
    onLink: (documentId: string) => Promise<boolean>;
    onUnlink: (matchId: string) => void;
    onClose: () => void;
}

const TransactionModal: React.FC<TransactionModalProps> = ({
    transaction, expenses, revenues, linkedDocIds, onLink, onUnlink, onClose,
}) => {
    const { t } = useLang();
    const matches = getMatches(transaction);
    const isCredit = transaction.type === 'credit';
    const currency = transaction.currency || 'TRY';
    const txAmount = Math.abs(transaction.amount);

    const [previewDocId, setPreviewDocId] = useState<string | null>(matches[0]?.document_ref.document_id || null);
    const [previewFilename, setPreviewFilename] = useState(matches[0]?.document_ref.filename || '');
    const [highlightStmt, setHighlightStmt] = useState(true);
    const [highlightDoc, setHighlightDoc] = useState(true);
    const stmtPage = transaction.page != null ? transaction.page + 1 : undefined;
    const stmtHighlightY = (highlightStmt && transaction.y_min != null && transaction.y_max != null)
        ? [transaction.y_min, transaction.y_max] as [number, number] : undefined;

    const [fullscreen, setFullscreen] = useState<'statement' | 'document' | null>(null);
    const [pickerTab, setPickerTab] = useState<'expense' | 'revenue'>(isCredit ? 'revenue' : 'expense');
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [colFilters, setColFilters] = useState<Record<string, string>>({});
    const [debouncedColFilters, setDebouncedColFilters] = useState<Record<string, string>>({});
    const [linking, setLinking] = useState(false);
    const [pickerDocsState, setPickerDocsState] = useState<DocumentItem[]>([]);
    const [pickerPage, setPickerPage] = useState(1);
    const [pickerHasMore, setPickerHasMore] = useState(false);
    const [pickerLoading, setPickerLoading] = useState(false);
    const [pickerTotal, setPickerTotal] = useState(0);
    const [addedIds, setAddedIds] = useState<Set<string>>(() => {
        const ids = new Set<string>();
        matches.forEach(m => { if (m.document_ref?.document_id) ids.add(m.document_ref.document_id); });
        return ids;
    });
    const searchRef = useRef<HTMLInputElement>(null);

    const previewDoc = useMemo(() => {
        if (!previewDocId) return null;
        return [...expenses, ...revenues, ...pickerDocsState].find(d => d.id === previewDocId) || null;
    }, [previewDocId, expenses, revenues, pickerDocsState]);

    const docHighlight = useMemo<{ page: number; box: HighlightBox } | null>(() => {
        if (!highlightDoc || !previewDoc) return null;
        const entities = previewDoc.extracted_data?.entities_with_bounds;
        if (!Array.isArray(entities)) return null;
        const ent = entities.find((e: any) => e.type === 'total_amount' && e.bounding_box?.length >= 4);
        if (!ent) return null;
        const xs = ent.bounding_box.map((v: any) => v.x ?? 0);
        const ys = ent.bounding_box.map((v: any) => v.y ?? 0);
        return {
            page: (ent.page ?? 0) + 1,
            box: { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) },
        };
    }, [highlightDoc, previewDoc]);

    const activeMatch = useMemo(() =>
        matches.find(m => m.document_ref?.document_id === previewDocId) || matches[0] || null,
    [matches, previewDocId]);
    const matchPct = activeMatch ? Math.round(getMatchScore(activeMatch) * 100) : 0;
    const matchLevel = activeMatch ? getConfidenceLevel(getMatchScore(activeMatch)) : 'low';

    useEffect(() => {
        const ids = new Set<string>();
        matches.forEach(m => { if (m.document_ref?.document_id) ids.add(m.document_ref.document_id); });
        setAddedIds(ids);
    }, [matches]);

    // Lock background scroll while modal is open
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, []);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { fullscreen ? setFullscreen(null) : onClose(); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose, fullscreen]);

    const handleOverlayClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
    }, [onClose]);

    const handlePreview = useCallback((docId: string, filename: string) => {
        setPreviewDocId(docId);
        setPreviewFilename(filename);
    }, []);

    const handleLink = useCallback(async (docId: string) => {
        setLinking(true);
        await onLink(docId);
        setLinking(false);
    }, [onLink]);

    const PICKER_PAGE_SIZE = 5;

    const fetchPickerDocs = useCallback(async (
        page: number, searchVal: string, filters: Record<string, string>, append: boolean,
    ) => {
        setPickerLoading(true);
        const docType = pickerTab === 'revenue' ? 'income' : 'invoice';
        const apiFilters: DocumentFilters = {};
        if (searchVal) apiFilters.search = searchVal;
        if (filters.date) apiFilters.filter_date = filters.date;
        if (filters.amount) apiFilters.filter_amount = filters.amount;
        if (filters.currency) apiFilters.filter_currency = filters.currency;
        if (filters.supplier) apiFilters.filter_supplier = filters.supplier;

        try {
            const res = await getDocuments(
                page, PICKER_PAGE_SIZE, docType, undefined,
                Object.keys(apiFilters).length > 0 ? apiFilters : undefined,
            );
            if (res.success && res.data) {
                const newDocs = res.data.documents.filter(d => d.ocr_status === 'completed');
                setPickerDocsState(prev => append ? [...prev, ...newDocs] : newDocs);
                setPickerHasMore(res.data.has_next);
                setPickerPage(page);
                setPickerTotal(res.data.total);
            }
        } catch {
            // silently fail
        }
        setPickerLoading(false);
    }, [pickerTab]);

    // Debounce top search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(timer);
    }, [search]);

    // Debounce column filters
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedColFilters({ ...colFilters }), 300);
        return () => clearTimeout(timer);
    }, [colFilters]);

    // Fetch when filters/tab change
    useEffect(() => {
        fetchPickerDocs(1, debouncedSearch, debouncedColFilters, false);
    }, [debouncedSearch, debouncedColFilters, pickerTab, fetchPickerDocs]);

    const handleColFilter = useCallback((col: string, val: string) => {
        setColFilters(prev => ({ ...prev, [col]: val }));
    }, []);

    const fsDocId = fullscreen === 'statement' ? transaction.statement_id : fullscreen === 'document' ? previewDocId : null;
    const fsFilename = fullscreen === 'statement' ? t('bankStatementPreview') : fullscreen === 'document' ? previewFilename : '';

    return (
        <div className="tx-modal-overlay" onClick={handleOverlayClick}>
            <div className="tx-modal">
                <div className="tx-modal__header">
                    <h3 className="tx-modal__title">{t('matchDetailTitle')}</h3>
                    <button className="tx-modal__close" onClick={onClose}>&times;</button>
                </div>

                <div className="tx-modal__body">
                    <div className="tx-modal__cell tx-modal__cell--stmt">
                        <div className="tx-modal__preview-bar">
                            <span className="tx-modal__preview-name">
                                {t('bankStatementPreview')}
                            </span>
                            {stmtPage != null && (
                                <button
                                    className={`tx-modal__preview-highlight${highlightStmt ? ' tx-modal__preview-highlight--active' : ''}`}
                                    onClick={() => setHighlightStmt(h => !h)}
                                    title={t('highlightTransaction')}
                                ><EyeIcon open={highlightStmt} /></button>
                            )}
                            <button className="tx-modal__preview-zoom"
                                onClick={() => setFullscreen('statement')}>
                                <ZoomIcon />
                            </button>
                        </div>
                        <div className="tx-modal__preview-content">
                            <DocPreview
                                documentId={transaction.statement_id}
                                initialPage={stmtPage}
                                highlightY={stmtHighlightY}
                            />
                        </div>
                    </div>

                    <div className="tx-modal__cell tx-modal__cell--doc">
                        <div className="tx-modal__preview-bar">
                            <button
                                className={`tx-modal__picker-tab tx-modal__picker-tab--expense${pickerTab === 'expense' ? ' tx-modal__picker-tab--active' : ''}`}
                                onClick={() => setPickerTab('expense')}
                            >
                                {t('pickerExpenses')} ({pickerTab === 'expense' ? pickerTotal : '-'})
                            </button>
                            <button
                                className={`tx-modal__picker-tab tx-modal__picker-tab--revenue${pickerTab === 'revenue' ? ' tx-modal__picker-tab--active' : ''}`}
                                onClick={() => setPickerTab('revenue')}
                            >
                                {t('pickerRevenue')} ({pickerTab === 'revenue' ? pickerTotal : '-'})
                            </button>
                            <input
                                ref={searchRef}
                                className="tx-modal__picker-search"
                                type="text"
                                placeholder={t('searchDocuments')}
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                            {previewDocId && (
                                <>
                                    <span className="tx-modal__preview-name" title={previewFilename}>
                                        {previewFilename}
                                    </span>
                                    <button
                                        className={`tx-modal__preview-highlight${highlightDoc ? ' tx-modal__preview-highlight--active' : ''}`}
                                        onClick={() => setHighlightDoc(h => !h)}
                                        title={t('highlightTransaction')}
                                    ><EyeIcon open={highlightDoc} /></button>
                                    <button className="tx-modal__preview-zoom"
                                        onClick={() => setFullscreen('document')}>
                                        <ZoomIcon />
                                    </button>
                                </>
                            )}
                        </div>
                        <div className="tx-modal__preview-content">
                            {previewDocId ? (
                                <DocPreview
                                    key={previewDocId}
                                    documentId={previewDocId}
                                    filename={previewFilename}
                                    initialPage={docHighlight?.page}
                                    highlightBox={docHighlight?.box}
                                />
                            ) : (
                                <div className="tx-modal__preview-empty">
                                    <p>{t('previewDocument')}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="tx-modal__cell tx-modal__cell--info">
                        <h4 className="tx-modal__section-title">{t('transactionInfo')}</h4>
                        <div className="tx-modal__field">
                            <span className="tx-modal__label">{t('colDate')}</span>
                            <span className="tx-modal__value">{transaction.date || '-'}</span>
                        </div>
                        <div className="tx-modal__field">
                            <span className="tx-modal__label">{t('colDescription')}</span>
                            <span className="tx-modal__value tx-modal__value--desc">
                                {transaction.description || '-'}
                            </span>
                        </div>
                        <div className="tx-modal__field">
                            <span className="tx-modal__label">{t('colAmount')}</span>
                            <span className="tx-modal__amount">{fmtCurrency(txAmount, currency)}</span>
                        </div>
                        <div className="tx-modal__field">
                            <span className="tx-modal__label">{t('colType')}</span>
                            <span className={`matching-type-badge matching-type-badge--${isCredit ? 'credit' : 'debit'}`}>
                                {isCredit ? t('credit') : t('debit')}
                            </span>
                        </div>
                        {activeMatch && (
                            <div className="tx-modal__ai-section">
                                <div className="tx-modal__ai-header">
                                    <ScoreCircle score={matchPct} level={matchLevel} />
                                    <div className="tx-modal__ai-meta">
                                        <span className="tx-modal__ai-label">
                                            {activeMatch.source === 'manual' ? t('statusManual') : 'AI'}
                                        </span>
                                        <span className="tx-modal__ai-filename" title={activeMatch.document_ref?.filename}>
                                            {activeMatch.document_ref?.filename}
                                        </span>
                                    </div>
                                </div>
                                {activeMatch.score.ai_reason && (
                                    <p className="tx-modal__ai-reason">{activeMatch.score.ai_reason}</p>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="tx-modal__cell tx-modal__cell--picker">
                        <div className="tx-modal__picker-table-wrap">
                            <table className="tx-modal__picker-table">
                                <thead>
                                    <tr>
                                        <th>{t('pickerDate')}</th>
                                        <th>{t('pickerAmount')}</th>
                                        <th>{t('pickerCurrency')}</th>
                                        <th>{t('pickerSupplier')}</th>
                                        <th></th>
                                    </tr>
                                    <tr className="tx-modal__picker-filter-row">
                                        <th><input type="text" placeholder="..." value={colFilters.date || ''} onChange={e => handleColFilter('date', e.target.value)} /></th>
                                        <th><input type="text" placeholder="..." value={colFilters.amount || ''} onChange={e => handleColFilter('amount', e.target.value)} /></th>
                                        <th><input type="text" placeholder="..." value={colFilters.currency || ''} onChange={e => handleColFilter('currency', e.target.value)} /></th>
                                        <th><input type="text" placeholder="..." value={colFilters.supplier || ''} onChange={e => handleColFilter('supplier', e.target.value)} /></th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pickerDocsState.length === 0 && !pickerLoading && (
                                        <tr><td colSpan={5} className="tx-modal__picker-empty">{t('noDocumentsAvailable')}</td></tr>
                                    )}
                                    {pickerDocsState.map(doc => {
                                        const isAdded = addedIds.has(doc.id);
                                        const isActive = previewDocId === doc.id;
                                        const ed = doc.extracted_data;
                                        return (
                                            <tr
                                                key={doc.id}
                                                className={`tx-modal__picker-trow${isActive ? ' tx-modal__picker-trow--active' : ''}`}
                                                onClick={() => handlePreview(doc.id, doc.filename)}
                                            >
                                                <td>{ed?.invoice_date || '-'}</td>
                                                <td>{fmtCurrency(getDocAmount(doc), getDocCurrency(doc) || currency)}</td>
                                                <td>{ed?.financials?.currency || ed?.currency || '-'}</td>
                                                <td title={ed?.supplier_name || '-'}>{ed?.supplier_name || '-'}</td>
                                                <td className="tx-modal__picker-td-action">
                                                    {isAdded ? (
                                                        <span className="tx-modal__picker-check">&#10003;</span>
                                                    ) : (
                                                        <button
                                                            className="tx-modal__picker-link"
                                                            onClick={e => { e.stopPropagation(); handleLink(doc.id); }}
                                                            disabled={linking}
                                                        >
                                                            {t('linkButton')}
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="tx-modal__picker-footer">
                            {pickerLoading && (
                                <div className="tx-modal__picker-loading">{t('loadingDocs')}</div>
                            )}
                            {pickerHasMore && !pickerLoading && (
                                <button
                                    className="tx-modal__show-all-btn"
                                    onClick={() => fetchPickerDocs(pickerPage + 1, debouncedSearch, debouncedColFilters, true)}
                                    disabled={pickerLoading}
                                >
                                    {t('more')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Fullscreen preview (bank statement or document) */}
                {fullscreen && fsDocId && (
                    <div className="tx-modal__fullscreen" onClick={() => setFullscreen(null)}>
                        <div className="tx-modal__fullscreen-inner" onClick={e => e.stopPropagation()}>
                            <button className="tx-modal__fullscreen-close" onClick={() => setFullscreen(null)}>
                                &times;
                            </button>
                            <DocPreview
                                key={`fs-${fsDocId}`}
                                documentId={fsDocId}
                                filename={fsFilename}
                                initialPage={fullscreen === 'statement' ? stmtPage : docHighlight?.page}
                                highlightY={fullscreen === 'statement' ? stmtHighlightY : undefined}
                                highlightBox={fullscreen === 'document' ? docHighlight?.box : undefined}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TransactionModal;
