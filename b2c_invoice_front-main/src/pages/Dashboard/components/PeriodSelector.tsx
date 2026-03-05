/**
 * PeriodSelector - Period quick buttons + month/year range dropdowns.
 */

import React, { useMemo } from 'react';
import { useLang } from '../../../shared/i18n';

const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

interface PeriodSelectorProps {
    period: string;
    onPeriodChange: (period: string) => void;
    startMonth: string;
    endMonth: string;
    onStartMonthChange: (month: string) => void;
    onEndMonthChange: (month: string) => void;
    minMonth: string | null;
    maxMonth: string | null;
}

const PERIOD_DEFS = [
    { value: 'all', labelKey: 'periodAll' },
    { value: '7d', labelKey: 'period1W' },
    { value: '30d', labelKey: 'period1M' },
    { value: '90d', labelKey: 'period3M' },
    { value: '1y', labelKey: 'period1Y' },
];

const buildYears = (minMonth: string | null, maxMonth: string | null): number[] => {
    const now = new Date();
    const minY = minMonth ? parseInt(minMonth.split('-')[0]) : now.getFullYear() - 2;
    const maxY = maxMonth ? parseInt(maxMonth.split('-')[0]) : now.getFullYear();
    const years: number[] = [];
    for (let y = minY; y <= maxY; y++) years.push(y);
    return years;
};

const MonthYearPicker: React.FC<{
    value: string;
    onChange: (v: string) => void;
    years: number[];
    label: string;
}> = ({ value, onChange, years, label }) => {
    const [year, month] = useMemo(() => {
        const parts = value.split('-');
        return [parseInt(parts[0]) || years[0] || 2026, parseInt(parts[1]) || 1];
    }, [value, years]);

    const handleMonthChange = (m: number) => {
        onChange(`${year}-${String(m).padStart(2, '0')}`);
    };
    const handleYearChange = (y: number) => {
        onChange(`${y}-${String(month).padStart(2, '0')}`);
    };

    return (
        <div className="dashboard__month-picker">
            <span className="dashboard__month-picker-label">{label}</span>
            <select
                className="dashboard__month-select"
                value={month}
                onChange={(e) => handleMonthChange(Number(e.target.value))}
            >
                {MONTHS.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                ))}
            </select>
            <select
                className="dashboard__year-select"
                value={year}
                onChange={(e) => handleYearChange(Number(e.target.value))}
            >
                {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                ))}
            </select>
        </div>
    );
};

const PeriodSelector: React.FC<PeriodSelectorProps> = ({
    period, onPeriodChange,
    startMonth, endMonth, onStartMonthChange, onEndMonthChange,
    minMonth, maxMonth,
}) => {
    const { t } = useLang();
    const years = useMemo(() => buildYears(minMonth, maxMonth), [minMonth, maxMonth]);

    return (
        <div className="dashboard__period-selector">
            <div className="dashboard__period-group">
                {PERIOD_DEFS.map((p) => (
                    <button
                        key={p.value}
                        className={`dashboard__period-btn ${period === p.value ? 'dashboard__period-btn--active' : ''}`}
                        onClick={() => onPeriodChange(p.value)}
                    >
                        {t(p.labelKey)}
                    </button>
                ))}
            </div>

            <div className="dashboard__date-range">
                <MonthYearPicker
                    label={t('periodFrom')}
                    value={startMonth}
                    onChange={onStartMonthChange}
                    years={years}
                />
                <span className="dashboard__date-separator">&mdash;</span>
                <MonthYearPicker
                    label={t('periodTo')}
                    value={endMonth}
                    onChange={onEndMonthChange}
                    years={years}
                />
            </div>
        </div>
    );
};

export default PeriodSelector;
