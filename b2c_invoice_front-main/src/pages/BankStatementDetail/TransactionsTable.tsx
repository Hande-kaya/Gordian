/**
 * TransactionsTable - Displays bank statement transactions.
 *
 * Sortable table with debit/credit columns and totals row.
 * Supports inline editing when editable prop is true.
 */

import React, { useState, useMemo, useCallback } from 'react';
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
    editable?: boolean;
    onTransactionsChange?: (txs: Transaction[]) => void;
    onCurrencyChange?: (currency: string) => void;
}

type SortKey = 'date' | 'description' | 'amount' | 'balance';
type SortDir = 'asc' | 'desc';

const COMMON_CURRENCIES = ['EUR', 'USD', 'TRY', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF'];

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
    transactions, currency = '', editable = false, onTransactionsChange, onCurrencyChange,
}) => {
    const { t } = useLang();
    const [sortKey, setSortKey] = useState<SortKey>('date');
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [searchQuery, setSearchQuery] = useState('');

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const filtered = useMemo(() => {
        if (!searchQuery.trim()) return transactions;
        const q = searchQuery.toLowerCase().trim();
        return transactions.filter(tx =>
            (tx.description || '').toLowerCase().includes(q) ||
            (tx.date || '').includes(q) ||
            (tx.amount != null && String(tx.amount).includes(q))
        );
    }, [transactions, searchQuery]);

    const sorted = useMemo(() => {
        const copy = [...filtered];
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
    }, [filtered, sortKey, sortDir]);

    const totals = useMemo(() => {
        let debits = 0;
        let credits = 0;
        for (const tx of filtered) {
            const amt = tx.amount ?? 0;
            if (tx.type === 'credit' || amt < 0) {
                credits += Math.abs(amt);
            } else {
                debits += Math.abs(amt);
            }
        }
        return { debits, credits };
    }, [filtered]);

    // Editing helpers — update a single transaction in the parent array
    const updateTx = useCallback((originalIndex: number, field: keyof Transaction, value: any) => {
        if (!onTransactionsChange) return;
        const updated = [...transactions];
        updated[originalIndex] = { ...updated[originalIndex], [field]: value };
        onTransactionsChange(updated);
    }, [transactions, onTransactionsChange]);

    const addRow = useCallback(() => {
        if (!onTransactionsChange) return;
        onTransactionsChange([
            ...transactions,
            { date: '', description: '', amount: 0, type: 'debit', balance: null },
        ]);
    }, [transactions, onTransactionsChange]);

    const removeRow = useCallback((originalIndex: number) => {
        if (!onTransactionsChange) return;
        onTransactionsChange(transactions.filter((_, i) => i !== originalIndex));
    }, [transactions, onTransactionsChange]);

    // Map filtered/sorted tx back to the original index in `transactions`
    const getOriginalIndex = useCallback((tx: Transaction) => {
        return transactions.indexOf(tx);
    }, [transactions]);

    if (!transactions || transactions.length === 0) {
        return (
            <div className="transactions-section">
                <h3 className="transactions-section__title">
                    {t('sectionTransactions')}
                </h3>
                {editable ? (
                    <div className="transactions-section__empty-edit">
                        <p className="transactions-section__empty">{t('noTransactions')}</p>
                        <button className="transactions-section__add-btn" onClick={addRow}>
                            + {t('addTransaction') || 'Add Transaction'}
                        </button>
                    </div>
                ) : (
                    <p className="transactions-section__empty">{t('noTransactions')}</p>
                )}
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
                    {searchQuery.trim()
                        ? `(${filtered.length} / ${transactions.length})`
                        : `(${transactions.length})`}
                </span>
            </h3>
            <div className="transactions-section__search">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                    type="text"
                    placeholder={t('searchTransactionsPlaceholder')}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="transactions-section__search-input"
                />
                {searchQuery && (
                    <button
                        onClick={() => setSearchQuery('')}
                        className="transactions-section__search-clear"
                    >
                        &times;
                    </button>
                )}
            </div>
            <div className="transactions-section__table-wrap">
                <table className={`transactions-section__table${editable ? ' transactions-section__table--editable' : ''}`}>
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
                                {editable && onCurrencyChange ? (
                                    <span className="col-debit__header">
                                        {t('txDebit')}
                                        <select
                                            className="col-debit__currency-select"
                                            value={currency}
                                            onChange={e => { e.stopPropagation(); onCurrencyChange(e.target.value); }}
                                            onClick={e => e.stopPropagation()}
                                        >
                                            {COMMON_CURRENCIES.map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                    </span>
                                ) : (
                                    <>{t('txDebit')}{currency ? ` (${currency})` : ''}{sortIcon('amount')}</>
                                )}
                            </th>
                            <th className="col-credit">
                                {t('txCredit')}{!editable && currency ? ` (${currency})` : ''}
                            </th>
                            <th
                                className="col-balance sortable"
                                onClick={() => handleSort('balance')}
                            >
                                {t('txBalance')}{sortIcon('balance')}
                            </th>
                            {editable && <th className="col-actions"></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((tx, idx) => {
                            const isCredit = tx.type === 'credit' || (tx.amount ?? 0) < 0;
                            const absAmount = Math.abs(tx.amount ?? 0);
                            const origIdx = getOriginalIndex(tx);

                            if (editable) {
                                return (
                                    <tr key={idx} className="transactions-section__edit-row">
                                        <td className="col-num">{idx + 1}</td>
                                        <td className="col-date">
                                            <input
                                                type="date"
                                                className="tx-edit-input tx-edit-input--date"
                                                value={tx.date || ''}
                                                onChange={e => updateTx(origIdx, 'date', e.target.value)}
                                            />
                                        </td>
                                        <td className="col-desc">
                                            <input
                                                type="text"
                                                className="tx-edit-input tx-edit-input--desc"
                                                value={tx.description || ''}
                                                onChange={e => updateTx(origIdx, 'description', e.target.value)}
                                            />
                                        </td>
                                        <td className="col-debit num-cell">
                                            {!isCredit ? (
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className="tx-edit-input tx-edit-input--num"
                                                    value={absAmount || ''}
                                                    onChange={e => {
                                                        const val = parseFloat(e.target.value) || 0;
                                                        updateTx(origIdx, 'amount', Math.abs(val));
                                                        updateTx(origIdx, 'type', 'debit');
                                                    }}
                                                />
                                            ) : (
                                                <button
                                                    className="tx-edit-type-toggle"
                                                    title="Switch to debit"
                                                    onClick={() => {
                                                        updateTx(origIdx, 'type', 'debit');
                                                        updateTx(origIdx, 'amount', absAmount);
                                                    }}
                                                >-</button>
                                            )}
                                        </td>
                                        <td className="col-credit num-cell">
                                            {isCredit ? (
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className="tx-edit-input tx-edit-input--num"
                                                    value={absAmount || ''}
                                                    onChange={e => {
                                                        const val = parseFloat(e.target.value) || 0;
                                                        updateTx(origIdx, 'amount', -Math.abs(val));
                                                        updateTx(origIdx, 'type', 'credit');
                                                    }}
                                                />
                                            ) : (
                                                <button
                                                    className="tx-edit-type-toggle"
                                                    title="Switch to credit"
                                                    onClick={() => {
                                                        updateTx(origIdx, 'type', 'credit');
                                                        updateTx(origIdx, 'amount', -absAmount);
                                                    }}
                                                >-</button>
                                            )}
                                        </td>
                                        <td className="col-balance num-cell">
                                            <input
                                                type="number"
                                                step="0.01"
                                                className="tx-edit-input tx-edit-input--num"
                                                value={tx.balance ?? ''}
                                                onChange={e => updateTx(origIdx, 'balance', e.target.value === '' ? null : parseFloat(e.target.value))}
                                            />
                                        </td>
                                        <td className="col-actions">
                                            <button
                                                className="tx-edit-remove-btn"
                                                onClick={() => removeRow(origIdx)}
                                                title="Remove row"
                                            >&times;</button>
                                        </td>
                                    </tr>
                                );
                            }

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
                            <td colSpan={editable ? 2 : 1}></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            {editable && (
                <button className="transactions-section__add-btn" onClick={addRow}>
                    + {t('addTransaction') || 'Add Transaction'}
                </button>
            )}
        </div>
    );
};

export default TransactionsTable;
