# HeaderActions Component

Generic, configuration-based header actions component for data dashboards with support for both generic and individual button components.

## Features

- **Dual Mode**: Use generic buttons or individual button components
- **Configuration-based**: No need for separate components for each button type
- **Flexible**: Support for buttons, dropdowns, and custom actions
- **Reusable**: Works across all dashboard types
- **Type-safe**: Full TypeScript support
- **Individual Components**: Each button type has its own component in `/buttons/`

## Basic Usage

### Standard Dashboard Actions

```tsx
import HeaderActions from '../HeaderActions';
import { createStandardHeaderActions } from '../HeaderActions/helpers';

const MyDashboard = () => {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  const headerActions = (
    <HeaderActions
      {...createStandardHeaderActions({
        isEditing,
        onEditToggle: () => setIsEditing(!isEditing),
        onSaveChanges: handleSave,
        onExport: () => setShowExportModal(true),
        onDelete: handleDelete,
        selectedItemsCount: selectedItems.length,
        itemsPerPage,
        onItemsPerPageChange: setItemsPerPage
      })}
    />
  );

  return (
    <AdminLayout headerActions={headerActions}>
      {/* Dashboard content */}
    </AdminLayout>
  );
};
```

### Custom Button Configuration

```tsx
import HeaderActions from '../HeaderActions';
import { ActionButton } from '../HeaderActions';

const CustomDashboard = () => {
  const buttons: ActionButton[] = [
    {
      label: 'Add New',
      type: 'primary',
      onClick: handleAdd,
      icon: '+'
    },
    {
      label: 'Import CSV',
      type: 'secondary',
      onClick: handleImport,
      visible: user.role === 'admin'
    },
    {
      label: 'Archive All',
      type: 'danger',
      onClick: handleArchive,
      disabled: data.length === 0
    }
  ];

  return (
    <HeaderActions buttons={buttons} />
  );
};
```

### Dropdown Only

```tsx
import HeaderActions from '../HeaderActions';
import { createDropdownHeaderActions } from '../HeaderActions/helpers';

const SimpleDashboard = () => {
  return (
    <HeaderActions
      {...createDropdownHeaderActions({
        itemsPerPage,
        onItemsPerPageChange: setItemsPerPage,
        label: 'Display',
        options: [5, 10, 20, 50]
      })}
    />
  );
};
```

### Using Individual Button Components Directly

```tsx
import { EditButton, SaveButton, ExportButton, DeleteButton, PaginationDropdown } from '../buttons';

const MyDashboard = () => {
  return (
    <div className="admin-v2-header-actions">
      <EditButton isEditing={isEditing} onToggle={handleEditToggle} />
      <SaveButton onSave={handleSave} />
      <ExportButton onExport={handleExport} selectedItemsCount={selectedItems.length} />
      <DeleteButton onDelete={handleDelete} selectedItemsCount={selectedItems.length} />
      <PaginationDropdown itemsPerPage={itemsPerPage} onItemsPerPageChange={setItemsPerPage} />
    </div>
  );
};
```

## Individual Button Components

### Available Components

- **`EditButton`** - Toggle between Edit/Cancel
- **`SaveButton`** - Primary blue save button
- **`ExportButton`** - Export functionality with selection count
- **`DeleteButton`** - Red delete button with selection count
- **`AddButton`** - Green add button with icon support
- **`PaginationDropdown`** - Items per page selector

### Component Props

Each button component has its own specific props and styling, making them highly customizable and reusable.

## Button Types

- `default`: Standard gray button
- `primary`: Blue button for primary actions
- `danger`: Red button for destructive actions
- `secondary`: Gray button for secondary actions

## Interface Definitions

### ActionButton

```tsx
interface ActionButton {
  label: string;                    // Button text
  type?: 'primary' | 'secondary' | 'danger' | 'default';
  onClick: () => void;             // Click handler
  disabled?: boolean;              // Disabled state
  visible?: boolean;               // Show/hide button
  icon?: string;                   // Optional icon
}
```

### DropdownOption

```tsx
interface DropdownOption {
  label: string;                   // Option text
  value: number;                   // Option value
  selected?: boolean;              // Selected state
}
```

## Helper Functions

### createStandardHeaderActions()

Creates standard dashboard actions (Edit, Save, Export, Delete, Pagination).

### createSimpleHeaderActions()

Creates button-only header actions without dropdown.

### createDropdownHeaderActions()

Creates dropdown-only header actions for pagination controls.

## Styling

All styles use ultra-specific selectors with `!important` to prevent CSS conflicts:

```scss
.admin-v2-header-actions {
  .action-button {
    &.action-button-primary { /* Blue styling */ }
    &.action-button-danger { /* Red styling */ }
    &.action-button-secondary { /* Gray styling */ }
  }
}
```

## Benefits

1. **No Component Explosion**: Single component handles all button types
2. **Configuration-Driven**: Easy to modify without code changes
3. **Reusable**: Works across all dashboard types
4. **Maintainable**: Centralized styling and behavior
5. **Type-Safe**: Full TypeScript support prevents errors
