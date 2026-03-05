/**
 * Export Modal
 * ============
 * Simplified export modal for Invoice Checker.
 * Exports data to CSV/Excel format.
 */

import React, { useState, useMemo } from 'react';
import { useLang } from '../../i18n';
import './ExportModal.scss';

interface ExportField {
  name: string;
  type: string;
  description: string;
  selected?: boolean;
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  collection: string;
  data: any[];
  columns: Array<{ key: string; title: string }>;
  selectedIds?: string[];
  onExport?: (exportData: any) => void;
}

const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  collection,
  data,
  columns,
  selectedIds = [],
  onExport
}) => {
  const { t } = useLang();
  const [format, setFormat] = useState<'csv' | 'excel'>('csv');
  const [selectedFields, setSelectedFields] = useState<string[]>(
    columns.map((col) => col.key)
  );
  const [exportScope, setExportScope] = useState<'all' | 'selected'>('all');
  const [isExporting, setIsExporting] = useState(false);

  // Generate fields from columns
  const fields: ExportField[] = useMemo(
    () =>
      columns.map((col) => ({
        name: col.key,
        type: 'string',
        description: col.title,
        selected: selectedFields.includes(col.key)
      })),
    [columns, selectedFields]
  );

  const handleFieldToggle = (fieldName: string) => {
    setSelectedFields((prev) =>
      prev.includes(fieldName)
        ? prev.filter((f) => f !== fieldName)
        : [...prev, fieldName]
    );
  };

  const handleSelectAll = () => {
    setSelectedFields(columns.map((col) => col.key));
  };

  const handleDeselectAll = () => {
    setSelectedFields([]);
  };

  const handleExport = async () => {
    setIsExporting(true);

    try {
      // Get data to export
      const dataToExport =
        exportScope === 'selected' && selectedIds.length > 0
          ? data.filter((item) =>
            selectedIds.includes(item.id || item._id)
          )
          : data;

      // Filter to selected fields
      const exportData = dataToExport.map((item) => {
        const row: Record<string, any> = {};
        selectedFields.forEach((field) => {
          row[field] = item[field];
        });
        return row;
      });

      if (format === 'csv') {
        // Generate CSV
        const headers = selectedFields.join(',');
        const rows = exportData.map((row) =>
          selectedFields
            .map((field) => {
              const value = row[field];
              // Escape quotes and wrap in quotes if contains comma
              if (value === null || value === undefined) return '';
              const str = String(value);
              if (str.includes(',') || str.includes('"')) {
                return `"${str.replace(/"/g, '""')}"`;
              }
              return str;
            })
            .join(',')
        );
        const csv = [headers, ...rows].join('\n');

        // Download
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${collection}_export_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      // Call custom handler if provided
      if (onExport) {
        onExport({
          format,
          fields: selectedFields,
          scope: exportScope,
          data: exportData
        });
      }

      onClose();
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="export-modal-overlay" onClick={onClose}>
      <div className="export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="export-modal__header">
          <h2>{t('export')} {collection}</h2>
          <button className="export-modal__close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="export-modal__content">
          {/* Format Selection */}
          <div className="export-modal__section">
            <h3>{t('format')}</h3>
            <div className="export-modal__radio-group">
              <label>
                <input
                  type="radio"
                  name="format"
                  value="csv"
                  checked={format === 'csv'}
                  onChange={() => setFormat('csv')}
                />
                CSV
              </label>
              <label>
                <input
                  type="radio"
                  name="format"
                  value="excel"
                  checked={format === 'excel'}
                  onChange={() => setFormat('excel')}
                />
                {t('excelComingSoon')}
              </label>
            </div>
          </div>

          {/* Scope Selection */}
          {selectedIds.length > 0 && (
            <div className="export-modal__section">
              <h3>{t('exportScope')}</h3>
              <div className="export-modal__radio-group">
                <label>
                  <input
                    type="radio"
                    name="scope"
                    value="all"
                    checked={exportScope === 'all'}
                    onChange={() => setExportScope('all')}
                  />
                  {t('allRows')} ({data.length})
                </label>
                <label>
                  <input
                    type="radio"
                    name="scope"
                    value="selected"
                    checked={exportScope === 'selected'}
                    onChange={() => setExportScope('selected')}
                  />
                  {t('selectedRows')} ({selectedIds.length})
                </label>
              </div>
            </div>
          )}

          {/* Field Selection */}
          <div className="export-modal__section">
            <div className="export-modal__section-header">
              <h3>{t('fields')}</h3>
              <div className="export-modal__field-actions">
                <button type="button" onClick={handleSelectAll}>
                  {t('selectAll')}
                </button>
                <button type="button" onClick={handleDeselectAll}>
                  {t('deselectAll')}
                </button>
              </div>
            </div>
            <div className="export-modal__fields">
              {fields.map((field) => (
                <label key={field.name} className="export-modal__field">
                  <input
                    type="checkbox"
                    checked={selectedFields.includes(field.name)}
                    onChange={() => handleFieldToggle(field.name)}
                  />
                  <span className="export-modal__field-name">
                    {field.description || field.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="export-modal__footer">
          <button className="export-modal__btn export-modal__btn--secondary" onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            className="export-modal__btn export-modal__btn--primary"
            onClick={handleExport}
            disabled={isExporting || selectedFields.length === 0}
          >
            {isExporting ? t('exporting') : t('export')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
