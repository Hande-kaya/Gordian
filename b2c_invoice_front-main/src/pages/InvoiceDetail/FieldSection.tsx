/**
 * FieldSection - Reusable form section for invoice detail fields.
 *
 * Two modes:
 * - readOnly (default): compact text display
 * - editing: input fields for modification
 */

import React from 'react';

export interface FieldDef {
    key: string;
    label: string;
    type?: 'text' | 'number' | 'select';
    options?: string[];
}

interface FieldSectionProps {
    title: string;
    fields: FieldDef[];
    values: Record<string, any>;
    onChange: (key: string, value: any) => void;
    readOnly?: boolean;
}

const formatValue = (val: any, type?: string): string => {
    if (val == null || val === '') return '-';
    if (type === 'number' && typeof val === 'number') {
        return val.toLocaleString('tr-TR', { minimumFractionDigits: 2 });
    }
    return String(val);
};

const FieldSection: React.FC<FieldSectionProps> = ({
    title, fields, values, onChange, readOnly = false
}) => {
    // Filter out empty fields in readOnly mode for compactness
    const visibleFields = readOnly
        ? fields.filter(f => values[f.key] != null && values[f.key] !== '')
        : fields;

    if (readOnly && visibleFields.length === 0) return null;

    return (
        <div className={`field-section ${readOnly ? 'field-section--readonly' : ''}`}>
            <h3 className="field-section__title">{title}</h3>
            <div className="field-section__grid">
                {visibleFields.map(f => (
                    <div key={f.key} className="field-section__field">
                        <label className="field-section__label">{f.label}</label>
                        {readOnly ? (
                            <span className="field-section__value">
                                {formatValue(values[f.key], f.type)}
                            </span>
                        ) : f.type === 'select' && f.options ? (
                            <select
                                className="field-section__input"
                                value={values[f.key] || ''}
                                onChange={e => onChange(f.key, e.target.value)}
                            >
                                <option value="">--</option>
                                {f.options.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        ) : (
                            <input
                                className="field-section__input"
                                type={f.type || 'text'}
                                value={values[f.key] ?? ''}
                                onChange={e => onChange(
                                    f.key,
                                    f.type === 'number'
                                        ? (e.target.value === '' ? null : Number(e.target.value))
                                        : e.target.value
                                )}
                                step={f.type === 'number' ? '0.01' : undefined}
                            />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default FieldSection;
