/**
 * useBankDashboardStats Hook
 *
 * Fetches all bank transactions from the reconciliation API and aggregates
 * them client-side into time series (debits/credits) and pie chart data
 * (by bank / match status).
 *
 * Currency filtering is NOT done here — the Dashboard handles it (same as invoices).
 * Uses stale-while-revalidate pattern (same as useDashboardStats).
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getTransactions, UnifiedTransaction } from '../services/reconciliationApi';
import { CurrencySpending, SpendingDataPoint } from '../services/statsApi';
import { PieSlice } from '../pages/Dashboard/components/CategoryPieChart';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BankDashboardSummary {
    totalDebits: number;
    totalCredits: number;
    totalTransactions: number;
    matchedCount: number;
    unmatchedCount: number;
    bankCount: number;
}

export interface BankDashboardData {
    debitsByDate: CurrencySpending[];
    creditsByDate: CurrencySpending[];
    bankBreakdown: PieSlice[];
    matchStatus: PieSlice[];
    availableCurrencies: string[];
    transactions: UnifiedTransaction[];  // period-filtered raw txs for detail views
    summary: BankDashboardSummary;
    loading: boolean;
    error: string | null;
}

// ─── Cache helpers ──────────────────────────────────────────────────────────

const CACHE_KEY = 'bank_dash_txs';

function readCache(): UnifiedTransaction[] | null {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function writeCache(data: UnifiedTransaction[]): void {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)); }
    catch { /* quota exceeded */ }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Format date to groupBy key */
function dateToGroupKey(dateStr: string, groupBy: string): string {
    if (groupBy === 'day') return dateStr;
    if (groupBy === 'month') return dateStr.substring(0, 7);
    if (groupBy === 'year') return dateStr.substring(0, 4);
    return dateStr.substring(0, 7);
}

/** Filter transactions by period / date range */
function filterByPeriod(
    txs: UnifiedTransaction[],
    period: string,
    startDate?: string,
    endDate?: string,
): UnifiedTransaction[] {
    if (startDate && endDate) {
        return txs.filter(tx => tx.date >= startDate && tx.date <= endDate);
    }

    if (period === 'all') return txs;

    const now = new Date();
    let cutoff: Date;
    switch (period) {
        case '30d':  cutoff = new Date(now.getTime() - 30 * 86400000); break;
        case '90d':  cutoff = new Date(now.getTime() - 90 * 86400000); break;
        case '1y':   cutoff = new Date(now.getTime() - 365 * 86400000); break;
        default:     return txs;
    }

    const cutoffStr = cutoff.toISOString().substring(0, 10);
    return txs.filter(tx => tx.date >= cutoffStr);
}

/** Build CurrencySpending[] time series from filtered transactions */
function buildTimeSeries(
    txs: UnifiedTransaction[],
    type: 'debit' | 'credit',
    groupBy: string,
): CurrencySpending[] {
    const filtered = txs.filter(tx => tx.type === type);
    const currencyMap = new Map<string, Map<string, { total: number; count: number }>>();

    for (const tx of filtered) {
        const cur = tx.currency || 'TRY';
        const key = dateToGroupKey(tx.date, groupBy);
        if (!currencyMap.has(cur)) currencyMap.set(cur, new Map());
        const dateMap = currencyMap.get(cur)!;
        const existing = dateMap.get(key) || { total: 0, count: 0 };
        existing.total += Math.abs(tx.amount);
        existing.count += 1;
        dateMap.set(key, existing);
    }

    const result: CurrencySpending[] = [];
    currencyMap.forEach((dateMap, currency) => {
        let currencyTotal = 0;
        const timeSeries: SpendingDataPoint[] = Array.from(dateMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, val]) => {
                currencyTotal += val.total;
                return { date, total: val.total, count: val.count };
            });
        result.push({ currency, time_series: timeSeries, currency_total: currencyTotal });
    });

    return result;
}

/** Build pie slices for bank breakdown */
function buildBankBreakdown(txs: UnifiedTransaction[]): PieSlice[] {
    const bankMap = new Map<string, number>();
    for (const tx of txs) {
        const bank = tx.bank_name || 'Unknown';
        bankMap.set(bank, (bankMap.get(bank) || 0) + Math.abs(tx.amount));
    }

    const total = Array.from(bankMap.values()).reduce((s, v) => s + v, 0);
    return Array.from(bankMap.entries())
        .sort(([, a], [, b]) => b - a)
        .map(([name, value]) => ({
            name,
            value,
            percentage: total > 0 ? (value / total) * 100 : 0,
        }));
}

/** Build pie slices for match status */
function buildMatchStatus(txs: UnifiedTransaction[], tMatched: string, tUnmatched: string): PieSlice[] {
    let matched = 0;
    let unmatched = 0;
    for (const tx of txs) {
        if (tx.matches && tx.matches.length > 0) matched++;
        else unmatched++;
    }
    const total = matched + unmatched;
    return [
        { name: tMatched, value: matched, percentage: total > 0 ? (matched / total) * 100 : 0 },
        { name: tUnmatched, value: unmatched, percentage: total > 0 ? (unmatched / total) * 100 : 0 },
    ];
}

// ─── Hook ───────────────────────────────────────────────────────────────────

const EMPTY_SUMMARY: BankDashboardSummary = {
    totalDebits: 0, totalCredits: 0, totalTransactions: 0,
    matchedCount: 0, unmatchedCount: 0, bankCount: 0,
};

export const useBankDashboardStats = (
    period: string | null,
    groupBy: string,
    startDate?: string,
    endDate?: string,
    tMatched: string = 'Matched',
    tUnmatched: string = 'Unmatched',
): BankDashboardData => {
    const skip = period === null;

    const [rawTxs, setRawTxs] = useState<UnifiedTransaction[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const hasCacheRef = useRef(false);

    const fetchData = useCallback(async () => {
        // Check cache first
        const cached = readCache();
        if (cached && cached.length > 0) {
            setRawTxs(cached);
            hasCacheRef.current = true;
            // Don't show loading spinner if we have cache
        }

        if (!hasCacheRef.current) setLoading(true);
        setError(null);

        try {
            const response = await getTransactions(1, 10000, 'all');
            if (response.success && response.data) {
                setRawTxs(response.data.transactions);
                writeCache(response.data.transactions);
            } else {
                setError(response.message || 'Failed to fetch transactions');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Network error');
        } finally {
            setLoading(false);
            hasCacheRef.current = false;
        }
    }, []);

    // Fetch when switching to bank mode
    useEffect(() => {
        if (skip) return;
        fetchData();
    }, [skip, fetchData]);

    // Aggregate — no currency filtering here (Dashboard handles it)
    const aggregated = useMemo(() => {
        if (skip || rawTxs.length === 0) {
            return {
                debitsByDate: [] as CurrencySpending[],
                creditsByDate: [] as CurrencySpending[],
                bankBreakdown: [] as PieSlice[],
                matchStatus: [] as PieSlice[],
                availableCurrencies: [] as string[],
                transactions: [] as UnifiedTransaction[],
                summary: EMPTY_SUMMARY,
            };
        }

        let periodFiltered = filterByPeriod(rawTxs, period || 'all', startDate, endDate);

        // Fallback: if period filter empties everything but raw data exists,
        // show all data so the user sees something rather than empty charts.
        if (periodFiltered.length === 0 && rawTxs.length > 0) {
            periodFiltered = rawTxs;
        }

        const effectiveGroupBy = period === '30d' ? 'day' : 'month';
        const finalGroupBy = groupBy || effectiveGroupBy;

        const debitsByDate = buildTimeSeries(periodFiltered, 'debit', finalGroupBy);
        const creditsByDate = buildTimeSeries(periodFiltered, 'credit', finalGroupBy);
        const bankBreakdown = buildBankBreakdown(periodFiltered);
        const matchStatus = buildMatchStatus(periodFiltered, tMatched, tUnmatched);
        const availableCurrencies = Array.from(new Set(periodFiltered.map(tx => tx.currency || 'TRY'))).sort();

        let totalDebits = 0;
        let totalCredits = 0;
        let matchedCount = 0;
        let unmatchedCount = 0;
        const bankSet = new Set<string>();

        for (const tx of periodFiltered) {
            if (tx.type === 'debit') totalDebits += Math.abs(tx.amount);
            else totalCredits += Math.abs(tx.amount);
            if (tx.matches && tx.matches.length > 0) matchedCount++;
            else unmatchedCount++;
            if (tx.bank_name) bankSet.add(tx.bank_name);
        }

        return {
            debitsByDate,
            creditsByDate,
            bankBreakdown,
            matchStatus,
            availableCurrencies,
            transactions: periodFiltered,
            summary: {
                totalDebits,
                totalCredits,
                totalTransactions: periodFiltered.length,
                matchedCount,
                unmatchedCount,
                bankCount: bankSet.size,
            },
        };
    }, [skip, rawTxs, period, groupBy, startDate, endDate, tMatched, tUnmatched]);

    return { ...aggregated, loading, error };
};

export default useBankDashboardStats;
