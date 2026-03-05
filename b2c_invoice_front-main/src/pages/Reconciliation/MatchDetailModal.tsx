/**
 * Match Detail Modal — Multi-document version.
 * Left panel: transaction info + clickable document cards (or empty state).
 * Right panel: selected document preview (PDF/image).
 * Works for both matched and unmatched transactions.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useLang } from '../../shared/i18n';
import { ReconciliationMatch, UnifiedTransaction } from '../../services/reconciliationApi';
import { fmtCurrency, getConfidenceLevel, getMatchScore, getMatches } from './matchingPanelUtils';
import DocPreview from './DocPreview';
import ConfirmModal from '../../components/common/ConfirmModal';
import './MatchDetailModal.scss';

interface MatchDetailModalProps {
    transaction: UnifiedTransaction;
    onUnlink: (matchId: string) => void;
    onLink: (tx: UnifiedTransaction) => void;
    onClose: () => void;
}

const MatchDetailModal: React.FC<MatchDetailModalProps> = ({
    transaction, onUnlink, onLink, onClose,
}) => {
    const { t } = useLang();
    const matches = getMatches(transaction);
    const [selectedIdx, setSelectedIdx] = useState(0);
    const [unlinkMatchId, setUnlinkMatchId] = useState<string | null>(null);
    const currency = transaction.currency || 'TRY';

    // Bounds-check selectedIdx when matches change
    useEffect(() => {
        if (matches.length > 0 && selectedIdx >= matches.length) {
            setSelectedIdx(Math.max(0, matches.length - 1));
        }
    }, [matches.length, selectedIdx]);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const handleOverlayClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) onClose();
    }, [onClose]);

    const selectedMatch: ReconciliationMatch | undefined = matches[selectedIdx] || matches[0];
    const isCredit = transaction.type === 'credit';
    const hasMatches = matches.length > 0;

    const statusLabelMap: Record<string, string> = {
        confirmed: t('statusConfirmed'),
    };

    return (
        <div className="match-detail-overlay" onClick={handleOverlayClick}>
            <div className="match-detail">
                {/* Header */}
                <div className="match-detail__header">
                    <h3 className="match-detail__title">{t('matchDetailTitle')}</h3>
                    <button className="match-detail__close" onClick={onClose}>&times;</button>
                </div>

                {/* Body: split screen */}
                <div className="match-detail__body">
                    {/* Left: Transaction info + document cards */}
                    <div className="match-detail__left">
                        <h4 className="match-detail__section-title">{t('transactionInfo')}</h4>

                        <div className="match-detail__field">
                            <span className="match-detail__label">{t('bankName')}</span>
                            <span className="match-detail__value">{transaction.bank_name || '-'}</span>
                        </div>
                        <div className="match-detail__field">
                            <span className="match-detail__label">{t('colDate')}</span>
                            <span className="match-detail__value">{transaction.date || '-'}</span>
                        </div>
                        <div className="match-detail__field">
                            <span className="match-detail__label">{t('colDescription')}</span>
                            <span className="match-detail__value match-detail__value--desc">
                                {transaction.description || '-'}
                            </span>
                        </div>
                        <div className="match-detail__field">
                            <span className="match-detail__label">{t('colAmount')}</span>
                            <span className="match-detail__amount">
                                {fmtCurrency(Math.abs(transaction.amount), currency)}
                            </span>
                        </div>
                        <div className="match-detail__field">
                            <span className="match-detail__label">{t('colType')}</span>
                            <span className={`matching-type-badge matching-type-badge--${isCredit ? 'credit' : 'debit'}`}>
                                {isCredit ? t('credit') : t('debit')}
                            </span>
                        </div>

                        <div className="match-detail__divider" />

                        {/* Document cards list */}
                        <h4 className="match-detail__section-title">{t('linkedDocuments')}</h4>
                        {hasMatches ? (
                            <div className="match-detail__doc-cards">
                                {matches.map((m, idx) => {
                                    const score = getMatchScore(m);
                                    const level = getConfidenceLevel(score);
                                    const isActive = idx === selectedIdx;
                                    const isManual = m.status === 'manual';

                                    return (
                                        <div
                                            key={m._id}
                                            className={`match-detail__doc-card${isActive ? ' match-detail__doc-card--active' : ''}`}
                                            onClick={() => setSelectedIdx(idx)}
                                        >
                                            <div className="match-detail__doc-card-main">
                                                {!isManual && (
                                                    <span className={`matching-confidence-dot matching-confidence-dot--${level}`} />
                                                )}
                                                <div className="match-detail__doc-card-info">
                                                    <span className="match-detail__doc-card-filename" title={m.document_ref.filename}>
                                                        {m.document_ref.filename}
                                                    </span>
                                                    <span className="match-detail__doc-card-meta">
                                                        {m.document_ref.vendor_name && `${m.document_ref.vendor_name} · `}
                                                        {fmtCurrency(m.document_ref.amount, currency)}
                                                    </span>
                                                </div>
                                                <div className="match-detail__doc-card-badges">
                                                    {!isManual && (
                                                        <span className={`matching-confidence matching-confidence--${level}`}>
                                                            {Math.round(score * 100)}%
                                                        </span>
                                                    )}
                                                    <span className={`matching-status-badge matching-status-badge--${m.status}`}>
                                                        {statusLabelMap[m.status] || m.status}
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                className="match-detail__doc-card-remove"
                                                onClick={(e) => { e.stopPropagation(); setUnlinkMatchId(m._id); }}
                                                title={t('unlinkButton')}
                                            >
                                                &times;
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="match-detail__empty-docs">
                                <p>{t('noMatch')}</p>
                            </div>
                        )}

                        {selectedMatch?.score.ai_reason && (
                            <div className="match-detail__ai-reason">
                                <span className="match-detail__label">AI</span>
                                <p className="match-detail__ai-text">{selectedMatch.score.ai_reason}</p>
                            </div>
                        )}
                    </div>

                    {/* Right: Document preview */}
                    <div className="match-detail__right">
                        {selectedMatch ? (
                            <>
                                <h4 className="match-detail__section-title">{t('linkedDocument')}</h4>

                                <div className="match-detail__doc-meta">
                                    <div className="match-detail__doc-meta-row">
                                        <span className="match-detail__label">{t('colFilename')}</span>
                                        <span className="match-detail__value" title={selectedMatch.document_ref.filename}>
                                            {selectedMatch.document_ref.filename}
                                        </span>
                                    </div>
                                    {selectedMatch.document_ref.vendor_name && (
                                        <div className="match-detail__doc-meta-row">
                                            <span className="match-detail__label">{t('vendorName')}</span>
                                            <span className="match-detail__value">{selectedMatch.document_ref.vendor_name}</span>
                                        </div>
                                    )}
                                    <div className="match-detail__doc-meta-row">
                                        <span className="match-detail__label">{t('colDate')}</span>
                                        <span className="match-detail__value">{selectedMatch.document_ref.date || '-'}</span>
                                    </div>
                                    <div className="match-detail__doc-meta-row">
                                        <span className="match-detail__label">{t('colAmount')}</span>
                                        <span className="match-detail__value">{fmtCurrency(selectedMatch.document_ref.amount, currency)}</span>
                                    </div>
                                </div>

                                <div className="match-detail__preview">
                                    <DocPreview
                                        key={selectedMatch.document_ref.document_id}
                                        documentId={selectedMatch.document_ref.document_id}
                                        filename={selectedMatch.document_ref.filename}
                                    />
                                </div>
                            </>
                        ) : (
                            <>
                                <h4 className="match-detail__section-title">{t('bankStatementPreview')}</h4>
                                <div className="match-detail__preview">
                                    <DocPreview
                                        key={transaction.statement_id}
                                        documentId={transaction.statement_id}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="match-detail__footer">
                    <button
                        className="match-detail__btn match-detail__btn--link"
                        onClick={() => onLink(transaction)}
                    >
                        {hasMatches ? t('linkMore') : t('linkButton')}
                    </button>
                    <div className="match-detail__footer-spacer" />
                    <button
                        className="match-detail__btn match-detail__btn--close"
                        onClick={onClose}
                    >
                        {t('closeButton')}
                    </button>
                </div>

                {/* Unlink Confirm Modal */}
                <ConfirmModal
                    isOpen={!!unlinkMatchId}
                    title={t('unlinkButton')}
                    message={t('unlinkConfirm')}
                    confirmLabel={t('unlinkButton')}
                    cancelLabel={t('closeButton')}
                    variant="danger"
                    onConfirm={() => {
                        if (unlinkMatchId) {
                            onUnlink(unlinkMatchId);
                            setUnlinkMatchId(null);
                        }
                    }}
                    onCancel={() => setUnlinkMatchId(null)}
                />
            </div>
        </div>
    );
};

export default MatchDetailModal;
