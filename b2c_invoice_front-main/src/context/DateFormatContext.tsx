/**
 * DateFormatContext - Manages user date display format preference.
 *
 * Reads from localStorage for fast hydration.
 * Provides fmtDate() universal formatter that respects the chosen format.
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useLang } from '../shared/i18n';

export type DateFormat = 'eu' | 'us' | 'iso' | 'short';

interface DateFormatContextType {
    dateFormat: DateFormat;
    setDateFormat: (fmt: DateFormat) => void;
    fmtDate: (value: string | Date | null | undefined) => string;
}

const DateFormatContext = createContext<DateFormatContextType | undefined>(undefined);

export const useDateFormat = (): DateFormatContextType => {
    const context = useContext(DateFormatContext);
    if (!context) throw new Error('useDateFormat must be used within a DateFormatProvider');
    return context;
};

const STORAGE_KEY = 'app_date_format';
const VALID_FORMATS: DateFormat[] = ['eu', 'us', 'iso', 'short'];

/** Parse various date string formats into a Date object */
const parseAnyDate = (value: string): Date | null => {
    if (!value) return null;

    // DD-MM-YYYY or DD.MM.YYYY or DD/MM/YYYY (with optional time)
    const euMatch = value.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(.*)$/);
    if (euMatch) {
        const [, day, month, year, rest] = euMatch;
        const timeStr = rest?.trim() || '00:00';
        const d = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timeStr}`);
        if (!isNaN(d.getTime())) return d;
    }

    // Standard formats (ISO, YYYY-MM-DD, etc.)
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
};

const pad = (n: number): string => String(n).padStart(2, '0');

export const DateFormatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { lang } = useLang();

    const [dateFormat, setDateFormatState] = useState<DateFormat>(() => {
        const saved = localStorage.getItem(STORAGE_KEY) as DateFormat | null;
        return saved && VALID_FORMATS.includes(saved) ? saved : 'eu';
    });

    const setDateFormat = useCallback((fmt: DateFormat) => {
        setDateFormatState(fmt);
        localStorage.setItem(STORAGE_KEY, fmt);
    }, []);

    const fmtDate = useCallback((value: string | Date | null | undefined): string => {
        if (value == null || value === '') return '-';

        const d = value instanceof Date ? value : parseAnyDate(String(value));
        if (!d) return String(value);

        const day = pad(d.getDate());
        const month = pad(d.getMonth() + 1);
        const year = d.getFullYear();

        switch (dateFormat) {
            case 'eu':
                return `${day}.${month}.${year}`;
            case 'us':
                return `${month}/${day}/${year}`;
            case 'iso':
                return `${year}-${month}-${day}`;
            case 'short': {
                const locale = lang === 'tr' ? 'tr-TR' : lang === 'de' ? 'de-DE' : 'en-US';
                const monthName = d.toLocaleDateString(locale, { month: 'short' });
                return `${d.getDate()} ${monthName} ${year}`;
            }
            default:
                return `${day}.${month}.${year}`;
        }
    }, [dateFormat, lang]);

    return (
        <DateFormatContext.Provider value={{ dateFormat, setDateFormat, fmtDate }}>
            {children}
        </DateFormatContext.Provider>
    );
};
