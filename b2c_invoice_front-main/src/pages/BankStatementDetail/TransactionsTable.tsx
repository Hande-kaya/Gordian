/**
 * TransactionsTable - Displays bank statement transactions.
 *
 * Read-only sortable table with debit/credit columns and totals row.
 */

import React, { useState, useMemo } from 'react';
import { useLang } from '../../shared/i18n';

export interface Transaction {
    date?: string;
    description?: string;
    amount?: number | null;
    type?: 'debit' | 'credit';
    balance?: number | null;
}

interface TransactionsTableProps {
    transactions: Transaction[];
    currency?: string;
}

type SortKey = 'date' | 'description' | 'amount' | 'balance';
type SortDir = 'asc' | 'desc';

const fmtNum = (v?: number | null) =>
    v != null ? v.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '';

const fmtCurrency = (v?: number | null, currency = '') => {
    if (v == null) return '-';
    if (!currency) {
        return v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    try {
        return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(v);
    } catch {
        return `${fmtNum(v)} ${currency}`;
    }
};

const TransactionsTable: React.FC<TransactionsTableProps> = ({
    transactions, currency = '',
}) => {
    const { t } = useLang();
    const [sortKey, setSortKey] = useState<SortKey>('date');
    const [sortDir, setSortDir] = useState<SortDir>('asc');

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const sorted = useMemo(() => {
        const copy = [...transactions];
        copy.sort((a, b) => {
            let av: any, bv: any;
            if (sortKey === 'date') { av = a.date || ''; bv = b.date || ''; }
            else if (sortKey === 'description') { av = a.description || ''; bv = b.description || ''; }
            else if (sortKey === 'amount') { av = a.amount ?? 0; bv = b.amount ?? 0; }
            else { av = a.balance ?? 0; bv = b.balance ?? 0; }
            if (av < bv) return sortDir === 'asc' ? -1 : 1;
            if (av > bv) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        return copy;
    }, [transactions, sortKey, sortDir]);

    const totals = useMemo(() => {
        let debits = 0;
        let credits = 0;
        for (const tx of transactions) {
            const amt = tx.amount ?? 0;
            if (tx.type === 'credit' || amt < 0) {
                credits += Math.abs(amt);
            } else {
                debits += Math.abs(amt);
            }
        }
        return { debits, credits };
    }, [transactions]);

    if (!transactions || transactions.length === 0) {
        return (
            <div className="transactions-section">
                <h3 className="transactions-section__title">
                    {t('sectionTransactions')}
                </h3>
                <p className="transactions-section__empty">
                    {t('noTransactions')}
                </p>
            </div>
        );
    }

    const sortIcon = (key: SortKey) => {
        if (sortKey !== key) return null;
        return sortDir === 'asc' ? ' \u25B2' : ' \u25BC';
    };

    return (
        <div className="transactions-section">
            <h3 className="transactions-section__title">
                {t('sectionTransactions')}
                <span className="transactions-section__count">
                    ({transactions.length})
                </span>
            </h3>
            <div className="transactions-section__table-wrap">
                <table className="transactions-section__table">
                    <thead>
                        <tr>
                            <th className="col-num">#</th>
                            <th
                                className="col-date sortable"
                                onClick={() => handleSort('date')}
                            >
                                {t('txDate')}{sortIcon('date')}
                            </th>
                            <th
                                className="col-desc sortable"
                                onClick={() => handleSort('description')}
                            >
                                {t('txDescription')}{sortIcon('description')}
                            </th>
                            <th
                                className="col-debit sortable"
                                onClick={() => handleSort('amount')}
                            >
                                {t('txDebit')}{sortIcon('amount')}
                            </th>
                            <th className="col-credit">
                                {t('txCredit')}
                            </th>
                            <th
                                className="col-balance sortable"
                                onClick={() => handleSort('balance')}
                            >
                                {t('txBalance')}{sortIcon('balance')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((tx, idx) => {
                            const isCredit = tx.type === 'credit' || (tx.amount ?? 0) < 0;
                            const absAmount = Math.abs(tx.amount ?? 0);
                            return (
                                <tr key={idx}>
                                    <td className="col-num">{idx + 1}</td>
                                    <td className="col-date">{tx.date || '-'}</td>
                                    <td className="col-desc">{tx.description || '-'}</td>
                                    <td className="col-debit num-cell">
                                        {!isCredit ? fmtCurrency(absAmount, currency) : ''}
                                    </td>
                                    <td className="col-credit num-cell">
                                        {isCredit ? fmtCurrency(absAmount, currency) : ''}
                                    </td>
                                    <td className="col-balance num-cell">
                                        {tx.balance != null ? fmtCurrency(tx.balance, currency) : '-'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr className="totals-row">
                            <td colSpan={3} className="totals-label">
                                {t('txTotal')}
                            </td>
                            <td className="col-debit num-cell totals-value">
                                {fmtCurrency(totals.debits, currency)}
                            </td>
                            <td className="col-credit num-cell totals-value">
                                {fmtCurrency(totals.credits, currency)}
                            </td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

export default TransactionsTable;
