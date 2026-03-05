import { useState, useEffect, useMemo } from 'react';
import { Column } from './index';

export const useColumnSettings = (collection: string, columns: Column[]) => {
    const [columnOrder, setColumnOrder] = useState<string[]>([]);
    const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (columns.length > 0) {
            const storageKey = `column_order_${collection}`;
            const visibilityKey = `column_visibility_${collection}`;

            const savedOrder = localStorage.getItem(storageKey);
            const savedVisibility = localStorage.getItem(visibilityKey);

            if (savedOrder && savedVisibility) {
                try {
                    const parsedOrder = JSON.parse(savedOrder);
                    const parsedVisibility = JSON.parse(savedVisibility);
                    const validOrder = parsedOrder.filter((key: string) =>
                        columns.some((col) => col.key === key)
                    );
                    columns.forEach((col) => {
                        if (!validOrder.includes(col.key)) validOrder.push(col.key);
                        if (!(col.key in parsedVisibility)) parsedVisibility[col.key] = !col.defaultHidden;
                    });
                    setColumnOrder(validOrder);
                    setColumnVisibility(parsedVisibility);
                } catch {
                    setColumnOrder(columns.map((col) => col.key));
                    setColumnVisibility(columns.reduce((acc, col) => ({ ...acc, [col.key]: !col.defaultHidden }), {}));
                }
            } else {
                setColumnOrder(columns.map((col) => col.key));
                setColumnVisibility(columns.reduce((acc, col) => ({ ...acc, [col.key]: !col.defaultHidden }), {}));
            }
        }
    }, [columns, collection]);

    useEffect(() => {
        if (columnOrder.length > 0) {
            localStorage.setItem(`column_order_${collection}`, JSON.stringify(columnOrder));
        }
    }, [columnOrder, collection]);

    useEffect(() => {
        if (Object.keys(columnVisibility).length > 0) {
            localStorage.setItem(`column_visibility_${collection}`, JSON.stringify(columnVisibility));
        }
    }, [columnVisibility, collection]);

    return { columnOrder, setColumnOrder, columnVisibility, setColumnVisibility };
};

export const useFilteredData = (
    data: any[],
    columns: Column[],
    columnFilters: Record<string, string>,
    searchTerm: string,
    sortConfig: { key: string; direction: 'asc' | 'desc' } | null,
    onDataFetch?: any
) => {
    return useMemo(() => {
        // Always apply local filtering/sorting on the data we have
        // Backend fetch is for pagination, local filtering enhances it
        let result = [...data];

        // Parse date string: DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD, or ISO
        const tryParseDate = (val: string): Date | null => {
            if (!val) return null;
            const euMatch = val.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/);
            if (euMatch) {
                const [, day, month, year] = euMatch;
                const d = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
                if (!isNaN(d.getTime())) return d;
            }
            const d = new Date(val);
            return isNaN(d.getTime()) ? null : d;
        };

        // Helper to stringify all values in an object recursively
        const getAllValues = (obj: any): string => {
            if (obj === null || obj === undefined) return '';
            if (typeof obj !== 'object') return String(obj);
            return Object.values(obj).map(v => getAllValues(v)).join(' ');
        };

        // Column filters - search in specific column values
        if (Object.keys(columnFilters).length > 0) {
            const hasAnyFilter = Object.values(columnFilters).some(v => v);
            if (hasAnyFilter) {
                result = result.filter((item) => {
                    return Object.entries(columnFilters).every(([key, filterValue]) => {
                        if (!filterValue) return true;

                        // Get the column value
                        const columnValue = item[key];

                        // Find column definition to check type
                        const column = columns.find(c => c.key === key);

                        // Convert to string for comparison - handle dates specially
                        let valueStr = '';
                        if (columnValue !== null && columnValue !== undefined) {
                            const raw = String(columnValue);
                            // Try to parse as date (for 'date' type OR text values that look like dates)
                            const parsed = tryParseDate(raw);
                            if (parsed && (column?.type === 'date' || /\d{1,4}[.\-/]\d{1,2}[.\-/]\d{1,4}/.test(raw))) {
                                const trFormat = parsed.toLocaleDateString('tr-TR');
                                const usFormat = parsed.toLocaleDateString('en-US');
                                const isoFormat = parsed.toISOString().slice(0, 10);
                                valueStr = `${trFormat} ${usFormat} ${isoFormat} ${raw}`.toLowerCase();
                            } else {
                                valueStr = raw.toLowerCase();
                            }
                        }

                        const filterLower = filterValue.toLowerCase();
                        if (valueStr.includes(filterLower)) return true;
                        // Strip thousand separators: "3.554" → "3554"
                        if (column?.type === 'number') {
                            const filterNoDots = filterLower.replace(/\./g, '').replace(/,/g, '.');
                            if (filterNoDots !== filterLower && valueStr.includes(filterNoDots)) return true;
                        }
                        return false;
                    });
                });
            }
        }

        // Global search - search in all stringified values
        if (searchTerm) {
            // Strip thousand separators from search term so "3.554" matches raw "3554"
            const term = searchTerm.toLowerCase();
            const termNoDots = term.replace(/\./g, '').replace(/,/g, '.');
            result = result.filter((item) => {
                const allText = getAllValues(item).toLowerCase();
                // Match either raw text OR with stripped separators
                if (allText.includes(term)) return true;
                if (termNoDots !== term && allText.includes(termNoDots)) return true;
                return false;
            });
        }

        // Sorting
        if (sortConfig) {
            result.sort((a, b) => {
                const aVal = sortConfig.key.includes('.')
                    ? sortConfig.key.split('.').reduce((obj, k) => obj?.[k], a)
                    : a[sortConfig.key];
                const bVal = sortConfig.key.includes('.')
                    ? sortConfig.key.split('.').reduce((obj, k) => obj?.[k], b)
                    : b[sortConfig.key];
                if (aVal === bVal) return 0;
                if (aVal == null) return 1;
                if (bVal == null) return -1;
                const cmp = aVal < bVal ? -1 : 1;
                return sortConfig.direction === 'asc' ? cmp : -cmp;
            });
        }

        return result;
    }, [data, columnFilters, searchTerm, sortConfig, columns]);
};
