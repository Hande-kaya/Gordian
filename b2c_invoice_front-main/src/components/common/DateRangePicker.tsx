/**
 * DateRangePicker — reusable from/to month-year range picker.
 *
 * Usage:
 *   <DateRangePicker
 *     from={dateFrom}
 *     to={dateTo}
 *     years={[2023, 2024, 2025, 2026]}
 *     onChange={(from, to) => { ... }}
 *   />
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useLang } from '../../shared/i18n';
import './DateRangePicker.scss';

export interface DateRangeValue {
    month: number; // 1-12
    year: number;
}

interface DateRangePickerProps {
    from: DateRangeValue | null;
    to: DateRangeValue | null;
    years?: number[];
    onChange: (from: DateRangeValue | null, to: DateRangeValue | null) => void;
}

const MONTH_KEYS = [
    'monthJan','monthFeb','monthMar','monthApr','monthMay','monthJun',
    'monthJul','monthAug','monthSep','monthOct','monthNov','monthDec',
];

const DateRangePicker: React.FC<DateRangePickerProps> = ({ from, to, years, onChange }) => {
    const { t } = useLang();
    const currentYear = new Date().getFullYear();
    const yearList = years && years.length > 0 ? years : [currentYear];

    const [open, setOpen] = useState(false);
    const [pendingFrom, setPendingFrom] = useState<DateRangeValue | null>(from);
    const [pendingTo, setPendingTo] = useState<DateRangeValue | null>(to);
    const wrapRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handle = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, [open]);

    const openPicker = useCallback(() => {
        setPendingFrom(from);
        setPendingTo(to);
        setOpen(true);
    }, [from, to]);

    const handleApply = useCallback(() => {
        onChange(pendingFrom, pendingTo);
        setOpen(false);
    }, [pendingFrom, pendingTo, onChange]);

    const handleClear = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        onChange(null, null);
    }, [onChange]);

    const hasRange = from !== null || to !== null;

    const label = useMemo(() => {
        if (!from && !to) return t('dateRange');
        const fmtPart = (d: DateRangeValue) => `${t(MONTH_KEYS[d.month - 1])} ${d.year}`;
        if (from && to) return `${fmtPart(from)} – ${fmtPart(to)}`;
        if (from) return `${fmtPart(from)} →`;
        return `→ ${fmtPart(to!)}`;
    }, [from, to, t]);

    return (
        <div className="date-range-picker" ref={wrapRef}>
            <button
                className={`date-range-picker__btn${hasRange ? ' date-range-picker__btn--active' : ''}`}
                onClick={() => open ? setOpen(false) : openPicker()}
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                {label}
                {hasRange && (
                    <span className="date-range-picker__clear" onClick={handleClear}>&times;</span>
                )}
            </button>
            {open && (
                <div className="date-range-picker__dropdown">
                    {/* From row */}
                    <div className="date-range-picker__row">
                        <span className="date-range-picker__label">{t('dateFrom')}</span>
                        <select
                            className="date-range-picker__select"
                            value={pendingFrom ? pendingFrom.month : ''}
                            onChange={e => {
                                const m = Number(e.target.value);
                                if (m) setPendingFrom(prev => ({ month: m, year: prev?.year || currentYear }));
                                else setPendingFrom(null);
                            }}
                        >
                            <option value="">—</option>
                            {MONTH_KEYS.map((mk, i) => (
                                <option key={i} value={i + 1}>{t(mk)}</option>
                            ))}
                        </select>
                        <select
                            className="date-range-picker__select"
                            value={pendingFrom ? pendingFrom.year : ''}
                            onChange={e => {
                                const y = Number(e.target.value);
                                if (y) setPendingFrom(prev => ({ month: prev?.month || 1, year: y }));
                                else setPendingFrom(null);
                            }}
                        >
                            <option value="">—</option>
                            {yearList.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    {/* To row */}
                    <div className="date-range-picker__row">
                        <span className="date-range-picker__label">{t('dateTo')}</span>
                        <select
                            className="date-range-picker__select"
                            value={pendingTo ? pendingTo.month : ''}
                            onChange={e => {
                                const m = Number(e.target.value);
                                if (m) setPendingTo(prev => ({ month: m, year: prev?.year || currentYear }));
                                else setPendingTo(null);
                            }}
                        >
                            <option value="">—</option>
                            {MONTH_KEYS.map((mk, i) => (
                                <option key={i} value={i + 1}>{t(mk)}</option>
                            ))}
                        </select>
                        <select
                            className="date-range-picker__select"
                            value={pendingTo ? pendingTo.year : ''}
                            onChange={e => {
                                const y = Number(e.target.value);
                                if (y) setPendingTo(prev => ({ month: prev?.month || 12, year: y }));
                                else setPendingTo(null);
                            }}
                        >
                            <option value="">—</option>
                            {yearList.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    {/* Apply */}
                    <button className="date-range-picker__apply" onClick={handleApply}>
                        {t('filterApply')}
                    </button>
                </div>
            )}
        </div>
    );
};

export default DateRangePicker;
