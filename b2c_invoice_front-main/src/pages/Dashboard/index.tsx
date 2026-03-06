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
import { useCategories } from '../../context/CategoryContext';
import { DISPLAY_CURRENCIES, getPreferredCurrency, setPreferredCurrency } from '../../utils/currency';
import { CurrencySpending } from '../../services/statsApi';
import PeriodSelector from './components/PeriodSelector';
import ChartFilters from './components/CurrencyFilter';
import SpendingChart from './components/SpendingChart';
import CategoryChartsGrid from './components/CategoryChartsGrid';
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
    '7d': 'day',
    '30d': 'day',
    '90d': 'month',
    '1y': 'year',
    'all': 'month',
};

const formatCategoryKey = (key: string): string =>
    key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const Dashboard: React.FC = () => {
    const { t } = useLang();
    const { getLabelByKey } = useCategories();
    const [docType, setDocType] = useState<'invoice' | 'income'>('invoice');
    const [period, setPeriod] = useState('all');
    const [startMonth, setStartMonth] = useState('');
    const [endMonth, setEndMonth] = useState('');
    const [displayCurrency, setDisplayCurrency] = useState(getPreferredCurrency);
    const [selectedCurrencies, setSelectedCurrencies] = useState<Set<string>>(new Set());
    const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
    const rangeInitialized = useRef(false);
    const customDateRange = useRef(false);

    // Determine what to send to API
    const isPreset = period !== 'all';
    const groupBy = useMemo(() => PERIOD_TO_GROUP[period] || 'day', [period]);

    // Only send dates when user explicitly picked months (not auto-initialized)
    const apiStartDate = !isPreset && customDateRange.current && startMonth ? monthToStartDate(startMonth) : undefined;
    const apiEndDate = !isPreset && customDateRange.current && endMonth ? monthToEndDate(endMonth) : undefined;

    const { data, loading } = useDashboardStats(
        isPreset ? period : 'all',
        groupBy,
        apiStartDate,
        apiEndDate,
        docType,
    );

    // Initialize month dropdowns from API date_range on first load
    useEffect(() => {
        if (rangeInitialized.current || !data?.date_range) return;
        const { min_month, max_month } = data.date_range;
        if (min_month && max_month) {
            setStartMonth(min_month);
            setEndMonth(max_month);
            rangeInitialized.current = true;
        }
    }, [data?.date_range]);

    // Extract unique currencies & categories from data
    const availableCurrencies = useMemo(() => {
        if (!data?.spending_by_date) return [];
        return Array.from(new Set(data.spending_by_date.map(cs => cs.currency))).sort();
    }, [data?.spending_by_date]);

    const availableCategories = useMemo(() => {
        if (!data?.spending_by_category) return [];
        return Array.from(new Set(data.spending_by_category.map(cs => cs.category))).sort();
    }, [data?.spending_by_category]);

    // Auto-select new currencies/categories when data changes
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

    // Filtered category data (currency + category filters)
    const filteredSpendingByCategory = useMemo(
        () => (data?.spending_by_category ?? []).filter(
            cs => selectedCurrencies.has(cs.currency) && selectedCategories.has(cs.category),
        ),
        [data?.spending_by_category, selectedCurrencies, selectedCategories],
    );

    // Filtered spending-by-date: when all categories selected use original data,
    // otherwise reconstruct from filtered category data
    const filteredSpendingByDate = useMemo((): CurrencySpending[] => {
        const allCatsSelected = availableCategories.length > 0
            && availableCategories.every(c => selectedCategories.has(c));

        if (allCatsSelected) {
            return (data?.spending_by_date ?? []).filter(cs => selectedCurrencies.has(cs.currency));
        }

        // Rebuild per-currency totals from filtered category time_series
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

    const handleCurrencyToggle = (currency: string) => {
        setSelectedCurrencies(prev => {
            const next = new Set(prev);
            if (next.has(currency)) next.delete(currency); else next.add(currency);
            return next;
        });
    };

    const handleCategoryToggle = (category: string) => {
        setSelectedCategories(prev => {
            const next = new Set(prev);
            if (next.has(category)) next.delete(category); else next.add(category);
            return next;
        });
    };

    const handlePeriodChange = (value: string) => {
        setPeriod(value);
        customDateRange.current = false;
        if (value === 'all' && data?.date_range) {
            const { min_month, max_month } = data.date_range;
            if (min_month) setStartMonth(min_month);
            if (max_month) setEndMonth(max_month);
        }
    };

    const handleStartMonthChange = (m: string) => { setStartMonth(m); setPeriod('all'); customDateRange.current = true; };
    const handleEndMonthChange = (m: string) => { setEndMonth(m); setPeriod('all'); customDateRange.current = true; };

    const handleDocTypeChange = (type: 'invoice' | 'income') => {
        setDocType(type);
        setStartMonth('');
        setEndMonth('');
        rangeInitialized.current = false;
        customDateRange.current = false;
    };

    const handleCurrencyChange = (cur: string) => {
        setDisplayCurrency(cur);
        setPreferredCurrency(cur);
    };

    return (
        <Layout
            pageTitle={t('dashboardTitle')}
            pageDescription={t('dashboardDescription')}
            headerActions={
                <div className="currency-selector">
                    <label className="currency-selector__label">{t('displayCurrency')}</label>
                    <select
                        className="currency-selector__select"
                        value={displayCurrency}
                        onChange={e => handleCurrencyChange(e.target.value)}
                    >
                        {DISPLAY_CURRENCIES.map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </div>
            }
        >
            <div className="dashboard">
                <div className="dashboard__toolbar">
                    <div className="dashboard__doc-type-toggle">
                        <button
                            className={`dashboard__doc-type-btn ${docType === 'invoice' ? 'dashboard__doc-type-btn--active dashboard__doc-type-btn--expense' : ''}`}
                            onClick={() => handleDocTypeChange('invoice')}
                        >
                            {t('dashboardExpenses')}
                        </button>
                        <button
                            className={`dashboard__doc-type-btn ${docType === 'income' ? 'dashboard__doc-type-btn--active dashboard__doc-type-btn--income' : ''}`}
                            onClick={() => handleDocTypeChange('income')}
                        >
                            {t('dashboardIncome')}
                        </button>
                    </div>
                    <PeriodSelector
                        period={period}
                        onPeriodChange={handlePeriodChange}
                        startMonth={startMonth}
                        endMonth={endMonth}
                        onStartMonthChange={handleStartMonthChange}
                        onEndMonthChange={handleEndMonthChange}
                        minMonth={data?.date_range?.min_month ?? null}
                        maxMonth={data?.date_range?.max_month ?? null}
                    />

                    <ChartFilters
                        currencies={availableCurrencies}
                        selectedCurrencies={selectedCurrencies}
                        onToggleCurrency={handleCurrencyToggle}
                    />
                </div>

                {availableCategories.length > 1 && (
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

                <div data-tutorial="charts">
                    <SpendingChart
                        data={filteredSpendingByDate}
                        loading={loading}
                        displayCurrency={displayCurrency}
                        title={docType === 'income' ? t('totalIncome') : undefined}
                    />
                </div>

                <CategoryChartsGrid categories={filteredSpendingByCategory} loading={loading} displayCurrency={displayCurrency} />

                <div className="dashboard__section">
                    <h3 className="dashboard__section-title">{t('quickActions')}</h3>
                    <div className="dashboard__actions">
                        <a href="/invoices" className="dashboard__action-card">
                            <div className="dashboard__action-content">
                                <h4>{t('expensesAction')}</h4>
                                <p>{t('expensesActionDesc')}</p>
                            </div>
                        </a>
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default Dashboard;
