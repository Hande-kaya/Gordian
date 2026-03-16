/**
 * TransactionRow — Single unified row for the matching panel table.
 * Renders all columns in one <tr> with a spacer <td> between bank and match halves.
 * Left half:  Date | Description | Amount
 * Right half: Match filename | Vendor | Doc Amount | Doc Date | Confidence | Actions
 */
import React from 'react';
import { useLang } from '../../shared/i18n';
import { useDateFormat } from '../../context/DateFormatContext';
import { ReconciliationMatch, UnifiedTransaction } from '../../services/reconciliationApi';
import {
    fmtCurrency,
    getConfidenceLevel,
    getMatchScore,
    getMatches,
} from './matchingPanelUtils';

export interface TransactionRowProps {
    tx: UnifiedTransaction;
    onOpenDetail: (tx: UnifiedTransaction) => void;
    onLink: (tx: UnifiedTransaction) => void;
    onUnlink: (matchId: string) => void;
    onClearStale?: (matchId: string) => void;
}

function getRowClass(tx: UnifiedTransaction) {
    const matches = getMatches(tx);
    const matched = matches.length > 0;
    const isStale = matched && matches[0].stale === true;
    let cls = `matching-row matching-row--${matched ? 'matched' : 'unmatched'}`;
    if (isStale) cls += ' matching-row--stale';
    cls += ' matching-row--clickable';
    return cls;
}

const TransactionRow: React.FC<TransactionRowProps> = ({
    tx, onOpenDetail, onLink, onUnlink, onClearStale,
}) => {
    const { t } = useLang();
    const { fmtDate } = useDateFormat();
    const isCredit = tx.type === 'credit';
    const currency = tx.currency || 'TRY';
    const matches = getMatches(tx);
    const matched = matches.length > 0;
    const primaryMatch: ReconciliationMatch | undefined = matches[0];
    const score = primaryMatch ? getMatchScore(primaryMatch) : 0;
    const level = matched ? getConfidenceLevel(score) : undefined;
    const isStale = matched && primaryMatch?.stale === true;
    const staleReason = primaryMatch?.stale_reason;

    return (
        <tr
            className={getRowClass(tx)}
            onClick={() => onOpenDetail(tx)}
        >
            {/* === LEFT HALF: Bank Transaction === */}
            <td className="matching-col--date mcell mcell--left-first">{fmtDate(tx.date)}</td>
            <td className="matching-col--desc mcell" title={tx.description}>
                {tx.description || '-'}
            </td>
            <td className={`matching-col--amount matching-col--amount-${isCredit ? 'credit' : 'debit'} mcell mcell--left-last`}>
                {isCredit ? '+' : '-'}{fmtCurrency(Math.abs(tx.amount), currency)}
            </td>

            {/* === SPACER === */}
            <td className="mcell--spacer" />

            {/* === RIGHT HALF: Match Details === */}
            {/* Doc filename */}
            <td className="matching-col--doc mcell mcell--right-first">
                {matched ? (
                    <div className="matching-doc-match-wrap">
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
                        {isStale && (
                            <span className="matching-stale-warning" onClick={e => e.stopPropagation()}>
                                <span className="matching-stale-warning__text" title={staleReason || ''}>
                                    {t('staleWarning')}
                                    {staleReason && (
                                        <span className="matching-stale-warning__reason">
                                            {' '}({staleReason})
                                        </span>
                                    )}
                                </span>
                                {onClearStale && (
                                    <button
                                        className="matching-stale-warning__dismiss"
                                        onClick={() => onClearStale(primaryMatch!._id)}
                                        title={t('staleDismiss')}
                                    >
                                        ✓
                                    </button>
                                )}
                            </span>
                        )}
                    </div>
                ) : (
                    <span className="matching-no-match">{t('noMatch')}</span>
                )}
            </td>

            {/* Vendor */}
            <td className="matching-col--vendor mcell">
                {matched && primaryMatch!.document_ref.vendor_name ? (
                    <span title={primaryMatch!.document_ref.vendor_name} className="matching-col--vendor-text">
                        {primaryMatch!.document_ref.vendor_name}
                    </span>
                ) : (
                    <span className="matching-no-match">-</span>
                )}
            </td>

            {/* Doc Amount */}
            <td className="matching-col--doc-amount mcell">
                {matched && primaryMatch!.document_ref.amount != null ? (
                    fmtCurrency(primaryMatch!.document_ref.amount, currency)
                ) : (
                    <span className="matching-no-match">-</span>
                )}
            </td>

            {/* Doc Date */}
            <td className="matching-col--doc-date mcell">
                {matched && primaryMatch!.document_ref.date ? (
                    fmtDate(primaryMatch!.document_ref.date)
                ) : (
                    <span className="matching-no-match">-</span>
                )}
            </td>

            {/* Confidence */}
            <td className="matching-col--status mcell">
                {matched ? (
                    <span className={`matching-confidence matching-confidence--${getConfidenceLevel(score)}`}>
                        {Math.round(score * 100)}%
                    </span>
                ) : (
                    <span className="matching-no-match">-</span>
                )}
            </td>

            {/* Actions */}
            <td className="matching-col--actions mcell mcell--right-last" onClick={e => e.stopPropagation()}>
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
