/** TransactionModal — Unified 2×2 grid: PDFs (top), info + picker (bottom). */
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useLang } from '../../shared/i18n';
import { DocumentItem } from '../../services/documentApi';
import { UnifiedTransaction } from '../../services/reconciliationApi';
import {
    fmtCurrency, getMatches, getMatchScore, getConfidenceLevel,
    getDocAmount, getDocCurrency, getDocVendor, parseDocDate, daysBetween,
    calcProximityScore, getScoreLevel, MAX_DATE_DIFF_DAYS,
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
    incomes: DocumentItem[];
    linkedDocIds: Set<string>;
    onLink: (documentId: string) => Promise<boolean>;
    onUnlink: (matchId: string) => void;
    onClose: () => void;
}

const TransactionModal: React.FC<TransactionModalProps> = ({
    transaction, expenses, incomes, linkedDocIds, onLink, onUnlink, onClose,
}) => {
    const { t } = useLang();
    const matches = getMatches(transaction);
    const isCredit = transaction.type === 'credit';
    const currency = transaction.currency || 'TRY';
    const txAmount = Math.abs(transaction.amount);
    const txDate = parseDocDate(transaction.date);

    const [previewDocId, setPreviewDocId] = useState<string | null>(matches[0]?.document_ref.document_id || null);
    const [previewFilename, setPreviewFilename] = useState(matches[0]?.document_ref.filename || '');
    const [highlightStmt, setHighlightStmt] = useState(true);
    const [highlightDoc, setHighlightDoc] = useState(true);
    const stmtPage = transaction.page != null ? transaction.page + 1 : undefined;
    const stmtHighlightY = (highlightStmt && transaction.y_min != null && transaction.y_max != null)
        ? [transaction.y_min, transaction.y_max] as [number, number] : undefined;

    const previewDoc = useMemo(() => {
        if (!previewDocId) return null;
        return [...expenses, ...incomes].find(d => d.id === previewDocId) || null;
    }, [previewDocId, expenses, incomes]);

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

    const [fullscreen, setFullscreen] = useState<'statement' | 'document' | null>(null);
    const [pickerTab, setPickerTab] = useState<'expense' | 'income'>(isCredit ? 'income' : 'expense');
    const [search, setSearch] = useState('');
    const [linking, setLinking] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const [maxDays, setMaxDays] = useState(365);
    const [addedIds, setAddedIds] = useState<Set<string>>(() => {
        const ids = new Set<string>();
        matches.forEach(m => { if (m.document_ref?.document_id) ids.add(m.document_ref.document_id); });
        return ids;
    });
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const ids = new Set<string>();
        matches.forEach(m => { if (m.document_ref?.document_id) ids.add(m.document_ref.document_id); });
        setAddedIds(ids);
    }, [matches]);

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

    const pickerDocs = useMemo(() => {
        const docs = pickerTab === 'income' ? incomes : expenses;
        const ownLinkedIds = new Set(
            matches.map(m => m.document_ref?.document_id).filter(Boolean),
        );
        let items = docs.filter(d => {
            if (d.ocr_status !== 'completed') return false;
            if (linkedDocIds?.has(d.id) && !ownLinkedIds.has(d.id)) return false;
            return true;
        });
        const dateLimitDays = showAll ? maxDays : MAX_DATE_DIFF_DAYS;
        if (txDate) {
            items = items.filter(d => {
                const dd = parseDocDate(d.extracted_data?.invoice_date);
                if (!dd) return true;
                return daysBetween(txDate, dd) <= dateLimitDays;
            });
        }
        const term = search.toLowerCase().trim();
        if (term) {
            items = items.filter(d => {
                const name = (d.filename || '').toLowerCase();
                const vendor = getDocVendor(d).toLowerCase();
                return name.includes(term) || vendor.includes(term);
            });
        }
        return [...items].sort((a, b) => {
            const sa = calcProximityScore(txAmount, txDate, getDocAmount(a), a.extracted_data?.invoice_date);
            const sb = calcProximityScore(txAmount, txDate, getDocAmount(b), b.extracted_data?.invoice_date);
            return sb - sa;
        });
    }, [pickerTab, expenses, incomes, matches, linkedDocIds, txDate, search, txAmount, showAll, maxDays]);

    const expenseCount = expenses.filter(d => d.ocr_status === 'completed').length;
    const incomeCount = incomes.filter(d => d.ocr_status === 'completed').length;

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
                        {previewDocId ? (
                            <>
                                <div className="tx-modal__preview-bar">
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
                                </div>
                                <div className="tx-modal__preview-content">
                                    <DocPreview
                                        key={previewDocId}
                                        documentId={previewDocId}
                                        filename={previewFilename}
                                        initialPage={docHighlight?.page}
                                        highlightBox={docHighlight?.box}
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="tx-modal__preview-empty">
                                <p>{t('previewDocument')}</p>
                            </div>
                        )}
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
                        <div className="tx-modal__picker-header">
                            <button
                                className={`tx-modal__picker-tab tx-modal__picker-tab--expense${pickerTab === 'expense' ? ' tx-modal__picker-tab--active' : ''}`}
                                onClick={() => setPickerTab('expense')}
                            >
                                {t('uploadExpenses')} ({expenseCount})
                            </button>
                            <button
                                className={`tx-modal__picker-tab tx-modal__picker-tab--income${pickerTab === 'income' ? ' tx-modal__picker-tab--active' : ''}`}
                                onClick={() => setPickerTab('income')}
                            >
                                {t('uploadIncome')} ({incomeCount})
                            </button>
                            <input
                                ref={searchRef}
                                className="tx-modal__picker-search"
                                type="text"
                                placeholder={t('searchDocuments')}
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <div className="tx-modal__picker-list">
                            {pickerDocs.length === 0 ? (
                                <div className="tx-modal__picker-empty">{t('noDocumentsAvailable')}</div>
                            ) : pickerDocs.map(doc => {
                                const isAdded = addedIds.has(doc.id);
                                const score = calcProximityScore(
                                    txAmount, txDate, getDocAmount(doc), doc.extracted_data?.invoice_date,
                                );
                                const level = getScoreLevel(score);
                                const isActive = previewDocId === doc.id;
                                return (
                                    <div
                                        key={doc.id}
                                        className={`tx-modal__picker-row${isActive ? ' tx-modal__picker-row--active' : ''}`}
                                        onClick={() => handlePreview(doc.id, doc.filename)}
                                    >
                                        <ScoreCircle score={score} level={level} />
                                        <div className="tx-modal__picker-info">
                                            <span className="tx-modal__picker-name" title={doc.filename}>
                                                {doc.filename}
                                                {isAdded && <span className="tx-modal__badge-added">{t('docAdded')}</span>}
                                            </span>
                                            <span className="tx-modal__picker-meta">
                                                {getDocVendor(doc) || '-'} · {fmtCurrency(getDocAmount(doc), getDocCurrency(doc) || currency)}
                                            </span>
                                        </div>
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
                                    </div>
                                );
                            })}
                        </div>
                        <div className="tx-modal__picker-footer">
                            {!showAll ? (
                                <button className="tx-modal__show-all-btn" onClick={() => setShowAll(true)}>
                                    {t('showAllDocs')}
                                </button>
                            ) : (
                                <div className="tx-modal__range-bar">
                                    <span className="tx-modal__range-label">{t('dateRange')}: {maxDays} {t('days')}</span>
                                    <input type="range" className="tx-modal__range-slider"
                                        min={30} max={730} step={30} value={maxDays}
                                        onChange={e => setMaxDays(+e.target.value)} />
                                    <button className="tx-modal__range-reset" onClick={() => { setShowAll(false); setMaxDays(365); }}>
                                        &times;
                                    </button>
                                </div>
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
