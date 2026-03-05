import React from 'react';
import { Column } from './index';

export const renderDashboardCell = (
    column: Column,
    row: any,
    isEditing: boolean,
    pendingChanges: Record<string, any>,
    handleCellEdit: (id: string, field: string, value: any, row?: any) => void
) => {
    const id = row.id || row._id;
    const value = pendingChanges[`${id}::${column.key}`] ?? row[column.key];

    // EDIT MODE takes priority over custom render
    if (isEditing && column.editable) {
        // Custom edit renderer (e.g. amount + currency in one cell)
        if (column.editRender) {
            const editHandler = (field: string, val: any) => handleCellEdit(id, field, val, row);
            return column.editRender(value, row, editHandler, pendingChanges);
        }
        if (column.type === 'dropdown' && column.options) {
            return (
                <select
                    value={value || ''}
                    onChange={(e) => handleCellEdit(id, column.key, e.target.value, row)}
                    className="cell-input cell-select"
                >
                    <option value="">Select...</option>
                    {column.options.map((opt) =>
                        typeof opt === 'string' ? (
                            <option key={opt} value={opt}>{opt}</option>
                        ) : (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        )
                    )}
                </select>
            );
        }
        return (
            <input
                type={column.type === 'number' ? 'number' : 'text'}
                value={value || ''}
                onChange={(e) => handleCellEdit(id, column.key, e.target.value, row)}
                className="cell-input"
            />
        );
    }

    // DISPLAY MODE: custom render if provided
    if (column.render) return column.render(value, row);

    // Status badge - exact RFQ styling
    if (column.type === 'status') {
        const statusValue = String(value || '').toLowerCase().trim();
        let statusClass = 'status-default';

        if (statusValue === 'approved' || statusValue === 'matched' || statusValue === 'active') {
            statusClass = 'status-active';
        } else if (statusValue === 'pending') {
            statusClass = 'status-pending';
        } else if (statusValue === 'rejected' || statusValue === 'discrepancy' || statusValue === 'inactive') {
            statusClass = 'status-inactive';
        }

        return <span className={`status-badge ${statusClass}`}>{value || 'Pending'}</span>;
    }

    if (column.type === 'date' && value) {
        try {
            return new Date(value).toLocaleDateString();
        } catch {
            return value;
        }
    }

    return value ?? '—';
};
