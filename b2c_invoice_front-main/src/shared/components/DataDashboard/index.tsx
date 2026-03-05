/**
 * DataDashboard Component
 * =======================
 * Full-featured data table dashboard matching RFQ project exactly.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Layout from '../../layout/Layout';
import { useLang } from '../../i18n';
import { parseLocalizedNumber } from '../../utils/formatters';
import DashboardToolbar from './DashboardToolbar';
import DashboardPagination from './DashboardPagination';
import DashboardTable from './DashboardTable';
import { useColumnSettings, useFilteredData } from './hooks';
import { renderDashboardCell } from './cellRenderer';
import './DataDashboard.scss';

// ============ Types ============

export interface Column {
    key: string;
    title: string;
    type: 'text' | 'number' | 'date' | 'status' | 'action' | 'dropdown';
    sortable?: boolean;
    filterable?: boolean;
    width?: string;
    editable?: boolean;
    render?: (value: any, row: any) => React.ReactNode;
    /** Custom edit-mode renderer. handleEdit(field, value) allows editing any field from this cell. */
    editRender?: (value: any, row: any, handleEdit: (field: string, value: any) => void, pendingChanges: Record<string, any>) => React.ReactNode;
    options?: Array<{ value: string; label: string }> | string[];
    defaultHidden?: boolean;
}

// Sidebar configuration for Layout
export interface SidebarConfig {
    logo: React.ReactNode;
    navItems: Array<{
        id: string;
        label: string;
        icon: React.ReactNode;
        route?: string;
        badge?: number;
        isSeparator?: boolean;
        children?: Array<{
            id: string;
            label: string;
            icon: React.ReactNode;
            route?: string;
        }>;
    }>;
    currentRoute: string;
    onNavigate: (route: string) => void;
    user: { name: string; email: string };
    onLogout: () => void;
}

export interface DataDashboardProps {
    title: string;
    collection: string;
    data: any[];
    columns: Column[];
    isLoading?: boolean;
    error?: string | null;
    onDataChange?: (newData: any[]) => void;
    onAdd?: () => void;
    onEdit?: (id: string, field: string, value: any, row?: any) => void;
    onEditToggle?: () => void;
    onDelete?: (ids: string[]) => void;
    onExport?: () => void;
    onRowClick?: (item: any) => void;
    /** Fires when selection changes, reports selected IDs */
    onSelectionChange?: (selectedIds: string[]) => void;
    showAddButton?: boolean;
    addButtonLabel?: string;
    showSearch?: boolean;
    showSelection?: boolean;
    showEditButton?: boolean;
    showDeleteButton?: boolean;
    showExportButton?: boolean;
    pageDescription?: string;
    isEditing?: boolean;
    onSaveChanges?: (changes: Record<string, Record<string, any>>) => void;
    customHeaderActions?: React.ReactNode;
    /** Content rendered above the table (e.g. processing banner) */
    topContent?: React.ReactNode;
    noLayout?: boolean;
    /** Sidebar configuration - when provided, Layout shows sidebar */
    sidebarConfig?: SidebarConfig;
    paginationInfo?: {
        page: number;
        limit: number;
        total: number;
        pages: number;
        has_next: boolean;
        has_prev: boolean;
    };
    onDataFetch?: (params: {
        page: number;
        limit: number;
        search?: string;
        sortBy?: string;
        sortOrder?: string;
        columnFilters?: Record<string, string>;
    }) => void;
    /** Fires when pending inline-edit changes change (true = has unsaved edits) */
    onPendingChangesChange?: (hasPending: boolean) => void;
}

// ============ Main Component ============

const DataDashboard: React.FC<DataDashboardProps> = ({
    title,
    collection,
    data,
    columns,
    isLoading = false,
    error,
    onDataChange,
    onAdd,
    onEdit,
    onEditToggle,
    onDelete,
    onExport,
    onRowClick,
    onSelectionChange,
    showAddButton = true,
    addButtonLabel = 'Add New',
    showSearch = true,
    showSelection = true,
    showEditButton = true,
    showDeleteButton = true,
    showExportButton = true,
    pageDescription,
    isEditing = false,
    onSaveChanges,
    customHeaderActions,
    topContent,
    noLayout = false,
    sidebarConfig,
    paginationInfo,
    onDataFetch,
    onPendingChangesChange
}) => {
    const { t } = useLang();

    // ============ State ============
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [showColumnToggle, setShowColumnToggle] = useState(false);
    const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
    const [pendingChanges, setPendingChanges] = useState<Record<string, any>>({});
    const [itemsPerPage, setItemsPerPage] = useState(paginationInfo?.limit || 25);
    const [showItemsDropdown, setShowItemsDropdown] = useState(false);

    // ============ Hooks ============
    const { columnOrder, setColumnOrder, columnVisibility, setColumnVisibility } = useColumnSettings(collection, columns);

    const displayData = useFilteredData(
        data,
        columns,
        columnFilters,
        searchTerm,
        sortConfig,
        onDataFetch
    );

    // Notify parent of selection changes
    useEffect(() => {
        onSelectionChange?.(selectedItems);
    }, [selectedItems, onSelectionChange]);

    // ============ Visible Columns ============
    // Kept here as it's simple usage of state
    const visibleColumns = columnOrder
        .filter((key) => columnVisibility[key])
        .map((key) => columns.find((col) => col.key === key))
        .filter(Boolean) as Column[];

    const allSelected = displayData.length > 0 && selectedItems.length === displayData.length;

    // ============ Handlers ============
    const handleSelectAll = useCallback(() => {
        if (isEditing) return;
        setSelectedItems(allSelected ? [] : displayData.map((item) => item.id || item._id));
    }, [displayData, isEditing, allSelected]);

    const handleSelectItem = useCallback(
        (id: string) => {
            if (isEditing) return;
            setSelectedItems((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
        },
        [isEditing]
    );

    const handleSort = useCallback(
        (key: string) => {
            setSortConfig((prev) => {
                if (prev?.key === key) {
                    return prev.direction === 'asc' ? { key, direction: 'desc' } : null;
                }
                return { key, direction: 'asc' };
            });

            if (onDataFetch) {
                const newDirection = sortConfig?.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
                onDataFetch({
                    page: 1,
                    limit: itemsPerPage,
                    search: searchTerm,
                    sortBy: key,
                    sortOrder: newDirection,
                    columnFilters
                });
            }
        },
        [sortConfig, onDataFetch, itemsPerPage, searchTerm, columnFilters]
    );

    // Debounce timer ref for column filters
    const filterDebounceRef = useRef<NodeJS.Timeout | null>(null);

    const handleColumnFilter = useCallback(
        (key: string, value: string) => {
            // Update local state immediately (keeps input responsive)
            setColumnFilters((prev) => ({ ...prev, [key]: value }));

            // Debounce the API call (300ms delay)
            if (filterDebounceRef.current) {
                clearTimeout(filterDebounceRef.current);
            }

            filterDebounceRef.current = setTimeout(() => {
                if (onDataFetch) {
                    onDataFetch({
                        page: 1,
                        limit: itemsPerPage,
                        search: searchTerm,
                        sortBy: sortConfig?.key,
                        sortOrder: sortConfig?.direction,
                        columnFilters: { ...columnFilters, [key]: value }
                    });
                }
            }, 300);
        },
        [onDataFetch, columnFilters, itemsPerPage, searchTerm, sortConfig]
    );

    // Cleanup debounce timer on unmount
    useEffect(() => {
        return () => {
            if (filterDebounceRef.current) {
                clearTimeout(filterDebounceRef.current);
            }
        };
    }, []);

    const handleColumnDragStart = (e: React.DragEvent, key: string) => {
        setDraggedColumn(key);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleColumnDrop = (e: React.DragEvent, targetKey: string) => {
        e.preventDefault();
        if (!draggedColumn || draggedColumn === targetKey) return;
        setColumnOrder((prev) => {
            const newOrder = [...prev];
            const dragIdx = newOrder.indexOf(draggedColumn);
            const dropIdx = newOrder.indexOf(targetKey);
            newOrder.splice(dragIdx, 1);
            newOrder.splice(dropIdx, 0, draggedColumn);
            return newOrder;
        });
        setDraggedColumn(null);
    };

    const handleCellEdit = (id: string, field: string, value: any, row?: any) => {
        if (isEditing) {
            setPendingChanges((prev) => ({ ...prev, [`${id}::${field}`]: value }));
        } else {
            onEdit?.(id, field, value, row);
        }
    };

    const handleSaveChanges = useCallback(() => {
        if (!onSaveChanges) return;
        // Build set of number-type column keys for localized parsing
        const numberKeys = new Set(columns.filter(c => c.type === 'number').map(c => c.key));
        // Group pending changes by document ID
        const grouped: Record<string, Record<string, any>> = {};
        for (const [key, value] of Object.entries(pendingChanges)) {
            const sepIdx = key.indexOf('::');
            if (sepIdx === -1) continue;
            const docId = key.substring(0, sepIdx);
            const field = key.substring(sepIdx + 2);
            if (!grouped[docId]) grouped[docId] = {};
            grouped[docId][field] = numberKeys.has(field) ? parseLocalizedNumber(value) : value;
        }
        onSaveChanges(grouped);
    }, [pendingChanges, onSaveChanges, columns]);

    // Notify parent when pending changes change
    useEffect(() => {
        onPendingChangesChange?.(Object.keys(pendingChanges).length > 0);
    }, [pendingChanges, onPendingChangesChange]);

    // Clear pending changes when editing is toggled off
    useEffect(() => {
        if (!isEditing) {
            setPendingChanges({});
        }
    }, [isEditing]);

    const handleDelete = () => {
        if (selectedItems.length > 0) {
            onDelete?.(selectedItems);
            setSelectedItems([]);
        }
    };

    const handlePageChange = (page: number) => {
        if (onDataFetch) {
            onDataFetch({
                page,
                limit: itemsPerPage,
                search: searchTerm,
                sortBy: sortConfig?.key,
                sortOrder: sortConfig?.direction,
                columnFilters
            });
        }
    };

    const handleItemsPerPageChange = (value: number) => {
        setItemsPerPage(value);
        setShowItemsDropdown(false);
        if (onDataFetch) {
            onDataFetch({ page: 1, limit: value, search: searchTerm, sortBy: sortConfig?.key, sortOrder: sortConfig?.direction, columnFilters });
        }
    };

    // ============ Content ============
    const dashboardContent = (
        <div className="data-dashboard">
            <div className="data-dashboard-content">
                {/* Column Visibility Modal */}
                {showColumnToggle && (
                    <div className="admin-v2-column-toggle-modal-overlay" onClick={() => setShowColumnToggle(false)}>
                        <div className="admin-v2-column-toggle-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="admin-v2-modal-header">
                                <h3 className="admin-v2-modal-title">{t('showHideColumns')}</h3>
                                <button
                                    className="admin-v2-modal-close-button"
                                    onClick={() => setShowColumnToggle(false)}
                                >
                                    ×
                                </button>
                            </div>
                            <div className="admin-v2-modal-content">
                                <div className="admin-v2-column-list">
                                    {columns.map((col) => (
                                        <div key={col.key} className="admin-v2-column-item">
                                            <label className="admin-v2-column-checkbox">
                                                <input
                                                    type="checkbox"
                                                    className="admin-v2-column-checkbox-input"
                                                    checked={columnVisibility[col.key] ?? true}
                                                    onChange={(e) => setColumnVisibility((prev) => ({ ...prev, [col.key]: e.target.checked }))}
                                                />
                                                <span className="admin-v2-column-checkbox-title">{col.title}</span>
                                            </label>
                                        </div>
                                    ))}
                                </div>
                                <div className="admin-v2-modal-actions">
                                    <button
                                        className="admin-v2-modal-reset-button"
                                        onClick={() => {
                                            const resetVisibility: Record<string, boolean> = {};
                                            columns.forEach(col => { resetVisibility[col.key] = true; });
                                            setColumnVisibility(resetVisibility);
                                        }}
                                    >
                                        {t('resetAll')}
                                    </button>
                                    <button
                                        className="admin-v2-modal-close-modal-button"
                                        onClick={() => setShowColumnToggle(false)}
                                    >
                                        {t('done')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Search Bar */}
                <div className="search-actions-bar">
                    {showSearch && (
                        <div className="search-field">
                            <input
                                type="text"
                                placeholder={`${t('search')} ${title.toLowerCase()}...`}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="search-input"
                            />
                        </div>
                    )}
                    {showAddButton && onAdd && (
                        <button className="add-button" onClick={onAdd}>
                            {addButtonLabel}
                        </button>
                    )}
                </div>

                {topContent}

                {/* Table */}
                <DashboardTable
                    data={displayData}
                    columns={visibleColumns}
                    selectedItems={selectedItems}
                    onSelectAll={handleSelectAll}
                    onSelectItem={handleSelectItem}
                    onRowClick={onRowClick}
                    onSort={handleSort}
                    sortConfig={sortConfig}
                    columnFilters={columnFilters}
                    onColumnFilter={handleColumnFilter}
                    draggedColumn={draggedColumn}
                    onDragStart={handleColumnDragStart}
                    onDrop={handleColumnDrop}
                    isEditing={isEditing}
                    showSelection={showSelection}
                    isLoading={isLoading}
                    error={error}
                    showAddButton={showAddButton}
                    onAdd={onAdd}
                    addButtonLabel={addButtonLabel}
                    // Pass wrapper that injects state
                    renderCell={(col, row) => renderDashboardCell(col, row, isEditing, pendingChanges, handleCellEdit)}
                />

                {/* Pagination */}
                <DashboardPagination
                    paginationInfo={paginationInfo as any}
                    onPageChange={handlePageChange}
                />
            </div>
        </div>
    );

    if (noLayout) return dashboardContent;

    const toolbarElement = (
        <DashboardToolbar
            onEditToggle={onEditToggle}
            onExport={onExport}
            onDelete={handleDelete}
            onItemsPerPageChange={handleItemsPerPageChange}
            onColumnToggleClick={() => setShowColumnToggle(!showColumnToggle)}
            showEditButton={showEditButton}
            showExportButton={showExportButton}
            showDeleteButton={showDeleteButton}
            isEditing={isEditing}
            selectedCount={selectedItems.length}
            itemsPerPage={itemsPerPage}
            showItemsDropdown={showItemsDropdown}
            setShowItemsDropdown={setShowItemsDropdown}
            customHeaderActions={customHeaderActions}
            onSaveChanges={handleSaveChanges}
            hasPendingChanges={Object.keys(pendingChanges).length > 0}
        />
    );

    return (
        <Layout
            pageTitle={title}
            pageDescription={pageDescription}
            headerActions={toolbarElement}
            // Sidebar props (optional)
            logo={sidebarConfig?.logo}
            navItems={sidebarConfig?.navItems}
            currentRoute={sidebarConfig?.currentRoute}
            onNavigate={sidebarConfig?.onNavigate}
            user={sidebarConfig?.user}
            onLogout={sidebarConfig?.onLogout}
        >
            {dashboardContent}
        </Layout>
    );
};

export default DataDashboard;
