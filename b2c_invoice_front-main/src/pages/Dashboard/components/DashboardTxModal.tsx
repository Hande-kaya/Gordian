/**
 * DashboardTxModal — Read-only transaction detail modal for Dashboard.
 * Matched: bank statement PDF (left) + matched document PDF (right) side-by-side.
 * Unmatched: bank statement PDF full-width.
 * Bottom: transaction info + match details (if any).
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useLang } from '../../../shared/i18n';
import { UnifiedTransaction } from '../../../services/reconciliationApi';
import {
    fmtCurrency, getMatches, getMatchScore, getConfidenceLevel,
} from '../../Reconciliation/matchingPanelUtils';
import DocPreview from '../../Reconciliation/DocPreview';
import './DashboardTxModal.scss';

/* SVG circular progress score (0–100) */
const CR = 15, CC = 2 * Math.PI * CR;
const ScoreCircle: React.FC<{ score: number; level: string }> = ({ score, level }) => (
    <div className={`dash-tx-modal__score-circle dash-tx-modal__score-circle--${level}`}>
        <svg viewBox="0 0 36 36" width="36" height="36">
            <circle className="dash-tx-modal__score-bg" cx="18" cy="18" r={CR} />
            <circle className="dash-tx-modal__score-fg" cx="18" cy="18" r={CR}
                strokeDasharray={CC} strokeDashoffset={CC * (1 - score / 100)}
                transform="rotate(-90 18 18)" />
        </svg>
        <span className="dash-tx-modal__score-val">{score}</span>
    </div>
);

interface DashboardTxModalProps {
    transaction: UnifiedTransaction;
    onClose: () => void;
}

const DashboardTxModal: React.FC<DashboardTxModalProps> = ({ transaction, onClose }) => {
    const { t } = useLang();
    const matches = getMatches(transaction);
    const hasMatches = matches.length > 0;
    const currency = transaction.currency || 'TRY';
    const txAmount = Math.abs(transaction.amount);
    const isCredit = transaction.type === 'credit';

    const [selectedIdx, setSelectedIdx] = useState(0);
    const selectedMatch = matches[selectedIdx] ?? null;

    const matchPct = selectedMatch ? Math.round(getMatchScore(selectedMatch) * 100) : 0;
    const matchLevel = selectedMatch ? getConfidenceLevel(getMatchScore(selectedMatch)) : 'low';

    // Bank statement highlight
    const stmtPage = transaction.page != null ? transaction.page + 1 : undefined;
    const stmtHighlightY = (transaction.y_min != null && transaction.y_max != null)
        ? [transaction.y_min, transaction.y_max] as [number, number] : undefined;

    // Escape key closes modal
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    // Overlay click closes modal
    const handleOverlayClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
    }, [onClose]);

    return (
        <div className="dash-tx-modal-overlay" onClick={handleOverlayClick}>
            <div className="dash-tx-modal">
                {/* Header */}
                <div className="dash-tx-modal__header">
                    <h3 className="dash-tx-modal__title">
                        {hasMatches ? t('matchDetailTitle') : t('bankTxDetail')}
                    </h3>
                    <button className="dash-tx-modal__close" onClick={onClose}>&times;</button>
                </div>

                {/* PDF Preview Section */}
                <div className={`dash-tx-modal__pdfs${hasMatches ? '' : ' dash-tx-modal__pdfs--single'}`}>
                    {/* Bank Statement */}
                    <div className="dash-tx-modal__pdf-cell">
                        <div className="dash-tx-modal__pdf-label">{t('bankStatementPreview')}</div>
                        <div className="dash-tx-modal__pdf-content">
                            <DocPreview
                                documentId={transaction.statement_id}
                                initialPage={stmtPage}
                                highlightY={stmtHighlightY}
                            />
                        </div>
                    </div>

                    {/* Matched Document */}
                    {hasMatches && selectedMatch && (
                        <div className="dash-tx-modal__pdf-cell">
                            <div className="dash-tx-modal__pdf-label">
                                {t('bankMatchedDocument')}
                            </div>
                            <div className="dash-tx-modal__pdf-content">
                                <DocPreview
                                    key={selectedMatch.document_ref.document_id}
                                    documentId={selectedMatch.document_ref.document_id}
                                    filename={selectedMatch.document_ref.filename}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Info Section */}
                <div className="dash-tx-modal__info">
                    {/* Transaction details */}
                    <div className="dash-tx-modal__tx-details">
                        <div className="dash-tx-modal__field">
                            <span className="dash-tx-modal__label">{t('colDate')}</span>
                            <span className="dash-tx-modal__value">{transaction.date || '-'}</span>
                        </div>
                        <div className="dash-tx-modal__field">
                            <span className="dash-tx-modal__label">{t('colDescription')}</span>
                            <span className="dash-tx-modal__value dash-tx-modal__value--desc">
                                {transaction.description || '-'}
                            </span>
                        </div>
                        <div className="dash-tx-modal__field">
                            <span className="dash-tx-modal__label">{t('colAmount')}</span>
                            <span className="dash-tx-modal__amount">{fmtCurrency(txAmount, currency)}</span>
                        </div>
                        <div className="dash-tx-modal__field">
                            <span className="dash-tx-modal__label">{t('colType')}</span>
                            <span className={`dashboard__match-type dashboard__match-type--${isCredit ? 'credit' : 'debit'}`}>
                                {isCredit ? t('credit') : t('debit')}
                            </span>
                        </div>
                    </div>

                    {/* Match info or no-match message */}
                    {hasMatches && selectedMatch ? (
                        <div className="dash-tx-modal__match-info">
                            <div className="dash-tx-modal__match-header">
                                <ScoreCircle score={matchPct} level={matchLevel} />
                                <div className="dash-tx-modal__match-meta">
                                    <span className="dash-tx-modal__match-source">
                                        {selectedMatch.source === 'manual' ? t('statusManual') : 'AI'}
                                    </span>
                                    <span className="dash-tx-modal__match-filename" title={selectedMatch.document_ref?.filename}>
                                        {selectedMatch.document_ref?.filename}
                                    </span>
                                    {selectedMatch.document_ref?.vendor_name && (
                                        <span className="dash-tx-modal__match-vendor">
                                            {selectedMatch.document_ref.vendor_name}
                                        </span>
                                    )}
                                    {selectedMatch.document_ref?.amount != null && (
                                        <span className="dash-tx-modal__match-amount">
                                            {fmtCurrency(Math.abs(selectedMatch.document_ref.amount), currency)}
                                        </span>
                                    )}
                                </div>
                            </div>
                            {selectedMatch.score.ai_reason && (
                                <p className="dash-tx-modal__ai-reason">{selectedMatch.score.ai_reason}</p>
                            )}

                            {/* Match tabs if multiple matches */}
                            {matches.length > 1 && (
                                <div className="dash-tx-modal__match-tabs">
                                    {matches.map((m, idx) => (
                                        <button
                                            key={m._id}
                                            className={`dash-tx-modal__match-tab${idx === selectedIdx ? ' dash-tx-modal__match-tab--active' : ''}`}
                                            onClick={() => setSelectedIdx(idx)}
                                        >
                                            {m.document_ref?.vendor_name || m.document_ref?.filename || `Match ${idx + 1}`}
                                            <span className="dash-tx-modal__match-tab-score">
                                                {Math.round(getMatchScore(m) * 100)}%
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="dash-tx-modal__no-match">
                            {t('bankNoMatchFound')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DashboardTxModal;
