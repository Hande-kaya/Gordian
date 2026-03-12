/**
 * BankPieChartsGrid - Two pie charts side by side:
 * 1. Bank Breakdown (by bank name)
 * 2. Match Status (matched vs unmatched)
 *
 * Clicking a match status slice shows a detail table below.
 */

import React, { useState, useMemo } from 'react';
import CategoryPieChart, { PieSlice } from './CategoryPieChart';
import { UnifiedTransaction } from '../../../services/reconciliationApi';
import { useLang } from '../../../shared/i18n';

interface BankPieChartsGridProps {
    bankBreakdown: PieSlice[];
    matchStatus: PieSlice[];
    transactions: UnifiedTransaction[];
    displayCurrency: string;
    loading?: boolean;
}

const formatAmount = (value: number, currency: string): string =>
    value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;

const BankPieChartsGrid: React.FC<BankPieChartsGridProps> = ({
    bankBreakdown,
    matchStatus,
    transactions,
    displayCurrency,
    loading,
}) => {
    const { t } = useLang();
    const [matchFilter, setMatchFilter] = useState<'matched' | 'unmatched' | null>(null);

    const filteredTxs = useMemo(() => {
        if (!matchFilter) return [];
        return transactions.filter(tx =>
            matchFilter === 'matched'
                ? tx.matches && tx.matches.length > 0
                : !tx.matches || tx.matches.length === 0
        );
    }, [transactions, matchFilter]);

    const handleMatchStatusClick = (filter: 'matched' | 'unmatched') => {
        setMatchFilter(prev => prev === filter ? null : filter);
    };

    if (loading) {
        return (
            <div className="dashboard__bank-pies">
                <div className="dashboard__section">
                    <h3 className="dashboard__section-title">{t('bankByBank')}</h3>
                    <div className="dashboard__chart-placeholder">{t('loadingData')}</div>
                </div>
                <div className="dashboard__section">
                    <h3 className="dashboard__section-title">{t('bankMatchStatus')}</h3>
                    <div className="dashboard__chart-placeholder">{t('loadingData')}</div>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="dashboard__bank-pies">
                <div className="dashboard__section">
                    <h3 className="dashboard__section-title">{t('bankByBank')}</h3>
                    {bankBreakdown.length > 0 ? (
                        <CategoryPieChart data={bankBreakdown} displayCurrency={displayCurrency} />
                    ) : (
                        <div className="dashboard__chart-placeholder">{t('bankNoData')}</div>
                    )}
                </div>
                <div className="dashboard__section">
                    <h3 className="dashboard__section-title">{t('bankMatchStatus')}</h3>
                    {matchStatus.length > 0 ? (
                        <>
                            <CategoryPieChart data={matchStatus} displayCurrency={displayCurrency} />
                            <div className="dashboard__match-toggle-row">
                                <button
                                    className={`dashboard__match-toggle-btn dashboard__match-toggle-btn--matched ${matchFilter === 'matched' ? 'dashboard__match-toggle-btn--active' : ''}`}
                                    onClick={() => handleMatchStatusClick('matched')}
                                >
                                    {t('bankMatched')} ({matchStatus[0]?.value ?? 0})
                                </button>
                                <button
                                    className={`dashboard__match-toggle-btn dashboard__match-toggle-btn--unmatched ${matchFilter === 'unmatched' ? 'dashboard__match-toggle-btn--active' : ''}`}
                                    onClick={() => handleMatchStatusClick('unmatched')}
                                >
                                    {t('bankUnmatched')} ({matchStatus[1]?.value ?? 0})
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="dashboard__chart-placeholder">{t('bankNoData')}</div>
                    )}
                </div>
            </div>

            {/* Match detail table */}
            {matchFilter && filteredTxs.length > 0 && (
                <div className="dashboard__section">
                    <div className="dashboard__section-header">
                        <h3 className="dashboard__section-title">
                            {matchFilter === 'matched' ? t('bankMatched') : t('bankUnmatched')}
                            {' '}({filteredTxs.length})
                        </h3>
                        <button
                            className="dashboard__match-close-btn"
                            onClick={() => setMatchFilter(null)}
                        >
                            ✕
                        </button>
                    </div>
                    <div className="dashboard__match-table-wrap">
                        <table className="dashboard__match-table">
                            <thead>
                                <tr>
                                    <th>{t('periodFrom').replace(':', '')}</th>
                                    <th>{t('bankByBank')}</th>
                                    <th className="dashboard__match-table--desc">Description</th>
                                    <th className="dashboard__match-table--right">Amount</th>
                                    <th>Type</th>
                                    {matchFilter === 'matched' && <th>Match</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTxs.slice(0, 50).map((tx, i) => (
                                    <tr key={`${tx.statement_id}-${tx.tx_index}-${i}`}>
                                        <td className="dashboard__match-table--nowrap">{tx.date}</td>
                                        <td className="dashboard__match-table--nowrap">{tx.bank_name || '—'}</td>
                                        <td className="dashboard__match-table--desc" title={tx.description}>
                                            {tx.description?.length > 60
                                                ? tx.description.substring(0, 60) + '…'
                                                : tx.description}
                                        </td>
                                        <td className="dashboard__match-table--right dashboard__match-table--nowrap">
                                            {formatAmount(Math.abs(tx.amount), tx.currency || '')}
                                        </td>
                                        <td>
                                            <span className={`dashboard__match-type dashboard__match-type--${tx.type}`}>
                                                {tx.type}
                                            </span>
                                        </td>
                                        {matchFilter === 'matched' && tx.match && (
                                            <td className="dashboard__match-table--match">
                                                <span className="dashboard__match-doc">
                                                    {tx.match.document_ref?.vendor_name || tx.match.document_ref?.filename || '—'}
                                                </span>
                                                <span className="dashboard__match-score">
                                                    {Math.round((tx.match.score?.final_score ?? tx.match.score?.total_score ?? 0) * 100)}%
                                                </span>
                                            </td>
                                        )}
                                        {matchFilter === 'matched' && !tx.match && <td>—</td>}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {filteredTxs.length > 50 && (
                        <div className="dashboard__match-table-more">
                            +{filteredTxs.length - 50} more
                        </div>
                    )}
                </div>
            )}
        </>
    );
};

export default BankPieChartsGrid;
