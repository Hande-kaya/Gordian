import { ActionButton, DropdownOption } from './index';

/**
 * Helper function to create standard dashboard header actions
 * This reduces boilerplate code across different dashboard components
 */
export const createStandardHeaderActions = (config: {
  isEditing: boolean;
  onEditToggle: () => void;
  onSaveChanges?: () => void;
  onExport: () => void;
  onDelete: () => void;
  selectedItemsCount: number;
  itemsPerPage: number;
  onItemsPerPageChange: (itemsPerPage: number) => void;
  customButtons?: ActionButton[];
  useIndividualComponents?: boolean;
  onOpen?: () => void;
  onFiltersToggle?: () => void;
  showEditButton?: boolean;
  showDeleteButton?: boolean;
  onAddNew?: () => void;
  showAddButton?: boolean;
  showExportButton?: boolean;
}) => {
  const standardButtons: ActionButton[] = [
    {
      label: 'Add New Request',
      type: 'primary',
      onClick: config.onAddNew || (() => {}),
      visible: config.showAddButton !== false && !!config.onAddNew, // Show if onAddNew is provided
      componentProps: {}
    },
    {
      label: config.isEditing ? 'Cancel' : 'Edit',
      type: 'default',
      onClick: config.onEditToggle,
      visible: config.showEditButton !== false, // Show by default unless explicitly set to false
      componentProps: {
        isEditing: config.isEditing
      }
    },
    {
      label: 'Save',
      type: 'primary',
      onClick: config.onSaveChanges || (() => {}),
      visible: config.isEditing && !!config.onSaveChanges
    },
    {
      label: 'Filters',
      type: 'default',
      onClick: config.onFiltersToggle || (() => {}),
      visible: !!config.onFiltersToggle
    },
    {
      label: config.selectedItemsCount > 0 ? 'Export Selected as Excel' : 'Export All as Excel',
      type: 'default',
      onClick: config.onExport,
      visible: config.showExportButton !== false, // Show by default unless explicitly set to false
      componentProps: {
        selectedItemsCount: config.selectedItemsCount
      }
    },
    {
      label: `Delete (${config.selectedItemsCount})`,
      type: 'danger',
      onClick: config.onDelete,
      disabled: config.selectedItemsCount === 0,
      visible: config.showDeleteButton !== false, // Show by default unless explicitly set to false
      componentProps: {
        selectedItemsCount: config.selectedItemsCount
      }
    }
  ];

  // Add Open button if onOpen handler is provided
  if (config.onOpen) {
    standardButtons.splice(2, 0, {
      label: 'Open',
      type: 'primary',
      onClick: () => {
        if (config.onOpen) {
          config.onOpen();
        }
      },
      disabled: config.selectedItemsCount !== 1,
      visible: true,
      componentProps: {
        selectedItemsCount: config.selectedItemsCount
      }
    });
  }

  const dropdownOptions: DropdownOption[] = [10, 25, 50, 100].map(option => ({
    label: `Show ${option}`,
    value: option,
    selected: config.itemsPerPage === option
  }));

  return {
    buttons: [...standardButtons, ...(config.customButtons || [])],
    dropdown: {
      label: 'Show',
      value: config.itemsPerPage,
      options: dropdownOptions,
      onChange: config.onItemsPerPageChange
    },
    useIndividualComponents: config.useIndividualComponents || false
  };
};

/**
 * Helper function to create simple button-only header actions
 * For dashboards that don't need dropdown functionality
 */
export const createSimpleHeaderActions = (buttons: ActionButton[]) => {
  return {
    buttons,
    dropdown: undefined
  };
};

/**
 * Helper function to create dropdown-only header actions
 * For dashboards that only need pagination controls
 */
export const createDropdownHeaderActions = (config: {
  itemsPerPage: number;
  onItemsPerPageChange: (itemsPerPage: number) => void;
  label?: string;
  options?: number[];
}) => {
  const options = config.options || [10, 25, 50, 100];
  const dropdownOptions: DropdownOption[] = options.map(option => ({
    label: `${config.label || 'Show'} ${option}`,
    value: option,
    selected: config.itemsPerPage === option
  }));

  return {
    buttons: [],
    dropdown: {
      label: config.label || 'Show',
      value: config.itemsPerPage,
      options: dropdownOptions,
      onChange: config.onItemsPerPageChange
    }
  };
};
