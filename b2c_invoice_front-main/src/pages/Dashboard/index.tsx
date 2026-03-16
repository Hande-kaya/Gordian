/**
 * Dashboard Page
 * ==============
 * Analytics dashboard with live stats, spending charts, and category breakdown.
 * All amounts shown in the user's preferred display currency.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import Layout from '../../components/layout/Layout';
import { useLang } from '../../shared/i18n';
import { useDashboardStats } from '../../hooks/useDashboardStats';
import { useBankDashboardStats } from '../../hooks/useBankDashboardStats';
import { useCategories } from '../../context/CategoryContext';
import { DISPLAY_CURRENCIES, getPreferredCurrency, setPreferredCurrency, convertCurrency } from '../../utils/currency';
import { CurrencySpending } from '../../services/statsApi';
import SpendingChart from './components/SpendingChart';
import CategoryChartsGrid from './components/CategoryChartsGrid';
import BankPieChartsGrid from './components/BankPieChartsGrid';
import './Dashboard.scss';

/** Convert "YYYY-MM" to "YYYY-MM-DD" (first day of month) */
const monthToStartDate = (ym: string): string => `${ym}-01`;

/** Convert "YYYY-MM" to "YYYY-MM-DD" (last day of month) */
const monthToEndDate = (ym: string): string => {
    const [y, m] = ym.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return `${ym}-${String(lastDay).padStart(2, '0')}`;
};

const PERIOD_TO_GROUP: Record<string, string> = {
    '30d': 'day',
    '90d': 'month',
    '1y': 'year',
};

const PRESET_CHIPS = [
    { label: '1M', value: '30d' },
    { label: '3M', value: '90d' },
    { label: '1Y', value: '1y' },
];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const formatCategoryKey = (key: string): string =>
    key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const Dashboard: React.FC = () => {
    const { t } = useLang();
    const { getLabelByKey } = useCategories();

    // ── View mode toggle ────────────────────────────────────────────────────
    const [viewMode, setViewMode] = useState<'invoices' | 'bank_statements'>('bank_statements');

    // ── Period state ──────────────────────────────────────────────────────────
    const [period, setPeriod] = useState('90d');
    const [customDateRange, setCustomDateRange] = useState(false);
    const [startMonth, setStartMonth] = useState('');
    const [endMonth, setEndMonth] = useState('');
    const rangeInitialized = useRef(false);

    // ── Currency state ────────────────────────────────────────────────────────
    const [displayCurrency, setDisplayCurrency] = useState(getPreferredCurrency);
    const [selectedCurrencies, setSelectedCurrencies] = useState<Set<string>>(new Set());

    // ── Category state ────────────────────────────────────────────────────────
    const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());

    // ── API params ────────────────────────────────────────────────────────────
    const isPreset = period !== 'all';
    const groupBy = useMemo(() => PERIOD_TO_GROUP[period] || 'month', [period]);
    const apiStartDate = !isPreset && customDateRange && startMonth ? monthToStartDate(startMonth) : undefined;
    const apiEndDate   = !isPreset && customDateRange && endMonth   ? monthToEndDate(endMonth)     : undefined;

    // ── Data fetching ─────────────────────────────────────────────────────────
    const { data, loading } = useDashboardStats(
        isPreset ? period : 'all', groupBy, apiStartDate, apiEndDate, 'invoice',
    );
    const { data: revenueData, loading: revenueLoading } = useDashboardStats(
        isPreset ? period : 'all', groupBy, apiStartDate, apiEndDate, 'income',
    );

    // ── Bank dashboard data (lazy — only fetched in bank_statements mode) ────
    const bankData = useBankDashboardStats(
        viewMode === 'bank_statements' ? (isPreset ? period : 'all') : null,
        groupBy,
        apiStartDate,
        apiEndDate,
        t('bankMatched'),
        t('bankUnmatched'),
    );

    // ── Init date range from API ──────────────────────────────────────────────
    useEffect(() => {
        if (rangeInitialized.current || !data?.date_range) return;
        const { min_month, max_month } = data.date_range;
        if (min_month && max_month) {
            setStartMonth(min_month);
            setEndMonth(max_month);
            rangeInitialized.current = true;
        }
    }, [data?.date_range]);

    // ── Derived lists ─────────────────────────────────────────────────────────
    const availableCurrencies = useMemo(() => {
        if (viewMode === 'bank_statements') return bankData.availableCurrencies;
        return Array.from(new Set(data?.spending_by_date?.map(cs => cs.currency) ?? [])).sort();
    }, [viewMode, data?.spending_by_date, bankData.availableCurrencies]);

    const availableCategories = useMemo(() => {
        const cats = Array.from(new Set(data?.spending_by_category?.map(cs => cs.category) ?? [])).sort();
        const otherIndex = cats.findIndex(c => c.toLowerCase() === 'other');
        if (otherIndex !== -1) cats.push(cats.splice(otherIndex, 1)[0]);
        return cats;
    }, [data?.spending_by_category]);

    // ── Auto-select currencies / categories when data changes ─────────────────
    useEffect(() => {
        if (!availableCurrencies.length) return;
        setSelectedCurrencies(prev => {
            const next = new Set(prev);
            let changed = false;
            for (const c of availableCurrencies) { if (!next.has(c)) { next.add(c); changed = true; } }
            return changed ? next : prev;
        });
    }, [availableCurrencies]);

    useEffect(() => {
        if (!availableCategories.length) return;
        setSelectedCategories(prev => {
            const next = new Set(prev);
            let changed = false;
            for (const c of availableCategories) { if (!next.has(c)) { next.add(c); changed = true; } }
            return changed ? next : prev;
        });
    }, [availableCategories]);

    // ── Filtered data ─────────────────────────────────────────────────────────
    const filteredSpendingByCategory = useMemo(
        () => (data?.spending_by_category ?? []).filter(
            cs => selectedCurrencies.has(cs.currency) && selectedCategories.has(cs.category),
        ),
        [data?.spending_by_category, selectedCurrencies, selectedCategories],
    );

    const filteredSpendingByDate = useMemo((): CurrencySpending[] => {
        const allCatsSelected = availableCategories.length > 0
            && availableCategories.every(c => selectedCategories.has(c));

        if (allCatsSelected) {
            return (data?.spending_by_date ?? []).filter(cs => selectedCurrencies.has(cs.currency));
        }

        const map = new Map<string, Map<string, { total: number; count: number }>>();
        for (const cs of filteredSpendingByCategory) {
            if (!map.has(cs.currency)) map.set(cs.currency, new Map());
            const dateMap = map.get(cs.currency)!;
            for (const pt of cs.time_series) {
                const existing = dateMap.get(pt.date) || { total: 0, count: 0 };
                existing.total += pt.total;
                existing.count += pt.count;
                dateMap.set(pt.date, existing);
            }
        }

        const result: CurrencySpending[] = [];
        map.forEach((dateMap, currency) => {
            let currencyTotal = 0;
            const timeSeries = Array.from(dateMap.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([date, val]) => { currencyTotal += val.total; return { date, ...val }; });
            result.push({ currency, time_series: timeSeries, currency_total: currencyTotal });
        });
        return result;
    }, [data?.spending_by_date, filteredSpendingByCategory, availableCategories, selectedCurrencies, selectedCategories]);

    const revenueSpendingByDate = useMemo((): CurrencySpending[] =>
        (revenueData?.spending_by_date ?? []).filter(cs => selectedCurrencies.has(cs.currency)),
    [revenueData?.spending_by_date, selectedCurrencies]);

    // ── Bank: currency-filtered chart data ──────────────────────────────────
    const filteredBankDebits = useMemo((): CurrencySpending[] =>
        bankData.debitsByDate.filter(cs => selectedCurrencies.has(cs.currency)),
    [bankData.debitsByDate, selectedCurrencies]);

    const filteredBankCredits = useMemo((): CurrencySpending[] =>
        bankData.creditsByDate.filter(cs => selectedCurrencies.has(cs.currency)),
    [bankData.creditsByDate, selectedCurrencies]);

    // ── Bank: summary converted to display currency ─────────────────────────
    const bankSummaryConverted = useMemo(() => {
        let totalDebits = 0;
        let totalCredits = 0;
        for (const tx of bankData.transactions) {
            if (selectedCurrencies.size > 0 && !selectedCurrencies.has(tx.currency || 'TRY')) continue;
            const amt = Math.abs(tx.amount);
            const converted = convertCurrency(amt, tx.currency || 'TRY', displayCurrency) ?? amt;
            if (tx.type === 'debit') totalDebits += converted;
            else totalCredits += converted;
        }
        return { totalDebits, totalCredits };
    }, [bankData.transactions, displayCurrency, selectedCurrencies]);

    // ── Handlers ──────────────────────────────────────────────────────────────
    const allCurrenciesSelected = availableCurrencies.length > 0
        && availableCurrencies.every(c => selectedCurrencies.has(c));

    const handleCurrencyChipClick = (currency: string) => {
        setSelectedCurrencies(prev => {
            const next = new Set(prev);
            if (next.has(currency)) {
                next.delete(currency);
            } else {
                next.add(currency);
            }
            return next;
        });
    };

    const handlePresetClick = (value: string) => {
        setPeriod(value);
        setCustomDateRange(false);
    };

    const handleStartMonthChange = (m: string) => {
        setPeriod('all');
        setCustomDateRange(true);
        if (endMonth && m >= endMonth) {
            // clamp: push endMonth to one month after new start
            const [y, mo] = m.split('-').map(Number);
            const nextMo = mo === 12 ? 1 : mo + 1;
            const nextY = mo === 12 ? y + 1 : y;
            setEndMonth(`${nextY}-${String(nextMo).padStart(2, '0')}`);
        }
        setStartMonth(m);
    };

    const handleEndMonthChange = (m: string) => {
        setPeriod('all');
        setCustomDateRange(true);
        if (startMonth && m <= startMonth) {
            // clamp: push startMonth to one month before new end
            const [y, mo] = m.split('-').map(Number);
            const prevMo = mo === 1 ? 12 : mo - 1;
            const prevY = mo === 1 ? y - 1 : y;
            setStartMonth(`${prevY}-${String(prevMo).padStart(2, '0')}`);
        }
        setEndMonth(m);
    };

    const handleCategoryToggle = (category: string) => {
        setSelectedCategories(prev => {
            const next = new Set(prev);
            if (next.has(category)) next.delete(category); else next.add(category);
            return next;
        });
    };

    const handleDisplayCurrencyChange = (cur: string) => {
        setDisplayCurrency(cur);
        setPreferredCurrency(cur);
    };

    // ── Year options for custom picker ────────────────────────────────────────
    const pickerYears = useMemo(() => {
        const now = new Date();
        const minY = data?.date_range?.min_month
            ? parseInt(data.date_range.min_month.split('-')[0]) : now.getFullYear() - 2;
        const maxY = data?.date_range?.max_month
            ? parseInt(data.date_range.max_month.split('-')[0]) : now.getFullYear();
        const years: number[] = [];
        for (let y = minY; y <= maxY; y++) years.push(y);
        return years;
    }, [data?.date_range]);

    return (
        <Layout
            pageTitle={t('dashboardTitle')}
            pageDescription={t('dashboardDescription')}
        >
            <div className="dashboard">

                {/* ── Tab Panel: toggle + content ────────────────────────── */}
                <div className={`dashboard__tab-panel${viewMode === 'invoices' ? ' dashboard__tab-panel--alt' : ''}`}>
                    <div className="dashboard__tab-bar">
                        <button
                            className={`dashboard__tab ${viewMode === 'bank_statements' ? 'dashboard__tab--active' : ''}`}
                            onClick={() => setViewMode('bank_statements')}
                        >
                            {t('navBankStatements')}
                        </button>
                        <button
                            className={`dashboard__tab ${viewMode === 'invoices' ? 'dashboard__tab--active' : ''}`}
                            onClick={() => setViewMode('invoices')}
                        >
                            {t('dashboardInvoices')}
                        </button>
                    </div>
                    <div className="dashboard__tab-content">

                {/* ── Toolbar ─────────────────────────────────────────────── */}
                <div className="dashboard__toolbar-v2">

                    {/* LEFT: Currency controls */}
                    <div className="dashboard__toolbar-group">
                        <div className="dashboard__toolbar-row">
                            <span className="dashboard__toolbar-label">{t('showValuesIn')}</span>
                            <select
                                className="dashboard__display-currency-select"
                                value={displayCurrency}
                                onChange={e => handleDisplayCurrencyChange(e.target.value)}
                            >
                                {DISPLAY_CURRENCIES.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>

                        {availableCurrencies.length > 0 && (
                            <div className="dashboard__toolbar-row">
                                <span className="dashboard__toolbar-label">{t('transactionCurrency')}</span>
                                <div className="dashboard__chip-group">
                                    <button
                                        className={`dashboard__chip ${allCurrenciesSelected ? 'dashboard__chip--active' : ''}`}
                                        onClick={() => setSelectedCurrencies(new Set(availableCurrencies))}
                                    >
                                        {t('selectAll')}
                                    </button>
                                    {availableCurrencies.map(c => (
                                        <button
                                            key={c}
                                            className={`dashboard__chip ${selectedCurrencies.has(c) ? 'dashboard__chip--active' : ''}`}
                                            onClick={() => handleCurrencyChipClick(c)}
                                        >
                                            {c}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* RIGHT: Time controls */}
                    <div className="dashboard__toolbar-group dashboard__toolbar-group--right">

                        <div className="dashboard__toolbar-row">
                            <span className="dashboard__toolbar-label">{t('dateRanges')}</span>
                            <div className="dashboard__period-group">
                                {PRESET_CHIPS.map(chip => (
                                    <button
                                        key={chip.value}
                                        className={`dashboard__period-btn ${period === chip.value && !customDateRange ? 'dashboard__period-btn--active' : ''}`}
                                        onClick={() => handlePresetClick(chip.value)}
                                    >
                                        {chip.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="dashboard__toolbar-row">
                            <span className="dashboard__custom-popover-label">{t('periodFrom')}</span>
                            <select
                                className="dashboard__custom-popover-select"
                                value={startMonth.split('-')[1] ? parseInt(startMonth.split('-')[1]) - 1 : 0}
                                onChange={e => {
                                    const y = startMonth.split('-')[0] || String(new Date().getFullYear());
                                    handleStartMonthChange(`${y}-${String(parseInt(e.target.value) + 1).padStart(2, '0')}`);
                                }}
                            >
                                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                            </select>
                            <select
                                className="dashboard__custom-popover-select"
                                value={startMonth.split('-')[0] || new Date().getFullYear()}
                                onChange={e => {
                                    const mo = startMonth.split('-')[1] || '01';
                                    handleStartMonthChange(`${e.target.value}-${mo}`);
                                }}
                            >
                                {pickerYears.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                            <span className="dashboard__custom-popover-label">{t('periodTo')}</span>
                            <select
                                className="dashboard__custom-popover-select"
                                value={endMonth.split('-')[1] ? parseInt(endMonth.split('-')[1]) - 1 : 0}
                                onChange={e => {
                                    const y = endMonth.split('-')[0] || String(new Date().getFullYear());
                                    handleEndMonthChange(`${y}-${String(parseInt(e.target.value) + 1).padStart(2, '0')}`);
                                }}
                            >
                                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                            </select>
                            <select
                                className="dashboard__custom-popover-select"
                                value={endMonth.split('-')[0] || new Date().getFullYear()}
                                onChange={e => {
                                    const mo = endMonth.split('-')[1] || '01';
                                    handleEndMonthChange(`${e.target.value}-${mo}`);
                                }}
                            >
                                {pickerYears.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>

                    </div>
                </div>

                {/* ── Category chips (invoices only) ────────────────────── */}
                {viewMode === 'invoices' && availableCategories.length > 1 && (
                    <div className="dashboard__category-chips">
                        {availableCategories.map(cat => (
                            <button
                                key={cat}
                                className={`dashboard__filter-chip ${selectedCategories.has(cat) ? 'dashboard__filter-chip--on' : 'dashboard__filter-chip--off'}`}
                                onClick={() => handleCategoryToggle(cat)}
                            >
                                <svg className="dashboard__filter-chip-icon" viewBox="0 0 16 16" width="12" height="12">
                                    {selectedCategories.has(cat)
                                        ? <path d="M2 8.5l4 4 8-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        : <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    }
                                </svg>
                                {formatCategoryKey(getLabelByKey(cat))}
                            </button>
                        ))}
                    </div>
                )}

                {/* ── Invoices Charts ─────────────────────────────────────── */}
                {viewMode === 'invoices' && (
                    <>
                        <div data-tutorial="charts">
                            <SpendingChart
                                data={filteredSpendingByDate}
                                loading={loading}
                                displayCurrency={displayCurrency}
                                title={t('totalSpending')}
                            />
                        </div>

                        <SpendingChart
                            data={revenueSpendingByDate}
                            loading={revenueLoading}
                            displayCurrency={displayCurrency}
                            title={t('totalRevenue')}
                        />

                        <CategoryChartsGrid
                            categories={filteredSpendingByCategory}
                            loading={loading}
                            displayCurrency={displayCurrency}
                        />
                    </>
                )}

                {/* ── Bank Statements Charts ──────────────────────────────── */}
                {viewMode === 'bank_statements' && (
                    <>
                        {/* Summary cards */}
                        <div className="dashboard__bank-summary">
                            <div className="dashboard__stat-card dashboard__stat-card--total">
                                <div>
                                    <div className="dashboard__stat-value">{bankData.summary.totalTransactions}</div>
                                    <div className="dashboard__stat-label">{t('bankTotalTransactions')}</div>
                                </div>
                            </div>
                            <div className="dashboard__stat-card dashboard__stat-card--discrepancy">
                                <div>
                                    <div className="dashboard__stat-value">
                                        {bankSummaryConverted.totalDebits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {displayCurrency}
                                    </div>
                                    <div className="dashboard__stat-label">{t('bankTotalDebits')}</div>
                                </div>
                            </div>
                            <div className="dashboard__stat-card dashboard__stat-card--matched">
                                <div>
                                    <div className="dashboard__stat-value">
                                        {bankSummaryConverted.totalCredits.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {displayCurrency}
                                    </div>
                                    <div className="dashboard__stat-label">{t('bankTotalCredits')}</div>
                                </div>
                            </div>
                            <div className="dashboard__stat-card dashboard__stat-card--pending">
                                <div>
                                    <div className="dashboard__stat-value">
                                        {bankData.summary.totalTransactions > 0
                                            ? `${((bankData.summary.matchedCount / bankData.summary.totalTransactions) * 100).toFixed(1)}%`
                                            : '—'}
                                    </div>
                                    <div className="dashboard__stat-label">{t('bankMatchRate')}</div>
                                </div>
                            </div>
                        </div>

                        {/* Bar charts: debits (red) and credits (green) */}
                        <SpendingChart
                            data={filteredBankDebits}
                            loading={bankData.loading}
                            displayCurrency={displayCurrency}
                            title={t('bankTotalDebits')}
                            barColor="#ef4444"
                        />
                        <SpendingChart
                            data={filteredBankCredits}
                            loading={bankData.loading}
                            displayCurrency={displayCurrency}
                            title={t('bankTotalCredits')}
                            barColor="#10b981"
                        />

                        {/* Pie charts: by bank + match status */}
                        <BankPieChartsGrid
                            bankBreakdown={bankData.bankBreakdown}
                            matchStatus={bankData.matchStatus}
                            transactions={bankData.transactions}
                            displayCurrency={displayCurrency}
                            loading={bankData.loading}
                        />
                    </>
                )}

                    </div>{/* end tab-content */}
                </div>{/* end tab-panel */}
            </div>
        </Layout>
    );
};

export default Dashboard;