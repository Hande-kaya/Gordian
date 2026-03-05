/**
 * Button Components for Invoice Checker
 * =====================================
 * Simplified button components matching RFQ project styling.
 */

import React from 'react';
import './buttons.scss';

// ============ EditButton ============
interface EditButtonProps {
    isEditing: boolean;
    onToggle: () => void;
    disabled?: boolean;
}

export const EditButton: React.FC<EditButtonProps> = ({ isEditing, onToggle, disabled }) => (
    <button
        className={`btn btn--edit ${isEditing ? 'btn--cancel' : ''}`}
        onClick={onToggle}
        disabled={disabled}
    >
        {isEditing ? 'Cancel' : 'Edit'}
    </button>
);

// ============ SaveButton ============
interface SaveButtonProps {
    onSave: () => void;
    disabled?: boolean;
    label?: string;
}

export const SaveButton: React.FC<SaveButtonProps> = ({ onSave, disabled, label = 'Save' }) => (
    <button className="btn btn--save btn--primary" onClick={onSave} disabled={disabled}>
        {label}
    </button>
);

// ============ ExportButton ============
interface ExportButtonProps {
    onExport: () => void;
    disabled?: boolean;
    selectedItemsCount?: number;
    label?: string;
}

export const ExportButton: React.FC<ExportButtonProps> = ({
    onExport,
    disabled,
    selectedItemsCount = 0,
    label = 'Export'
}) => (
    <button className="btn btn--export" onClick={onExport} disabled={disabled}>
        {label} {selectedItemsCount > 0 && `(${selectedItemsCount})`}
    </button>
);

// ============ DeleteButton ============
interface DeleteButtonProps {
    onDelete: () => void;
    disabled?: boolean;
    selectedItemsCount?: number;
}

export const DeleteButton: React.FC<DeleteButtonProps> = ({
    onDelete,
    disabled,
    selectedItemsCount = 0
}) => (
    <button
        className="btn btn--delete btn--danger"
        onClick={onDelete}
        disabled={disabled || selectedItemsCount === 0}
    >
        Delete {selectedItemsCount > 0 && `(${selectedItemsCount})`}
    </button>
);

// ============ AddButton ============
interface AddButtonProps {
    onAdd: () => void;
    disabled?: boolean;
    label?: string;
    icon?: string;
}

export const AddButton: React.FC<AddButtonProps> = ({
    onAdd,
    disabled,
    label = 'Add New',
    icon
}) => (
    <button className="btn btn--add" onClick={onAdd} disabled={disabled}>
        {icon && <span className="btn__icon">{icon}</span>}
        {label}
    </button>
);

// ============ PaginationDropdown ============
interface PaginationDropdownProps {
    itemsPerPage: number;
    onItemsPerPageChange: (value: number) => void;
    options?: number[];
    label?: string;
}

export const PaginationDropdown: React.FC<PaginationDropdownProps> = ({
    itemsPerPage,
    onItemsPerPageChange,
    options = [10, 25, 50, 100],
    label = 'Show'
}) => (
    <div className="pagination-dropdown">
        <span className="pagination-dropdown__label">{label}</span>
        <select
            className="pagination-dropdown__select"
            value={itemsPerPage}
            onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
        >
            {options.map((opt) => (
                <option key={opt} value={opt}>
                    {opt}
                </option>
            ))}
        </select>
    </div>
);

// ============ FilterToggleButton ============
interface FilterToggleButtonProps {
    isOpen: boolean;
    onToggle: () => void;
}

export const FilterToggleButton: React.FC<FilterToggleButtonProps> = ({ isOpen, onToggle }) => (
    <button className={`btn btn--filter ${isOpen ? 'btn--active' : ''}`} onClick={onToggle}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        Filters
    </button>
);
