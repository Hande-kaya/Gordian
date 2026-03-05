/**
 * Matching Panel — unified transaction list with inline actions + detail modal.
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
    RunMatchingParams,
} from '../../services/reconciliationApi';
import TransactionRow from './TransactionRow';
import TransactionModal from './TransactionModal';
import RematchModal from './RematchModal';
import ConfirmModal from '../../components/common/ConfirmModal';
import { useMatchingStatus } from './useMatchingStatus';
import './MatchingPanel.scss';

interface MatchingPanelProps {
    hasBankTransactions: boolean;
    expenses: DocumentItem[];
    incomes: DocumentItem[];
    onMatchingComplete?: () => void;
}

const PAGE_SIZE = 50;
type FilterStatus = 'all' | 'matched' | 'unmatched';

const MatchingPanel: React.FC<MatchingPanelProps> = ({
    hasBankTransactions, expenses, incomes, onMatchingComplete,
}) => {
    const { t, lang } = useLang();

    const [transactions, setTransactions] = useState<UnifiedTransaction[]>([]);
    const [total, setTotal] = useState(0);
    const [summary, setSummary] = useState({ total: 0, matched: 0, unmatched: 0 });
    const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
    const [page, setPage] = useState(1);
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

    // Draggable column divider (default 50% = aligned with upload panels)
    const [splitPct, setSplitPct] = useState(50);
    const draggingRef = useRef(false);
    const tableWrapRef = useRef<HTMLDivElement>(null);

    const fetchTransactions = useCallback(async (p = 1, filter: FilterStatus = 'all') => {
        setLoading(true);
        try {
            const res = await getTransactions(p, PAGE_SIZE, filter);
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
            fetchTransactions(1, filterStatus);
            onMatchingComplete?.();
        }, [fetchTransactions, filterStatus, onMatchingComplete]),
    });

    useEffect(() => {
        fetchTransactions(page, filterStatus);
    }, [fetchTransactions, page, filterStatus]);

    const handleRunMatching = useCallback(async (params: RunMatchingParams = {}) => {
        setMatching(true);
        setError(null);
        setShowRematchOptions(false);
        setShowRematchModal(false);
        try {
            const res = await runMatching({ ...params, language: lang });
            if (res.success) {
                setPage(1);
                await fetchTransactions(1, filterStatus);
                onMatchingComplete?.();
                setMatching(false);
            } else {
                // Already in progress on another tab/session — start polling
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
    }, [fetchTransactions, filterStatus, onMatchingComplete, t, lang, startPolling]);

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
            await fetchTransactions(page, filterStatus);
        }
    }, [unlinkMatchId, fetchTransactions, page, filterStatus]);

    const handleLinkInModal = useCallback(async (documentId: string): Promise<boolean> => {
        if (!detailTx) return false;
        const res = await createManualMatch(
            detailTx.statement_id, detailTx.tx_index, documentId,
        );
        if (res.success) {
            await fetchTransactions(page, filterStatus);
            // Refresh detailTx with updated matches
            const refreshRes = await getTransactions(page, PAGE_SIZE, filterStatus);
            if (refreshRes.success && refreshRes.data) {
                const updated = refreshRes.data.transactions.find(
                    t => t.statement_id === detailTx.statement_id && t.tx_index === detailTx.tx_index,
                );
                if (updated) setDetailTx(updated);
            }
            return true;
        }
        return false;
    }, [detailTx, fetchTransactions, page, filterStatus]);

    const handleFilterChange = useCallback((f: FilterStatus) => {
        setFilterStatus(f);
        setPage(1);
    }, []);

    // Divider drag handlers
    const handleDividerDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        draggingRef.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, []);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!draggingRef.current || !tableWrapRef.current) return;
            const rect = tableWrapRef.current.getBoundingClientRect();
            const pct = ((e.clientX - rect.left) / rect.width) * 100;
            setSplitPct(Math.min(70, Math.max(30, pct)));
        };
        const onUp = () => {
            if (draggingRef.current) {
                draggingRef.current = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
    }, []);

    const colWidths = useMemo(() => {
        const L = splitPct;
        const R = 100 - splitPct;
        return [
            `${L * 0.18}%`, `${L * 0.44}%`, `${L * 0.14}%`, `${L * 0.24}%`,
            `${R * 0.50}%`, `${R * 0.28}%`, `${R * 0.22}%`,
        ];
    }, [splitPct]);

    const handleUnlinkInModal = useCallback(async (matchId: string) => {
        const res = await deleteMatch(matchId);
        if (res.success) {
            await fetchTransactions(page, filterStatus);
            if (detailTx) {
                const refreshRes = await getTransactions(page, PAGE_SIZE, filterStatus);
                if (refreshRes.success && refreshRes.data) {
                    const updated = refreshRes.data.transactions.find(
                        t => t.statement_id === detailTx.statement_id && t.tx_index === detailTx.tx_index,
                    );
                    setDetailTx(updated || null);
                }
            }
        }
    }, [fetchTransactions, page, filterStatus, detailTx]);

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

    const filteredTransactions = useMemo(() => {
        if (!searchQuery.trim()) return transactions;
        const q = searchQuery.toLowerCase().trim();
        return transactions.filter(tx =>
            (tx.description || '').toLowerCase().includes(q) ||
            (tx.bank_name || '').toLowerCase().includes(q) ||
            (tx.date || '').includes(q) ||
            (tx.matches || []).some(m =>
                (m.document_ref?.filename || '').toLowerCase().includes(q) ||
                (m.document_ref?.vendor_name || '').toLowerCase().includes(q)
            )
        );
    }, [transactions, searchQuery]);

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const hasExisting = summary.matched > 0;
    const buttonLabel = hasExisting ? t('rematchButton') : t('matchButton');

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
            <div className="matching-panel__header">
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

            {/* Filter tabs */}
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

            {loading && !loaded ? (
                <div className="matching-panel__loading">
                    <div className="reconciliation-page__spinner" />
                </div>
            ) : transactions.length === 0 && loaded ? (
                <div className="matching-panel__empty-state">
                    <p className="matching-panel__empty-text">{t('noMatchesYet')}</p>
                    <p className="matching-panel__empty-hint">{t('noMatchesHint')}</p>
                </div>
            ) : (
                <>
                    <div className="matching-panel__table-wrap" ref={tableWrapRef}>
                        <div
                            className="matching-panel__divider"
                            style={{ left: `${splitPct}%` }}
                            onMouseDown={handleDividerDown}
                            onDoubleClick={() => setSplitPct(50)}
                        />
                        <table className="matching-panel__table" style={{ tableLayout: 'fixed' }}>
                            <colgroup>
                                {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
                            </colgroup>
                            <thead>
                                <tr>
                                    <th className="matching-col--date">{t('colDate')}</th>
                                    <th className="matching-col--desc">{t('colDescription')}</th>
                                    <th className="matching-col--type">{t('colType')}</th>
                                    <th className="matching-col--amount matching-col--divider">{t('colAmount')}</th>
                                    <th className="matching-col--doc">{t('colMatch')}</th>
                                    <th className="matching-col--status">{t('colConfidence')}</th>
                                    <th className="matching-col--actions"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTransactions.map(tx => (
                                    <TransactionRow
                                        key={`${tx.statement_id}-${tx.tx_index}`}
                                        tx={tx}
                                        onOpenDetail={setDetailTx}
                                        onLink={setDetailTx}
                                        onUnlink={handleUnlinkRequest}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="matching-panel__pagination">
                            <button
                                className="matching-panel__page-btn"
                                disabled={page <= 1}
                                onClick={() => setPage(p => p - 1)}
                            >
                                &laquo; {t('prevPage') || 'Prev'}
                            </button>
                            <span className="matching-panel__page-info">
                                {page} / {totalPages}
                            </span>
                            <button
                                className="matching-panel__page-btn"
                                disabled={page >= totalPages}
                                onClick={() => setPage(p => p + 1)}
                            >
                                {t('nextPage') || 'Next'} &raquo;
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Unified Transaction Modal (detail + picker) */}
            {detailTx && (
                <TransactionModal
                    transaction={detailTx}
                    expenses={expenses}
                    incomes={incomes}
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
