/**
 * HeaderActions Component
 * =======================
 * Adapted from RFQ project for Invoice Checker.
 * Provides action buttons for dashboard headers.
 */

import React, { useState, useEffect } from 'react';
import {
  EditButton,
  SaveButton,
  ExportButton,
  DeleteButton,
  AddButton,
  PaginationDropdown
} from '../buttons';
import './HeaderActions.scss';

export interface ActionButton {
  label: string;
  type?: 'primary' | 'secondary' | 'danger' | 'default' | 'split';
  onClick: () => void;
  disabled?: boolean;
  visible?: boolean;
  icon?: string | React.ReactNode;
  className?: string;
  componentProps?: {
    isEditing?: boolean;
    selectedItemsCount?: number;
  };
}

export interface DropdownOption {
  label: string;
  value: number;
  selected?: boolean;
}

export interface HeaderActionsProps {
  buttons?: ActionButton[];
  dropdown?: {
    label: string;
    value: number;
    options: DropdownOption[];
    onChange: (value: number) => void;
  };
  customActions?: React.ReactNode;
  useIndividualComponents?: boolean;
}

const HeaderActions: React.FC<HeaderActionsProps> = ({
  buttons = [],
  dropdown,
  customActions,
  useIndividualComponents = false
}) => {
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.show-dropdown-container')) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);

  const renderIndividualButton = (button: ActionButton, index: number) => {
    const { label, onClick, disabled, visible, icon, componentProps } = button;

    if (visible === false) return null;

    switch (button.type) {
      case 'primary':
        return <SaveButton key={index} onSave={onClick} disabled={disabled} label={label} />;
      case 'danger':
        return (
          <DeleteButton
            key={index}
            onDelete={onClick}
            disabled={disabled}
            selectedItemsCount={componentProps?.selectedItemsCount || 0}
          />
        );
      default:
        const lowerLabel = label.toLowerCase();
        const isEditModeToggle = componentProps?.isEditing !== undefined;

        if (lowerLabel.includes('edit') && isEditModeToggle) {
          return (
            <EditButton
              key={index}
              isEditing={componentProps?.isEditing || false}
              onToggle={onClick}
              disabled={disabled}
            />
          );
        }
        if (lowerLabel.includes('export')) {
          return (
            <ExportButton
              key={index}
              onExport={onClick}
              disabled={disabled}
              selectedItemsCount={componentProps?.selectedItemsCount || 0}
              label={label}
            />
          );
        }
        if (lowerLabel.includes('add')) {
          return (
            <AddButton
              key={index}
              onAdd={onClick}
              disabled={disabled}
              label={label}
              icon={icon as string}
            />
          );
        }
        return (
          <button
            key={index}
            className={`action-button ${button.type ? `action-button-${button.type}` : ''}`}
            onClick={onClick}
            disabled={disabled}
          >
            {icon && <span className="button-icon">{icon}</span>}
            {label}
          </button>
        );
    }
  };

  return (
    <div className="header-actions">
      {useIndividualComponents
        ? buttons.map((button, index) => renderIndividualButton(button, index))
        : buttons
          .filter((button) => button.visible !== false)
          .map((button, index) => (
            <button
              key={index}
              className={`action-button ${button.type ? `action-button-${button.type}` : ''}`}
              onClick={button.onClick}
              disabled={button.disabled}
            >
              {button.icon && <span className="button-icon">{button.icon}</span>}
              {button.label}
            </button>
          ))}

      {dropdown &&
        (useIndividualComponents ? (
          <PaginationDropdown
            itemsPerPage={dropdown.value}
            onItemsPerPageChange={dropdown.onChange}
            options={dropdown.options.map((opt) => opt.value)}
            label={dropdown.label}
          />
        ) : (
          <div className="show-dropdown-container">
            <button
              className="action-button show-dropdown-button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowDropdown(!showDropdown);
              }}
            >
              {dropdown.label} {dropdown.value}
              <span className="dropdown-arrow">▼</span>
            </button>

            {showDropdown && (
              <div className="show-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                {dropdown.options.map((option) => (
                  <button
                    key={option.value}
                    className={`dropdown-option ${option.selected ? 'selected' : ''}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      dropdown.onChange(option.value);
                      setShowDropdown(false);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

      {customActions}
    </div>
  );
};

export default HeaderActions;

// Helper to create standard header actions
export const createStandardHeaderActions = ({
  isEditing,
  selectedItemsCount,
  onEditToggle,
  onSave,
  onExport,
  onDelete,
  showEditButton = true,
  showExportButton = true,
  showDeleteButton = true
}: {
  isEditing: boolean;
  selectedItemsCount: number;
  onEditToggle?: () => void;
  onSave?: () => void;
  onExport?: () => void;
  onDelete?: () => void;
  showEditButton?: boolean;
  showExportButton?: boolean;
  showDeleteButton?: boolean;
}): ActionButton[] => {
  const actions: ActionButton[] = [];

  if (showEditButton && onEditToggle) {
    actions.push({
      label: isEditing ? 'Cancel' : 'Edit',
      type: 'default',
      onClick: onEditToggle,
      componentProps: { isEditing }
    });
  }

  if (isEditing && onSave) {
    actions.push({
      label: 'Save',
      type: 'primary',
      onClick: onSave
    });
  }

  if (showExportButton && onExport) {
    actions.push({
      label: 'Export',
      type: 'default',
      onClick: onExport,
      componentProps: { selectedItemsCount }
    });
  }

  if (showDeleteButton && onDelete) {
    actions.push({
      label: 'Delete',
      type: 'danger',
      onClick: onDelete,
      disabled: selectedItemsCount === 0,
      componentProps: { selectedItemsCount }
    });
  }

  return actions;
};
