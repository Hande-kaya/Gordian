/**
 * Matching Panel — unified transaction list with inline actions + detail modal.
 * Single table with spacer column for perfect row alignment.
 * Supports multi-link: a transaction can be linked to multiple documents.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLang } from '../../shared/i18n';
import { DocumentItem } from '../../services/documentApi';
import {
    UnifiedTransaction,
    runMatching,
    getTransactions,
    deleteMatch,
    createManualMatch,
    clearMatchStale,
    RunMatchingParams,
    ColumnFilters,
} from '../../services/reconciliationApi';
import TransactionRow from './TransactionRow';
import TransactionModal from './TransactionModal';
import RematchModal from './RematchModal';
import ConfirmModal from '../../components/common/ConfirmModal';
import InvoiceExportModal, { ExportConfig } from '../InvoiceList/InvoiceExportModal';
import { exportReconciliationToExcel } from '../../utils/reconciliationExport';
import { useMatchingStatus } from './useMatchingStatus';
import { getMatches, getMatchScore } from './matchingPanelUtils';
import DateRangePicker, { DateRangeValue } from '../../components/common/DateRangePicker';
import './MatchingPanel.scss';

interface MatchingPanelProps {
    hasBankTransactions: boolean;
    expenses: DocumentItem[];
    revenues: DocumentItem[];
    onMatchingComplete?: () => void;
    refreshTrigger?: number;
}

const PAGE_SIZES = [10, 20, 50] as const;
type FilterStatus = 'all' | 'matched' | 'unmatched';

const MatchingPanel: React.FC<MatchingPanelProps> = ({
    hasBankTransactions, expenses, revenues, onMatchingComplete, refreshTrigger,
}) => {
    const { t, lang } = useLang();

    const [transactions, setTransactions] = useState<UnifiedTransaction[]>([]);
    const [total, setTotal] = useState(0);
    const [summary, setSummary] = useState({ total: 0, matched: 0, unmatched: 0 });
    const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState<number>(20);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [matching, setMatching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [detailTx, setDetailTx] = useState<UnifiedTransaction | null>(null);
    const [unlinkMatchId, setUnlinkMatchId] = useState<string | null>(null);
    const [showRematchOptions, setShowRematchOptions] = useState(false);
    const [showRematchModal, setShowRematchModal] = useState(false);
    const [rematchTxs, setRematchTxs] = useState<UnifiedTransaction[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
    const [debouncedFilters, setDebouncedFilters] = useState<ColumnFilters>({});
    const [dateFrom, setDateFrom] = useState<DateRangeValue | null>(null);
    const [dateTo, setDateTo] = useState<DateRangeValue | null>(null);

    // Export modal state
    const [showExportModal, setShowExportModal] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Page size dropdown
    const [showPageSizeDropdown, setShowPageSizeDropdown] = useState(false);
    const pageSizeRef = useRef<HTMLDivElement>(null);

    // Close dropdowns on outside click
    useEffect(() => {
        if (!showPageSizeDropdown) return;
        const handleClick = (e: MouseEvent) => {
            if (pageSizeRef.current && !pageSizeRef.current.contains(e.target as Node)) {
                setShowPageSizeDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [showPageSizeDropdown]);

    // Debounce search query (300ms) and reset page
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery);
            setPage(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Debounce column filters (400ms)
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedFilters(columnFilters);
            setPage(1);
        }, 400);
        return () => clearTimeout(timer);
    }, [columnFilters]);

    const fetchTransactions = useCallback(async (p = 1, ps = 20, filter: FilterStatus = 'all', search = '', colFilters?: ColumnFilters) => {
        setLoading(true);
        try {
            const res = await getTransactions(p, ps, filter, search, colFilters);
            if (res.success && res.data) {
                setTransactions(res.data.transactions);
                setTotal(res.data.total);
                setSummary(res.data.summary);
            }
        } catch {
            // silent
        } finally {
            setLoading(false);
            setLoaded(true);
        }
    }, []);

    const { startPolling } = useMatchingStatus({
        setMatching,
        onComplete: useCallback(() => {
            fetchTransactions(1, pageSize, filterStatus, debouncedSearch, debouncedFilters);
            onMatchingComplete?.();
        }, [fetchTransactions, pageSize, filterStatus, debouncedSearch, debouncedFilters, onMatchingComplete]),
    });

    useEffect(() => {
        fetchTransactions(page, pageSize, filterStatus, debouncedSearch, debouncedFilters);
    }, [fetchTransactions, page, pageSize, filterStatus, debouncedSearch, debouncedFilters]);

    // Re-fetch when parent triggers a refresh (e.g. after upload)
    const refreshTriggerRef = useRef(refreshTrigger);
    useEffect(() => {
        if (refreshTrigger !== refreshTriggerRef.current && refreshTrigger && refreshTrigger > 0) {
            refreshTriggerRef.current = refreshTrigger;
            fetchTransactions(1, pageSize, filterStatus, debouncedSearch, debouncedFilters);
        }
    }, [refreshTrigger, fetchTransactions, pageSize, filterStatus, debouncedSearch, debouncedFilters]);

    const handleRunMatching = useCallback(async (params: RunMatchingParams = {}) => {
        setMatching(true);
        setError(null);
        setShowRematchOptions(false);
        setShowRematchModal(false);
        try {
            const res = await runMatching({ ...params, language: lang });
            if (res.success) {
                setPage(1);
                await fetchTransactions(1, pageSize, filterStatus, debouncedSearch, debouncedFilters);
                onMatchingComplete?.();
                setMatching(false);
            } else {
                if (res.message?.includes('already in progress')) {
                    startPolling();
                } else {
                    setError(res.message || t('matchingFailed'));
                    setMatching(false);
                }
            }
        } catch {
            setError(t('matchingFailed'));
            setMatching(false);
        }
    }, [fetchTransactions, pageSize, filterStatus, debouncedSearch, debouncedFilters, onMatchingComplete, t, lang, startPolling]);

    const handleOpenRematchModal = useCallback(async () => {
        setShowRematchOptions(false);
        const res = await getTransactions(1, 1000, 'matched');
        if (res.success && res.data) {
            setRematchTxs(res.data.transactions);
        }
        setShowRematchModal(true);
    }, []);

    const handleRematch = useCallback((preserveMatchIds: string[]) => {
        handleRunMatching({
            rematch_mode: 'keep_selected',
            preserve_match_ids: preserveMatchIds,
        });
    }, [handleRunMatching]);

    const handleUnlinkRequest = useCallback((matchId: string) => setUnlinkMatchId(matchId), []);

    const handleUnlinkConfirm = useCallback(async () => {
        if (!unlinkMatchId) return;
        const res = await deleteMatch(unlinkMatchId);
        if (res.success) {
            setDetailTx(null);
            setUnlinkMatchId(null);
            await fetchTransactions(page, pageSize, filterStatus, debouncedSearch, debouncedFilters);
        }
    }, [unlinkMatchId, fetchTransactions, page, pageSize, filterStatus, debouncedSearch, debouncedFilters]);

    const handleClearStale = useCallback(async (matchId: string) => {
        const res = await clearMatchStale(matchId);
        if (res.success) {
            await fetchTransactions(page, pageSize, filterStatus, debouncedSearch, debouncedFilters);
        }
    }, [fetchTransactions, page, pageSize, filterStatus, debouncedSearch, debouncedFilters]);

    const handleLinkInModal = useCallback(async (documentId: string): Promise<boolean> => {
        if (!detailTx) return false;
        const res = await createManualMatch(
            detailTx.statement_id, detailTx.tx_index, documentId,
        );
        if (res.success) {
            await fetchTransactions(page, pageSize, filterStatus, debouncedSearch, debouncedFilters);
            const refreshRes = await getTransactions(page, pageSize, filterStatus, debouncedSearch, debouncedFilters);
            if (refreshRes.success && refreshRes.data) {
                const updated = refreshRes.data.transactions.find(
                    t => t.statement_id === detailTx.statement_id && t.tx_index === detailTx.tx_index,
                );
                if (updated) setDetailTx(updated);
            }
            return true;
        }
        return false;
    }, [detailTx, fetchTransactions, page, pageSize, filterStatus, debouncedSearch, debouncedFilters]);

    const handleFilterChange = useCallback((f: FilterStatus) => {
        setFilterStatus(f);
        setPage(1);
    }, []);

    const handlePageSizeChange = useCallback((ps: number) => {
        setPageSize(ps);
        setPage(1);
        setShowPageSizeDropdown(false);
    }, []);

    // Date range — extract year range from transactions
    const dateRangeYears = useMemo(() => {
        const currentYear = new Date().getFullYear();
        let minY = currentYear, maxY = currentYear;
        for (const tx of transactions) {
            const d = tx.date || '';
            const m1 = d.match(/(\d{4})-\d{1,2}/);
            const m2 = d.match(/\d{1,2}[./]\d{1,2}[./](\d{4})/);
            const y = m1 ? parseInt(m1[1], 10) : m2 ? parseInt(m2[1], 10) : NaN;
            if (!isNaN(y)) {
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
        const years: number[] = [];
        for (let y = minY; y <= maxY; y++) years.push(y);
        return years;
    }, [transactions]);

    const handleDateRangeChange = useCallback((from: DateRangeValue | null, to: DateRangeValue | null) => {
        setDateFrom(from);
        setDateTo(to);
        setColumnFilters(cf => {
            const updated = { ...cf };
            if (!from && !to) {
                delete updated.date;
            } else {
                const f = from ? `${from.year}-${String(from.month).padStart(2, '0')}` : '';
                const t2 = to ? `${to.year}-${String(to.month).padStart(2, '0')}` : '';
                updated.date = `${f}..${t2}`;
            }
            return updated;
        });
        setPage(1);
    }, []);

    const updateColumnFilter = useCallback((key: string, value: string) => {
        // If user manually types in the date column filter, clear range picker
        if (key === 'date') { setDateFrom(null); setDateTo(null); }
        setColumnFilters(prev => {
            const next = { ...prev };
            if (!value) {
                delete next[key];
            } else {
                next[key] = value;
            }
            return next;
        });
    }, []);

    const handleUnlinkInModal = useCallback(async (matchId: string) => {
        const res = await deleteMatch(matchId);
        if (res.success) {
            await fetchTransactions(page, pageSize, filterStatus, debouncedSearch, debouncedFilters);
            if (detailTx) {
                const refreshRes = await getTransactions(page, pageSize, filterStatus, debouncedSearch, debouncedFilters);
                if (refreshRes.success && refreshRes.data) {
                    const updated = refreshRes.data.transactions.find(
                        t => t.statement_id === detailTx.statement_id && t.tx_index === detailTx.tx_index,
                    );
                    setDetailTx(updated || null);
                }
            }
        }
    }, [fetchTransactions, page, pageSize, filterStatus, debouncedSearch, debouncedFilters, detailTx]);

    // Export: fetch all transactions and generate Excel with InvoiceExportModal config
    const handleExportConfirm = useCallback(async (config: ExportConfig) => {
        setIsExporting(true);
        try {
            const res = await getTransactions(1, 10000, filterStatus, debouncedSearch, debouncedFilters);
            const allTxs = res.success && res.data ? res.data.transactions : transactions;
            exportReconciliationToExcel(allTxs, {
                startDate: config.startDate,
                endDate: config.endDate,
                sheetMonths: config.sheetMonths,
            });
            setShowExportModal(false);
        } catch {
            // silent
        } finally {
            setIsExporting(false);
        }
    }, [transactions, filterStatus, debouncedSearch, debouncedFilters]);

    // Collect all document IDs already linked to any transaction
    const linkedDocIds = useMemo(() => {
        const ids = new Set<string>();
        for (const tx of transactions) {
            for (const m of (tx.matches || [])) {
                if (m.document_ref?.document_id) ids.add(m.document_ref.document_id);
            }
        }
        return ids;
    }, [transactions]);

    const totalPages = Math.ceil(total / pageSize);
    const hasExisting = summary.matched > 0;
    const buttonLabel = hasExisting ? t('rematchButton') : t('matchButton');
    const startIdx = (page - 1) * pageSize + 1;
    const endIdx = Math.min(page * pageSize, total);

    // Empty state
    if (!hasBankTransactions && summary.total === 0 && loaded) {
        return (
            <div className="matching-panel matching-panel--empty">
                <h3 className="matching-panel__title">{t('matchingTitle')}</h3>
                <div className="matching-panel__empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="1.5">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    <p className="matching-panel__empty-text">{t('noTransactionsToMatch')}</p>
                    <p className="matching-panel__empty-hint">{t('noTransactionsHint')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="matching-panel">
            {/* Header row */}
            <div className="matching-panel__header">
                <div className="matching-panel__header-left">
                    <h3 className="matching-panel__title">{t('matchingTitle')}</h3>
                    <div className="matching-panel__search">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" />
                            <path d="M21 21l-4.35-4.35" />
                        </svg>
                        <input
                            type="text"
                            placeholder={t('searchTransactions')}
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="matching-panel__search-input"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="matching-panel__search-clear"
                            >
                                &times;
                            </button>
                        )}
                    </div>
                </div>
                <div className="matching-panel__actions">
                    <button
                        className="matching-panel__match-btn"
                        onClick={() => hasExisting ? setShowRematchOptions(true) : handleRunMatching()}
                        disabled={matching || !hasBankTransactions}
                    >
                        {matching ? (
                            <>
                                <span className="matching-panel__btn-spinner" />
                                {t('matchingInProgress')}
                            </>
                        ) : buttonLabel}
                    </button>
                </div>
            </div>

            {error && <div className="matching-panel__error">{error}</div>}

            {/* Summary */}
            {summary.total > 0 && (
                <div className="matching-panel__summary">
                    <span className="matching-panel__summary-item">
                        {t('totalTransactions')}: <strong>{summary.total}</strong>
                    </span>
                    <span className="matching-panel__summary-item matching-panel__summary-item--matched">
                        {t('matchedCount')}: <strong>{summary.matched}</strong>
                    </span>
                    <span className="matching-panel__summary-item matching-panel__summary-item--unmatched">
                        {t('unmatchedCount')}: <strong>{summary.unmatched}</strong>
                    </span>
                </div>
            )}

            {/* Date range picker */}
            <DateRangePicker
                from={dateFrom}
                to={dateTo}
                years={dateRangeYears}
                onChange={handleDateRangeChange}
            />

            {/* Toolbar: Filters + right-side buttons */}
            <div className="matching-panel__toolbar">
                <div className="matching-panel__filters">
                    {(['all', 'matched', 'unmatched'] as FilterStatus[]).map(f => (
                        <button
                            key={f}
                            className={`matching-panel__filter-tab${filterStatus === f ? ' matching-panel__filter-tab--active' : ''}`}
                            onClick={() => handleFilterChange(f)}
                        >
                            {f === 'all' && `${t('filterAll')} (${summary.total})`}
                            {f === 'matched' && `${t('filterMatched')} (${summary.matched})`}
                            {f === 'unmatched' && `${t('filterUnmatched')} (${summary.unmatched})`}
                        </button>
                    ))}
                </div>

                <div className="matching-panel__toolbar-right">
                    {/* Export button */}
                    <button
                        className="matching-panel__toolbar-btn"
                        onClick={() => setShowExportModal(true)}
                        disabled={total === 0}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        {t('exportExcel')}
                    </button>

                    {/* Page size dropdown */}
                    <div className="matching-panel__page-size-wrap" ref={pageSizeRef}>
                        <button
                            className="matching-panel__toolbar-btn"
                            onClick={() => setShowPageSizeDropdown(v => !v)}
                        >
                            {t('showPerPage')} {pageSize}
                            <span className={`matching-panel__dropdown-arrow${showPageSizeDropdown ? ' matching-panel__dropdown-arrow--open' : ''}`}>&#9660;</span>
                        </button>
                        {showPageSizeDropdown && (
                            <div className="matching-panel__page-size-dropdown">
                                {PAGE_SIZES.map(ps => (
                                    <button
                                        key={ps}
                                        className={`matching-panel__page-size-option${pageSize === ps ? ' matching-panel__page-size-option--active' : ''}`}
                                        onClick={() => handlePageSizeChange(ps)}
                                    >
                                        {ps}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {loading && !loaded ? (
                <div className="matching-panel__loading">
                    <div className="reconciliation-page__spinner" />
                </div>
            ) : (
                <>
                    <div className="matching-panel__table-wrap">
                        <table className="matching-panel__table matching-panel__table--split">
                            <colgroup>
                                {/* Left half: Date | Description | Amount — ~49% */}
                                <col style={{ width: '8%' }} />
                                <col style={{ width: '31%' }} />
                                <col style={{ width: '10%' }} />
                                {/* Spacer — 2% */}
                                <col style={{ width: '2%' }} />
                                {/* Right half: Match | Vendor | DocAmt | DocDate | Confidence | Actions — ~49% */}
                                <col style={{ width: '11%' }} />
                                <col style={{ width: '10%' }} />
                                <col style={{ width: '8%' }} />
                                <col style={{ width: '7%' }} />
                                <col style={{ width: '6%' }} />
                                <col style={{ width: '7%' }} />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th className="mcell mcell--left-first">{t('colDate')}</th>
                                    <th className="mcell">{t('colDescription')}</th>
                                    <th className="mcell mcell--left-last">{t('colAmount')}</th>
                                    <th className="mcell--spacer" />
                                    <th className="mcell mcell--right-first">{t('colMatch')}</th>
                                    <th className="mcell">{t('vendorName')}</th>
                                    <th className="mcell">{t('colAmount')}</th>
                                    <th className="mcell">{t('colDate')}</th>
                                    <th className="mcell">{t('colConfidence')}</th>
                                    <th className="mcell mcell--right-last"></th>
                                </tr>
                                <tr className="matching-panel__filter-row">
                                    <th className="mcell mcell--filter mcell--left-first">
                                        <input type="text" placeholder={`${t('colDate')}...`} value={columnFilters.date || ''} onChange={e => updateColumnFilter('date', e.target.value)} className="column-filter-input" onClick={e => e.stopPropagation()} />
                                    </th>
                                    <th className="mcell mcell--filter">
                                        <input type="text" placeholder={`${t('colDescription')}...`} value={columnFilters.description || ''} onChange={e => updateColumnFilter('description', e.target.value)} className="column-filter-input" onClick={e => e.stopPropagation()} />
                                    </th>
                                    <th className="mcell mcell--filter mcell--left-last">
                                        <input type="text" placeholder={`${t('colAmount')}...`} value={columnFilters.amount || ''} onChange={e => updateColumnFilter('amount', e.target.value)} className="column-filter-input" onClick={e => e.stopPropagation()} />
                                    </th>
                                    <th className="mcell--spacer" />
                                    <th className="mcell mcell--filter mcell--right-first">
                                        <input type="text" placeholder={`${t('colMatch')}...`} value={columnFilters.match_doc || ''} onChange={e => updateColumnFilter('match_doc', e.target.value)} className="column-filter-input" onClick={e => e.stopPropagation()} />
                                    </th>
                                    <th className="mcell mcell--filter">
                                        <input type="text" placeholder={`${t('vendorName')}...`} value={columnFilters.vendor || ''} onChange={e => updateColumnFilter('vendor', e.target.value)} className="column-filter-input" onClick={e => e.stopPropagation()} />
                                    </th>
                                    <th className="mcell mcell--filter">
                                        <input type="text" placeholder={`${t('colAmount')}...`} value={columnFilters.doc_amount || ''} onChange={e => updateColumnFilter('doc_amount', e.target.value)} className="column-filter-input" onClick={e => e.stopPropagation()} />
                                    </th>
                                    <th className="mcell mcell--filter">
                                        <input type="text" placeholder={`${t('colDate')}...`} value={columnFilters.doc_date || ''} onChange={e => updateColumnFilter('doc_date', e.target.value)} className="column-filter-input" onClick={e => e.stopPropagation()} />
                                    </th>
                                    <th className="mcell mcell--filter">
                                        <input type="text" placeholder={`${t('colConfidence')}...`} value={columnFilters.confidence || ''} onChange={e => updateColumnFilter('confidence', e.target.value)} className="column-filter-input" onClick={e => e.stopPropagation()} />
                                    </th>
                                    <th className="mcell mcell--filter mcell--right-last"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="matching-panel__no-results">
                                            {t('noTransactionsToMatch')}
                                        </td>
                                    </tr>
                                ) : (
                                    transactions.map(tx => (
                                        <TransactionRow
                                            key={`${tx.statement_id}-${tx.tx_index}`}
                                            tx={tx}
                                            onOpenDetail={setDetailTx}
                                            onLink={setDetailTx}
                                            onUnlink={handleUnlinkRequest}
                                            onClearStale={handleClearStale}
                                        />
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {total > 0 && (
                        <div className="matching-panel__pagination">
                            <span className="matching-panel__page-info">
                                {startIdx}–{endIdx} / {total}
                            </span>
                            <button
                                className="matching-panel__page-btn"
                                disabled={page <= 1}
                                onClick={() => setPage(p => p - 1)}
                            >
                                &laquo; {t('prevPage')}
                            </button>
                            <span className="matching-panel__page-current">
                                {page} / {totalPages || 1}
                            </span>
                            <button
                                className="matching-panel__page-btn"
                                disabled={page >= totalPages}
                                onClick={() => setPage(p => p + 1)}
                            >
                                {t('nextPage')} &raquo;
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Export Modal */}
            <InvoiceExportModal
                isOpen={showExportModal}
                onClose={() => setShowExportModal(false)}
                onExport={handleExportConfirm}
                isLoading={isExporting}
            />

            {/* Unified Transaction Modal (detail + picker) */}
            {detailTx && (
                <TransactionModal
                    transaction={detailTx}
                    expenses={expenses}
                    revenues={revenues}
                    linkedDocIds={linkedDocIds}
                    onLink={handleLinkInModal}
                    onUnlink={handleUnlinkInModal}
                    onClose={() => setDetailTx(null)}
                />
            )}

            {/* Re-match Options Modal (3-button) */}
            {showRematchOptions && (
                <div className="confirm-modal-overlay" onClick={() => setShowRematchOptions(false)}>
                    <div className="confirm-modal" onClick={e => e.stopPropagation()}>
                        <div className="confirm-modal__header">
                            <h3>{t('rematchOptionTitle')}</h3>
                        </div>
                        <div className="confirm-modal__body">
                            <p>{t('rematchOptionMessage')}</p>
                        </div>
                        <div className="rematch-options">
                            <button
                                className="rematch-options__btn rematch-options__btn--recommended"
                                onClick={() => handleRunMatching({ rematch_mode: 'preserve_all' })}
                            >
                                <strong>{t('rematchPreserve')}</strong>
                                <span>{t('rematchPreserveHint')}</span>
                            </button>
                            <button
                                className="rematch-options__btn"
                                onClick={() => handleRunMatching({ rematch_mode: 'keep_manual' })}
                            >
                                <strong>{t('rematchKeepManual')}</strong>
                                <span>{t('rematchKeepManualHint')}</span>
                            </button>
                            <button
                                className="rematch-options__btn rematch-options__btn--selective"
                                onClick={handleOpenRematchModal}
                            >
                                <strong>{t('rematchSelectiveBtn')}</strong>
                                <span>{t('rematchSelectiveHint')}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Selective Re-match Modal */}
            {showRematchModal && (
                <RematchModal
                    transactions={rematchTxs}
                    matching={matching}
                    onRematch={handleRematch}
                    onClose={() => setShowRematchModal(false)}
                />
            )}

            {/* Unlink Confirm Modal */}
            <ConfirmModal
                isOpen={!!unlinkMatchId}
                title={t('unlinkButton')}
                message={t('unlinkConfirm')}
                confirmLabel={t('unlinkButton')}
                cancelLabel={t('closeButton')}
                variant="danger"
                onConfirm={handleUnlinkConfirm}
                onCancel={() => setUnlinkMatchId(null)}
            />
        </div>
    );
};

export default MatchingPanel;
