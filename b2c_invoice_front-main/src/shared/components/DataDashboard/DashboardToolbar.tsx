import React, { useRef, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
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

// Dropdown rendered via Portal
const DropdownPortal: React.FC<{
    isOpen: boolean;
    position: { top: number; left: number; width: number };
    itemsPerPage: number;
    onSelect: (num: number) => void;
    dropdownRef: React.RefObject<HTMLDivElement>;
}> = ({ isOpen, position, itemsPerPage, onSelect, dropdownRef }) => {
    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <div
            ref={dropdownRef}
            style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
                minWidth: position.width,
                zIndex: 99999,
                background: '#fff',
                border: '1px solid #d1d5db',
                borderRadius: '0 0 4px 4px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
            }}
        >
            {[10, 20, 25, 50, 100].map((num) => (
                <button
                    key={num}
                    style={{
                        display: 'block',
                        width: '100%',
                        padding: '8px 16px',
                        border: 'none',
                        background: itemsPerPage === num ? '#3b82f6' : '#fff',
                        color: itemsPerPage === num ? '#fff' : '#374151',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '14px'
                    }}
                    onMouseEnter={(e) => {
                        if (itemsPerPage !== num) {
                            e.currentTarget.style.background = '#f3f4f6';
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (itemsPerPage !== num) {
                            e.currentTarget.style.background = '#fff';
                        }
                    }}
                    onClick={() => onSelect(num)}
                >
                    {num}
                </button>
            ))}
        </div>,
        document.body
    );
};

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
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

    // Calculate dropdown position when it opens
    useEffect(() => {
        if (showItemsDropdown && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setDropdownPosition({
                top: rect.bottom + 2,
                left: rect.left,
                width: rect.width
            });
        }
    }, [showItemsDropdown]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                showItemsDropdown &&
                dropdownRef.current &&
                buttonRef.current &&
                !dropdownRef.current.contains(event.target as Node) &&
                !buttonRef.current.contains(event.target as Node)
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
            {/* Custom Header Actions (rendered first) */}
            {customHeaderActions}

            {/* Edit / Save / Cancel Buttons */}
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

            {/* Filters Button */}
            <button className="action-button" onClick={onColumnToggleClick}>
                {t('filters')}
            </button>

            {/* Export Button */}
            {showExportButton && onExport && (
                <button className="action-button" data-tutorial="export-btn" onClick={onExport}>
                    {t('exportAllExcel')}
                </button>
            )}

            {/* Delete Button */}
            {showDeleteButton && onDelete && (
                <button
                    className="action-button"
                    onClick={onDelete}
                    disabled={selectedCount === 0}
                >
                    {t('delete')} ({selectedCount})
                </button>
            )}

            {/* Show/Items per page dropdown */}
            <div className="show-dropdown-container">
                <button
                    ref={buttonRef}
                    className="action-button show-dropdown-button"
                    onClick={() => setShowItemsDropdown(!showItemsDropdown)}
                >
                    {t('show')} {itemsPerPage} <span className="dropdown-arrow">▼</span>
                </button>
                <DropdownPortal
                    isOpen={showItemsDropdown}
                    position={dropdownPosition}
                    itemsPerPage={itemsPerPage}
                    onSelect={handleSelect}
                    dropdownRef={dropdownRef}
                />
            </div>
        </div>
    );
};

export default DashboardToolbar;
