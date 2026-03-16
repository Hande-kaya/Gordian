/**
 * Bank Statements Column Definitions
 */

import React from 'react';
import { Column } from '../../shared/components';

export function getBankStatementColumns(
    formatCurrency: (amount?: number, currency?: string) => string,
    t: (key: string) => string,
    fmtDate: (value: string | Date | null | undefined) => string,
): Column[] {
    return [
        {
            key: 'filename',
            title: t('colFilename'),
            type: 'text',
            sortable: true,
            width: '180px',
            render: (value: string) => (
                <span title={value} className="filename-cell">{value}</span>
            ),
        },
        {
            key: 'bank_name',
            title: t('colBankName'),
            type: 'text',
            sortable: true,
            editable: true,
            width: '150px',
            render: (value: string) => value || '-',
        },
        {
            key: 'account_number',
            title: t('colAccountNumber'),
            type: 'text',
            sortable: true,
            width: '140px',
            render: (value: string) => {
                if (!value) return '-';
                // Show last 4 chars masked
                if (value.length > 4) {
                    return `***${value.slice(-4)}`;
                }
                return value;
            },
        },
        {
            key: 'statement_period',
            title: t('colStatementPeriod'),
            type: 'text',
            sortable: true,
            width: '180px',
            render: (_value: any, row: any) => {
                const start = row.statement_period_start;
                const end = row.statement_period_end;
                if (!start && !end) return '-';
                return `${start ? fmtDate(start) : '?'} — ${end ? fmtDate(end) : '?'}`;
            },
        },
        {
            key: 'opening_balance',
            title: t('colOpeningBalance'),
            type: 'number',
            sortable: true,
            editable: true,
            width: '140px',
            render: (value: number, row: any) =>
                formatCurrency(value, row.currency || ''),
        },
        {
            key: 'closing_balance',
            title: t('colClosingBalance'),
            type: 'number',
            sortable: true,
            editable: true,
            width: '140px',
            render: (value: number, row: any) =>
                formatCurrency(value, row.currency || ''),
        },
        {
            key: 'total_debits',
            title: t('colTotalDebits'),
            type: 'number',
            sortable: true,
            width: '130px',
            render: (value: number, row: any) =>
                formatCurrency(value, row.currency || ''),
        },
        {
            key: 'total_credits',
            title: t('colTotalCredits'),
            type: 'number',
            sortable: true,
            width: '130px',
            render: (value: number, row: any) =>
                formatCurrency(value, row.currency || ''),
        },
        {
            key: 'transaction_count',
            title: t('colTransactionCount'),
            type: 'number',
            sortable: true,
            width: '100px',
            render: (value: number) => (value > 0 ? value : '-'),
        },
        {
            key: 'created_at',
            title: t('colCreatedAt'),
            type: 'date',
            sortable: true,
            width: '100px',
            render: (value: string) => fmtDate(value),
        },
    ];
}
