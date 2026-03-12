/**
 * TransactionRow — single <tr> for the MatchingPanel table.
 * Always clickable (opens detail modal). Shows primary filename + "+N" badge for multi-link.
 * Hides confidence badge for manual matches.
 */
import React from 'react';
import { useLang } from '../../shared/i18n';
import { ReconciliationMatch, UnifiedTransaction } from '../../services/reconciliationApi';
import {
    fmtCurrency,
    getConfidenceLevel,
    getMatchScore,
    getMatches,
} from './matchingPanelUtils';

interface TransactionRowProps {
    tx: UnifiedTransaction;
    onOpenDetail: (tx: UnifiedTransaction) => void;
    onLink: (tx: UnifiedTransaction) => void;
    onUnlink: (matchId: string) => void;
    onClearStale?: (matchId: string) => void;
}

const TransactionRow: React.FC<TransactionRowProps> = ({
    tx, onOpenDetail, onLink, onUnlink, onClearStale,
}) => {
    const { t } = useLang();
    const matches = getMatches(tx);
    const matched = matches.length > 0;
    const isCredit = tx.type === 'credit';
    const currency = tx.currency || 'TRY';

    // Use first match for score / status display
    const primaryMatch: ReconciliationMatch | undefined = matches[0];
    const score = primaryMatch ? getMatchScore(primaryMatch) : 0;
    const level = matched ? getConfidenceLevel(score) : undefined;
    const isStale = primaryMatch && (primaryMatch as any).stale === true;
    const staleReason = isStale ? (primaryMatch as any).stale_reason : undefined;

    const renderConfidenceBadge = (s: number) => {
        const l = getConfidenceLevel(s);
        return (
            <span className={`matching-confidence matching-confidence--${l}`}>
                {Math.round(s * 100)}%
            </span>
        );
    };

    return (
        <tr
            className={`matching-row matching-row--${matched ? 'matched' : 'unmatched'}${isStale ? ' matching-row--stale' : ''} matching-row--clickable`}
            onClick={() => onOpenDetail(tx)}
            style={{ cursor: 'pointer' }}
        >
            <td className="matching-col--date">{tx.date || '-'}</td>
            <td className="matching-col--desc" title={tx.description}>
                {tx.description || '-'}
            </td>
            <td className="matching-col--type">
                <span className={`matching-type-badge matching-type-badge--${isCredit ? 'credit' : 'debit'}`}>
                    {isCredit ? t('credit') : t('debit')}
                </span>
            </td>
            <td className="matching-col--amount matching-col--divider">
                {fmtCurrency(Math.abs(tx.amount), currency)}
            </td>
            <td className="matching-col--doc">
                {matched ? (
                    <>
                        <span className="matching-doc-match">
                            {primaryMatch!.status !== 'manual' && (
                                <span className={`matching-confidence-dot matching-confidence-dot--${level}`} />
                            )}
                            <span className="matching-doc-badge" title={primaryMatch!.document_ref.filename}>
                                {primaryMatch!.document_ref.filename}
                            </span>
                            {matches.length > 1 && (
                                <span className="matching-doc-count">+{matches.length - 1}</span>
                            )}
                        </span>
                        {isStale && staleReason && (
                            <div className="matching-stale-warning" title={staleReason}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                    <line x1="12" y1="9" x2="12" y2="13" />
                                    <line x1="12" y1="17" x2="12.01" y2="17" />
                                </svg>
                                <span className="matching-stale-warning__text">{staleReason}</span>
                                {onClearStale && (
                                    <button
                                        className="matching-stale-warning__dismiss"
                                        onClick={e => {
                                            e.stopPropagation();
                                            onClearStale(primaryMatch!._id);
                                        }}
                                        title={t('dismissStale') || 'Dismiss'}
                                    >
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    <span className="matching-no-match">{t('noMatch')}</span>
                )}
            </td>
            <td className="matching-col--status">
                {matched ? (
                    renderConfidenceBadge(score)
                ) : (
                    <span className="matching-no-match">-</span>
                )}
            </td>
            <td className="matching-col--actions" onClick={e => e.stopPropagation()}>
                {matched ? (
                    <div className="matching-row__actions">
                        <button
                            className="matching-row__link-btn matching-row__link-btn--small"
                            onClick={() => onLink(tx)}
                            title={t('linkMore')}
                        >
                            +
                        </button>
                        <button
                            className="matching-row__delete-btn"
                            onClick={() => onUnlink(primaryMatch!._id)}
                            title={t('unlinkButton')}
                        >
                            &times;
                        </button>
                    </div>
                ) : (
                    <button
                        className="matching-row__link-btn"
                        onClick={() => onLink(tx)}
                    >
                        {t('linkButton')}
                    </button>
                )}
            </td>
        </tr>
    );
};

export default TransactionRow;
