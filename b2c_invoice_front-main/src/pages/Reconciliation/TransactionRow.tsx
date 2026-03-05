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
}

const TransactionRow: React.FC<TransactionRowProps> = ({
    tx, onOpenDetail, onLink, onUnlink,
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
            className={`matching-row matching-row--${matched ? 'matched' : 'unmatched'} matching-row--clickable`}
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
