/**
 * ChartFilters - Currency filter in collapsible dropdown.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useLang } from '../../../shared/i18n';

interface ChartFiltersProps {
    currencies: string[];
    selectedCurrencies: Set<string>;
    onToggleCurrency: (cur: string) => void;
}

const ChartFilters: React.FC<ChartFiltersProps> = ({
    currencies,
    selectedCurrencies,
    onToggleCurrency,
}) => {
    const { t } = useLang();
    const [open, setOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    if (currencies.length <= 1) return null;

    const curOff = currencies.length - selectedCurrencies.size;

    const toggleAll = () => {
        const allOn = currencies.every(c => selectedCurrencies.has(c));
        currencies.forEach(c => {
            if (allOn ? selectedCurrencies.has(c) : !selectedCurrencies.has(c)) onToggleCurrency(c);
        });
    };

    return (
        <div className="dashboard__currency-dropdown" ref={panelRef}>
            <button
                className={`dashboard__filter-toggle ${curOff > 0 ? 'dashboard__filter-toggle--active' : ''}`}
                onClick={() => setOpen(v => !v)}
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                <span>{t('filterCurrency')}</span>
                {curOff > 0 && <span className="dashboard__filter-badge">{curOff}</span>}
            </button>

            {open && (
                <div className="dashboard__filter-panel">
                    <div className="dashboard__filter-group">
                        <div className="dashboard__filter-group-header">
                            <span className="dashboard__filter-group-label">{t('filterCurrency')}</span>
                            <button className="dashboard__filter-group-all" onClick={toggleAll}>
                                {currencies.every(c => selectedCurrencies.has(c)) ? t('deselectAll') : t('selectAll')}
                            </button>
                        </div>
                        <div className="dashboard__filter-chips">
                            {currencies.map(cur => (
                                <button
                                    key={cur}
                                    className={`dashboard__filter-chip ${selectedCurrencies.has(cur) ? 'dashboard__filter-chip--on' : 'dashboard__filter-chip--off'}`}
                                    onClick={() => onToggleCurrency(cur)}
                                >
                                    <svg className="dashboard__filter-chip-icon" viewBox="0 0 16 16" width="12" height="12">
                                        {selectedCurrencies.has(cur)
                                            ? <path d="M2 8.5l4 4 8-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            : <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        }
                                    </svg>
                                    {cur}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChartFilters;
