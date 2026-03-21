/**
 * CurrencySelect
 * ==============
 * Custom styled dropdown for the "Show values in" currency selector.
 * Matches the period-btn active styling: gray container, green selected value.
 */

import React, { useState, useRef, useEffect } from 'react';

interface CurrencySelectProps {
    value: string;
    options: string[];
    onChange: (currency: string) => void;
}

const CurrencySelect: React.FC<CurrencySelectProps> = ({ value, options, onChange }) => {
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (currency: string) => {
        onChange(currency);
        setOpen(false);
    };

    return (
        <div className="currency-select" ref={wrapperRef}>
            <button
                className="currency-select__trigger"
                onClick={() => setOpen(prev => !prev)}
                type="button"
            >
                <span className="currency-select__value">{value}</span>
                <svg className="currency-select__arrow" viewBox="0 0 10 6" width="10" height="6">
                    <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
            {open && (
                <ul className="currency-select__list">
                    {options.map(c => (
                        <li
                            key={c}
                            className={`currency-select__option${c === value ? ' currency-select__option--active' : ''}`}
                            onClick={() => handleSelect(c)}
                        >
                            {c}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default CurrencySelect;