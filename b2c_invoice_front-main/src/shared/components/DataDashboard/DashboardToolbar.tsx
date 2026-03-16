import React, { useRef, useEffect, useState } from 'react';
import { useLang } from '../../i18n';
import '../HeaderActions/HeaderActions.scss';

interface DashboardToolbarProps {
    onEditToggle?: () => void;
    onExport?: () => void;
    onDelete?: () => void;
    onItemsPerPageChange: (value: number) => void;
    onColumnToggleClick: () => void;
    showEditButton: boolean;
    showExportButton: boolean;
    showDeleteButton: boolean;
    isEditing: boolean;
    selectedCount: number;
    itemsPerPage: number;
    showItemsDropdown: boolean;
    setShowItemsDropdown: (show: boolean) => void;
    customHeaderActions?: React.ReactNode;
    onSaveChanges?: () => void;
    hasPendingChanges?: boolean;
}

const DashboardToolbar: React.FC<DashboardToolbarProps> = ({
    onEditToggle,
    onExport,
    onDelete,
    onItemsPerPageChange,
    onColumnToggleClick,
    showEditButton,
    showExportButton,
    showDeleteButton,
    isEditing,
    selectedCount,
    itemsPerPage,
    showItemsDropdown,
    setShowItemsDropdown,
    customHeaderActions,
    onSaveChanges,
    hasPendingChanges
}) => {
    const { t } = useLang();
    const dropdownWrapRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        if (!showItemsDropdown) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (
                dropdownWrapRef.current &&
                !dropdownWrapRef.current.contains(event.target as Node)
            ) {
                setShowItemsDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showItemsDropdown, setShowItemsDropdown]);

    const handleSelect = (num: number) => {
        onItemsPerPageChange(num);
        setShowItemsDropdown(false);
    };

    return (
        <div className="admin-v2-header-actions">
            {/* Left group: custom actions + edit/save/cancel/delete */}
            <div className="header-actions__left">
                {customHeaderActions}

                {showEditButton && onEditToggle && !isEditing && (
                    <button className="action-button" onClick={onEditToggle}>
                        {t('edit')}
                    </button>
                )}
                {showEditButton && isEditing && (
                    <>
                        {onSaveChanges && (
                            <button
                                className="action-button action-button-primary"
                                onClick={onSaveChanges}
                                disabled={!hasPendingChanges}
                            >
                                {t('save')}
                            </button>
                        )}
                        {onEditToggle && (
                            <button className="action-button" onClick={onEditToggle}>
                                {t('cancel')}
                            </button>
                        )}
                    </>
                )}

                {showDeleteButton && onDelete && (
                    <button
                        className="action-button"
                        onClick={onDelete}
                        disabled={selectedCount === 0}
                    >
                        {t('delete')} ({selectedCount})
                    </button>
                )}
            </div>

            {/* Right group: filters + export + show */}
            <div className="header-actions__right">
                {/* Filters Button */}
                <button className="action-button" onClick={onColumnToggleClick}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                    {t('filters')}
                </button>

                {/* Export Button */}
                {showExportButton && onExport && (
                    <button className="action-button" data-tutorial="export-btn" onClick={onExport}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        {t('exportAllExcel')}
                    </button>
                )}

                {/* Show/Items per page dropdown */}
                <div className="show-dropdown-container" ref={dropdownWrapRef}>
                    <button
                        className="action-button show-dropdown-button"
                        onClick={() => setShowItemsDropdown(!showItemsDropdown)}
                    >
                        {t('show')} {itemsPerPage}
                        <span className={`dropdown-arrow${showItemsDropdown ? ' dropdown-arrow--open' : ''}`}>&#9660;</span>
                    </button>
                    {showItemsDropdown && (
                        <div className="show-dropdown-menu">
                            {[10, 20, 25, 50, 100].map((num) => (
                                <button
                                    key={num}
                                    className={`dropdown-option${itemsPerPage === num ? ' selected' : ''}`}
                                    onClick={() => handleSelect(num)}
                                >
                                    {num}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DashboardToolbar;
