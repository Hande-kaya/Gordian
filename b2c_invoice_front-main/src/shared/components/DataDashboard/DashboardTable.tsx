import React from 'react';
import { useLang } from '../../i18n';
import { Column } from './index';

interface DashboardTableProps {
    data: any[];
    columns: Column[];
    selectedItems: string[];
    onSelectAll: () => void;
    onSelectItem: (id: string) => void;
    onRowClick?: (item: any) => void;
    onSort: (key: string) => void;
    sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
    columnFilters: Record<string, string>;
    onColumnFilter: (key: string, value: string) => void;
    draggedColumn: string | null;
    onDragStart: (e: React.DragEvent, key: string) => void;
    onDrop: (e: React.DragEvent, key: string) => void;
    isEditing: boolean;
    showSelection: boolean;
    isLoading: boolean;
    error?: string | null;
    showAddButton: boolean;
    onAdd?: () => void;
    addButtonLabel: string;
    renderCell: (column: Column, row: any) => React.ReactNode;
}

const DashboardTable: React.FC<DashboardTableProps> = ({
    data,
    columns,
    selectedItems,
    onSelectAll,
    onSelectItem,
    onRowClick,
    onSort,
    sortConfig,
    columnFilters,
    onColumnFilter,
    draggedColumn,
    onDragStart,
    onDrop,
    isEditing,
    showSelection,
    isLoading,
    error,
    showAddButton,
    onAdd,
    addButtonLabel,
    renderCell
}) => {
    const { t } = useLang();
    const allSelected = data.length > 0 && selectedItems.length === data.length;

    // Always show the table structure - empty/error states go in tbody
    return (
        <div className="data-table-container">
            {/* Loading overlay - shows on top of table without unmounting it */}
            {isLoading && (
                <div className="table-loading-overlay">
                    <div className="loading-spinner" />
                    <span>{t('loading')}</span>
                </div>
            )}
            <table className="data-table">
                <thead>
                    {/* Header Row */}
                    <tr>
                        {showSelection && (
                            <th className="selection-column">
                                <input
                                    type="checkbox"
                                    checked={allSelected}
                                    onChange={onSelectAll}
                                    disabled={isEditing}
                                />
                            </th>
                        )}
                        {columns.map((col) => (
                            <th
                                key={col.key}
                                className={`${col.sortable ? 'sortable' : ''} ${draggedColumn === col.key ? 'dragging' : ''}`}
                                style={{ width: col.width }}
                                draggable
                                onDragStart={(e) => onDragStart(e, col.key)}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => onDrop(e, col.key)}
                                onClick={() => col.sortable && onSort(col.key)}
                            >
                                <div className="column-header-content">
                                    <span className="column-title">{col.title}</span>
                                    {col.sortable && sortConfig?.key === col.key && (
                                        <span className="sort-indicator">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                                    )}
                                </div>
                            </th>
                        ))}
                    </tr>

                    {/* Filter Row */}
                    <tr className="filter-row">
                        {showSelection && <th className="selection-column" />}
                        {columns.map((col) => (
                            <th key={`filter-${col.key}`}>
                                {col.filterable !== false ? (
                                    <input
                                        type="text"
                                        placeholder={`Filter ${col.title}...`}
                                        value={columnFilters[col.key] || ''}
                                        onChange={(e) => onColumnFilter(col.key, e.target.value)}
                                        className="column-filter-input"
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                ) : (
                                    <span style={{ display: 'block', height: '32px' }} />
                                )}
                            </th>
                        ))}
                    </tr>
                </thead>

                <tbody>
                    {/* Error state */}
                    {error && data.length === 0 && (
                        <tr>
                            <td colSpan={columns.length + (showSelection ? 1 : 0)} className="empty-table-cell">
                                <div className="error-state">
                                    <p>{t('errorLoadingData')}</p>
                                    <p className="error-message">{error}</p>
                                </div>
                            </td>
                        </tr>
                    )}

                    {/* Empty state */}
                    {!error && !isLoading && data.length === 0 && (
                        <tr>
                            <td colSpan={columns.length + (showSelection ? 1 : 0)} className="empty-table-cell">
                                <div className="empty-state">
                                    <p>{t('noDataFound')}</p>
                                    {showAddButton && onAdd && (
                                        <button className="add-first-button" onClick={onAdd}>+ {addButtonLabel}</button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    )}

                    {/* Data rows */}
                    {data.map((row, rowIndex) => {
                        const id = row.id || row._id;
                        const isSelected = selectedItems.includes(id);

                        return (
                            <tr
                                key={id}
                                className={`data-table-row ${isSelected ? 'data-table-row--selected' : ''}`}
                                onClick={() => onRowClick ? onRowClick(row) : (!isEditing && onSelectItem(id))}
                                {...(rowIndex === 0 ? { 'data-tutorial': 'expense-row' } : {})}
                            >
                                {showSelection && (
                                    <td className="selection-column" onClick={(e) => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => onSelectItem(id)}
                                            disabled={isEditing}
                                        />
                                    </td>
                                )}
                                {columns.map((col) => (
                                    <td key={col.key}>{renderCell(col, row)}</td>
                                ))}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default DashboardTable;
