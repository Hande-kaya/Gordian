/**
 * CategoryChart - Single category card with consolidated bar in display currency.
 */

import React, { useMemo } from 'react';
import { BarChart, Bar, ResponsiveContainer, Tooltip } from 'recharts';
import { CategorySpending } from '../../../services/statsApi';
import { convertCurrency } from '../../../utils/currency';
import { useTheme } from '../../../context/ThemeContext';
import { useCategories } from '../../../context/CategoryContext';

interface CategoryChartProps {
    categoryName: string;
    series: CategorySpending[];
    displayCurrency: string;
    convertedTotal: number;
}

const formatAmount = (value: number, currency: string): string =>
    value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;

const CategoryChart: React.FC<CategoryChartProps> = ({ categoryName, series, displayCurrency, convertedTotal }) => {
    const { resolvedTheme } = useTheme();
    const { getLabelByKey } = useCategories();
    const isDark = resolvedTheme === 'dark';
    const barColor = isDark ? '#60a5fa' : '#3b82f6';
    const label = getLabelByKey(categoryName);

    const chartData = useMemo(() => {
        const dateMap: Record<string, number> = {};

        for (const cs of series) {
            for (const point of cs.time_series) {
                const converted = convertCurrency(point.total, cs.currency, displayCurrency) ?? point.total;
                dateMap[point.date] = (dateMap[point.date] || 0) + converted;
            }
        }

        return Object.keys(dateMap).sort().map((date) => ({
            date,
            amount: dateMap[date],
        }));
    }, [series, displayCurrency]);

    const MiniTooltip = ({ active, payload }: any) => {
        if (!active || !payload?.length || !payload[0].value) return null;
        return (
            <div className="dashboard__chart-tooltip">
                <div className="dashboard__chart-tooltip-row">
                    <span className="dashboard__chart-tooltip-dot" style={{ backgroundColor: barColor }} />
                    <span>{formatAmount(payload[0].value, displayCurrency)}</span>
                </div>
            </div>
        );
    };

    return (
        <div className="dashboard__category-card">
            <div className="dashboard__category-header">
                <span className="dashboard__category-name">{label}</span>
                <span className="dashboard__category-cur">
                    {formatAmount(convertedTotal, displayCurrency)}
                </span>
            </div>
            <div className="dashboard__category-chart">
                <ResponsiveContainer width="100%" height={80}>
                    <BarChart data={chartData} maxBarSize={12}>
                        <Tooltip content={<MiniTooltip />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />
                        <Bar dataKey="amount" fill={barColor} radius={[2, 2, 0, 0]} minPointSize={2} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default CategoryChart;
