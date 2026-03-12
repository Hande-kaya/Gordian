/**
 * CategoryPieChart - Donut chart for spending-by-category breakdown.
 * Features: hover percentage in center, summary table below.
 */

import React, { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, TooltipContentProps } from 'recharts';
import { useTheme } from '../../../context/ThemeContext';
import { useLang } from '../../../shared/i18n';

// ─── Constants ────────────────────────────────────────────────────────────────

const PIE_COLOR_KEYS = [
    '--pie-color-1', '--pie-color-2', '--pie-color-3', '--pie-color-4',
    '--pie-color-5', '--pie-color-6', '--pie-color-7', '--pie-color-8',
];

const OUTER_RADIUS = 110;
const INNER_RADIUS = 62;
const CHART_HEIGHT = 300;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PieSlice {
    name: string;
    value: number;
    percentage: number;
}


interface CategoryPieChartProps {
    data: PieSlice[];
    displayCurrency: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const resolvePieColors = (): string[] => {
    const style = getComputedStyle(document.documentElement);
    return PIE_COLOR_KEYS.map(key => style.getPropertyValue(key).trim());
};

const formatAmount = (value: number, currency: string): string =>
    value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;

// ─── Sub-components ───────────────────────────────────────────────────────────

const renderTooltip = () =>
    ({ active, payload }: TooltipContentProps<number, string>) => {
        if (!active || !payload?.length) return null;
        return (
            <div className="dashboard__chart-tooltip">
                <div className="dashboard__chart-tooltip-label">{(payload[0].payload as PieSlice).name}</div>
            </div>
        );
    };

interface CenterLabelProps {
    active: PieSlice | null;
}

const CenterLabel: React.FC<CenterLabelProps> = ({ active }) => {
    if (!active) return null;
    return (
        <div className="dashboard__pie-center">
            <span className="dashboard__pie-center-pct">{active.percentage.toFixed(1)}%</span>
            <span className="dashboard__pie-center-name">{active.name}</span>
        </div>
    );
};

interface SummaryTableProps {
    data: PieSlice[];
    colors: string[];
    displayCurrency: string;
    activeIndex: number | null;
    onHover: (index: number | null) => void;
    t: (key: string) => string;
}

const SummaryTable: React.FC<SummaryTableProps> = ({ data, colors, displayCurrency, activeIndex, onHover, t }) => {
    const total = data.reduce((sum, s) => sum + s.value, 0);
    return (
        <table className="dashboard__pie-table">
            <thead>
                <tr>
                    <th />
                    <th className="dashboard__pie-table-col--amount">{t('pieAmountCol')}</th>
                    <th className="dashboard__pie-table-col--pct">{t('pieShareCol')}</th>
                </tr>
            </thead>
            <tbody>
                {data.map((slice, i) => (
                    <tr
                        key={slice.name}
                        className={`dashboard__pie-table-row${activeIndex === i ? ' dashboard__pie-table-row--active' : ''}`}
                        onMouseEnter={() => onHover(i)}
                        onMouseLeave={() => onHover(null)}
                    >
                        <td className="dashboard__pie-table-col--category">
                            <span className="dashboard__pie-table-dot" style={{ backgroundColor: colors[i % colors.length] }} />
                            {slice.name}
                        </td>
                        <td className="dashboard__pie-table-col--amount">{formatAmount(slice.value, displayCurrency)}</td>
                        <td className="dashboard__pie-table-col--pct">{slice.percentage.toFixed(1)}%</td>
                    </tr>
                ))}
                <tr className="dashboard__pie-table-row--total">
                    <td className="dashboard__pie-table-col--category">
                        <span className="dashboard__pie-table-dot" style={{ visibility: 'hidden' }} />
                        <strong>{t('pieTotal')}</strong>
                    </td>
                    <td className="dashboard__pie-table-col--amount">
                        <strong>{formatAmount(total, displayCurrency)}</strong>
                    </td>
                    <td className="dashboard__pie-table-col--pct" />
                </tr>
            </tbody>
        </table>
    );
};

// ─── Component ────────────────────────────────────────────────────────────────

const CategoryPieChart: React.FC<CategoryPieChartProps> = ({ data, displayCurrency }) => {
    useTheme(); // ensures re-render on theme change
    const pieColors = resolvePieColors();
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const activeSlice = activeIndex !== null ? data[activeIndex] : null;
    const { t } = useLang();

    return (
        <div className="dashboard__pie-wrapper">
            <div className="dashboard__pie-chart-area">
                <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
                    <PieChart>
                        <Pie
                            data={data}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={OUTER_RADIUS}
                            innerRadius={INNER_RADIUS}
                            onMouseEnter={(_, index) => setActiveIndex(index)}
                            onMouseLeave={() => setActiveIndex(null)}
                        >
                            {data.map((_, i) => (
                                <Cell
                                    key={i}
                                    fill={pieColors[i % pieColors.length]}
                                    opacity={activeIndex === null || activeIndex === i ? 1 : 0.4}
                                    stroke="none"
                                />
                            ))}
                        </Pie>
                        <Tooltip content={renderTooltip()} />
                    </PieChart>
                </ResponsiveContainer>
                <CenterLabel active={activeSlice} />
            </div>
            <SummaryTable
                data={data}
                colors={pieColors}
                displayCurrency={displayCurrency}
                activeIndex={activeIndex}
                onHover={setActiveIndex}
                t={t}
            />
        </div>
    );
};

export default CategoryPieChart;