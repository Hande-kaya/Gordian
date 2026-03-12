/**
 * SpendingChart - Single bar chart with all amounts converted to display currency.
 * Theme-aware: reads CSS custom properties for dark mode support.
 */

import React, { useMemo } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { CurrencySpending } from '../../../services/statsApi';
import { convertCurrency } from '../../../utils/currency';
import { useTheme } from '../../../context/ThemeContext';
import { useLang } from '../../../shared/i18n';

interface SpendingChartProps {
    data: CurrencySpending[];
    loading: boolean;
    displayCurrency: string;
    title?: string;
    barColor?: string;
}

const formatShortAmount = (value: number): string => {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return value.toFixed(0);
};

const formatDate = (dateStr: string): string => {
    if (dateStr.length === 4) return dateStr;
    if (dateStr.length === 7) {
        const [y, m] = dateStr.split('-');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[parseInt(m, 10) - 1]} ${y.slice(2)}`;
    }
    const parts = dateStr.split('-');
    return `${parts[2]}/${parts[1]}`;
};

const formatAmount = (value: number, currency: string): string =>
    value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;

const SpendingChart: React.FC<SpendingChartProps> = ({ data, loading, displayCurrency, title, barColor: barColorProp }) => {
    const { resolvedTheme } = useTheme();
    const { t } = useLang();
    const isDark = resolvedTheme === 'dark';
    const barColor = barColorProp || (isDark ? '#60a5fa' : '#3b82f6');
    const gridColor = isDark ? '#3a3a3a' : '#e5e7eb';
    const axisColor = isDark ? '#707070' : '#9ca3af';

    const chartData = useMemo(() => {
        const dateMap: Record<string, number> = {};

        for (const cs of data) {
            for (const point of cs.time_series) {
                const converted = convertCurrency(point.total, cs.currency, displayCurrency) ?? point.total;
                dateMap[point.date] = (dateMap[point.date] || 0) + converted;
            }
        }

        const dates = Object.keys(dateMap).sort();
        if (dates.length < 2) {
            return dates.map(d => ({ date: formatDate(d), amount: dateMap[d] }));
        }

        // Fill gaps between min and max date
        const len = dates[0].length;
        const isYearly = len === 4;  // "YYYY"
        const isMonthly = len === 7; // "YYYY-MM"
        const allDates: string[] = [];

        if (isYearly) {
            const sy = Number(dates[0]);
            const ey = Number(dates[dates.length - 1]);
            for (let y = sy; y <= ey; y++) allDates.push(String(y));
        } else if (isMonthly) {
            const [sy, sm] = dates[0].split('-').map(Number);
            const [ey, em] = dates[dates.length - 1].split('-').map(Number);
            let y = sy, m = sm;
            while (y < ey || (y === ey && m <= em)) {
                allDates.push(`${y}-${String(m).padStart(2, '0')}`);
                m++;
                if (m > 12) { m = 1; y++; }
            }
        } else {
            const cur = new Date(dates[0] + 'T00:00:00');
            const end = new Date(dates[dates.length - 1] + 'T00:00:00');
            while (cur <= end) {
                const yy = cur.getFullYear();
                const mm = String(cur.getMonth() + 1).padStart(2, '0');
                const dd = String(cur.getDate()).padStart(2, '0');
                allDates.push(`${yy}-${mm}-${dd}`);
                cur.setDate(cur.getDate() + 1);
            }
        }

        return allDates.map(d => ({ date: formatDate(d), amount: dateMap[d] || 0 }));
    }, [data, displayCurrency]);

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload?.length || !payload[0].value) return null;
        return (
            <div className="dashboard__chart-tooltip">
                <div className="dashboard__chart-tooltip-label">{label}</div>
                <div className="dashboard__chart-tooltip-row">
                    <span className="dashboard__chart-tooltip-dot" style={{ backgroundColor: barColor }} />
                    <span>{formatAmount(payload[0].value, displayCurrency)}</span>
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="dashboard__section">
                <h3 className="dashboard__section-title">{title || t('totalSpending')}</h3>
                <div className="dashboard__chart-placeholder">Loading...</div>
            </div>
        );
    }

    if (!chartData.length) {
        return (
            <div className="dashboard__section">
                <h3 className="dashboard__section-title">{title || t('totalSpending')}</h3>
                <div className="dashboard__chart-placeholder">No spending data for this period</div>
            </div>
        );
    }

    return (
        <div className="dashboard__section">
            <div className="dashboard__section-header">
                <h3 className="dashboard__section-title">{title || t('totalSpending')}</h3>
                <span className="dashboard__section-subtitle">{displayCurrency}</span>
            </div>
            <div className="dashboard__chart-container">
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }} maxBarSize={32}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                        <XAxis dataKey="date" tick={{ fontSize: 12, fill: axisColor }} stroke={gridColor} />
                        <YAxis tickFormatter={formatShortAmount} tick={{ fontSize: 12, fill: axisColor }} stroke={gridColor} />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />
                        <Bar dataKey="amount" fill={barColor} radius={[4, 4, 0, 0]} minPointSize={2} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default SpendingChart;
