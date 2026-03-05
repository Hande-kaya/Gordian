/**
 * Invoice List Column Definitions
 * Copied from invoice-management.
 */

import React from 'react';
import { Column } from '../../shared/components';
import { convertCurrency, SUPPORTED_CURRENCIES } from '../../utils/currency';
import { ExpenseCategory } from '../../services/documentApi';

/** Parse date string that may be DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD, or ISO */
const parseDate = (value: string): Date | null => {
    if (!value) return null;
    // DD-MM-YYYY or DD.MM.YYYY (with optional time)
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

const formatDateValue = (value: string): string => {
    if (!value) return '-';
    const d = parseDate(value);
    return d ? d.toLocaleDateString('tr-TR') : value;
};

/** Convert any date string to YYYY-MM-DD for <input type="date"> */
const toIsoDate = (value: string): string => {
    if (!value) return '';
    const d = parseDate(value);
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

export function getInvoiceColumns(
    formatCurrency: (amount?: number, currency?: string) => string,
    t: (key: string) => string,
    targetCurrency?: string,
    categories?: ExpenseCategory[],
    getLabelByKey?: (key: string) => string
): Column[] {
    return [
        // === Visible columns (user-requested order) ===
        {
            key: 'filename',
            title: t('colFilename'),
            type: 'text',
            sortable: true,
            width: '200px',
            render: (value: string) => (
                <span title={value} className="filename-cell">{value}</span>
            )
        },
        {
            key: 'vendor_name',
            title: t('colSupplier'),
            type: 'text',
            sortable: true,
            editable: true,
            width: '180px',
            render: (value: string) => <span title={value || '-'}>{value || '-'}</span>
        },
        {
            key: 'total_amount',
            title: t('colTotalAmount'),
            type: 'number',
            sortable: true,
            editable: true,
            width: '180px',
            render: (value: number, row: any) => {
                const fromCurr = row.currency || row.extracted_data?.financials?.currency || row.extracted_data?.currency || '';
                return formatCurrency(value, fromCurr);
            },
            editRender: (value: any, row: any, handleEdit: (field: string, val: any) => void, pending: Record<string, any>) => {
                const id = row.id || row._id;
                const curVal = pending[`${id}::currency`] ?? row.currency ?? '';
                return (
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <input
                            type="text"
                            value={value ?? ''}
                            onChange={e => handleEdit('total_amount', e.target.value)}
                            className="cell-input"
                            style={{ flex: 1, minWidth: 0 }}
                        />
                        <select
                            value={curVal}
                            onChange={e => handleEdit('currency', e.target.value)}
                            className="cell-input cell-select"
                            style={{ width: '72px', flex: 'none' }}
                        >
                            <option value="">—</option>
                            {SUPPORTED_CURRENCIES.map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>
                );
            }
        },
        {
            key: 'converted_amount',
            title: targetCurrency ? `${t('colConvertedAmount')} (${targetCurrency})` : t('colConvertedAmount'),
            type: 'number',
            sortable: true,
            width: '180px',
            render: (value: number, row: any) => {
                const fromCurr = row.currency || row.extracted_data?.financials?.currency || row.extracted_data?.currency || '';
                if (!targetCurrency || fromCurr.toUpperCase() === targetCurrency.toUpperCase()) {
                    return formatCurrency(value, fromCurr);
                }
                return formatCurrency(value, targetCurrency);
            }
        },
        {
            key: 'line_items_count',
            title: t('colLineItems'),
            type: 'number',
            sortable: true,
            width: '100px',
            render: (value: number) => value > 0 ? value : '-'
        },
        {
            key: 'expense_category',
            title: t('colExpenseCategory'),
            type: 'dropdown',
            sortable: true,
            filterable: true,
            editable: true,
            width: '140px',
            options: (categories || []).map((cat) => ({
                value: cat.key,
                label: getLabelByKey ? getLabelByKey(cat.key) : cat.labels.en
            })),
            render: (value: string) => {
                const label = value && getLabelByKey ? getLabelByKey(value) : (value || '-');
                return <span className={`category-badge category-${value || 'other'}`}>{label}</span>;
            }
        },
        {
            key: 'invoice_date',
            title: t('colExpenseDate'),
            type: 'text',
            sortable: true,
            editable: true,
            width: '140px',
            render: (value: string) => formatDateValue(value),
            editRender: (value: any, _row: any, handleEdit: (field: string, val: any) => void) => (
                <input
                    type="date"
                    value={toIsoDate(String(value || ''))}
                    onChange={e => handleEdit('invoice_date', e.target.value)}
                    className="cell-input"
                />
            )
        },
        {
            key: 'invoice_number',
            title: t('colInvoiceNumber'),
            type: 'text',
            sortable: true,
            editable: true,
            width: '120px',
            render: (value: string) => value || '-'
        },
        {
            key: 'created_at',
            title: t('colCreatedAt'),
            type: 'date',
            sortable: true,
            width: '100px',
            render: (value: string) => formatDateValue(value)
        },
        // === Hidden columns ===
        {
            key: 'supplier_tax_id',
            title: t('colTaxId'),
            type: 'text',
            sortable: true,
            editable: true,
            width: '120px',
            defaultHidden: true,
            render: (value: string) => value || '-'
        },
        {
            key: 'supplier_address',
            title: t('colAddress'),
            type: 'text',
            sortable: true,
            editable: true,
            width: '200px',
            defaultHidden: true,
            render: (value: string) => <span title={value || '-'}>{value || '-'}</span>
        },
        {
            key: 'due_date',
            title: t('colDueDate'),
            type: 'text',
            sortable: true,
            editable: true,
            width: '140px',
            defaultHidden: true,
            render: (value: string) => formatDateValue(value),
            editRender: (value: any, _row: any, handleEdit: (field: string, val: any) => void) => (
                <input
                    type="date"
                    value={toIsoDate(String(value || ''))}
                    onChange={e => handleEdit('due_date', e.target.value)}
                    className="cell-input"
                />
            )
        },
        {
            key: 'total_tax_amount',
            title: t('colTax'),
            type: 'number',
            sortable: true,
            editable: true,
            width: '110px',
            render: (value: number, row: any) => {
                const fromCurr = row.extracted_data?.financials?.currency || row.extracted_data?.currency || '';
                if (!targetCurrency || fromCurr.toUpperCase() === targetCurrency.toUpperCase()) {
                    return formatCurrency(value, fromCurr);
                }
                const converted = convertCurrency(value, fromCurr, targetCurrency);
                return formatCurrency(converted ?? value, targetCurrency);
            }
        },
        {
            key: 'net_amount',
            title: t('colNetAmount'),
            type: 'number',
            sortable: true,
            editable: true,
            width: '120px',
            defaultHidden: true,
            render: (value: number, row: any) => {
                const fromCurr = row.extracted_data?.financials?.currency || row.extracted_data?.currency || '';
                if (!targetCurrency || fromCurr.toUpperCase() === targetCurrency.toUpperCase()) {
                    return formatCurrency(value, fromCurr);
                }
                const converted = convertCurrency(value, fromCurr, targetCurrency);
                return formatCurrency(converted ?? value, targetCurrency);
            }
        },
    ];
}
