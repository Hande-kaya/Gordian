/**
 * LineItemsTable - Displays and optionally edits invoice line items.
 *
 * Two modes:
 * - readOnly: compact display table
 * - editing: inline editable cells with add/remove
 */

import React, { useCallback } from 'react';
import { useLang } from '../../shared/i18n';

export interface LineItem {
    description?: string;
    quantity?: number | null;
    unit?: string;
    unit_price?: number | null;
    amount?: number | null;
    product_code?: string;
}

interface LineItemsTableProps {
    items: LineItem[];
    editing?: boolean;
    onChange?: (items: LineItem[]) => void;
}

const fmtNum = (v?: number | null) =>
    v != null ? v.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : '-';

const LineItemsTable: React.FC<LineItemsTableProps> = ({ items, editing, onChange }) => {
    const { t } = useLang();

    const updateItem = useCallback((idx: number, key: keyof LineItem, raw: string) => {
        if (!onChange) return;
        const next = items.map((it, i) => {
            if (i !== idx) return it;
            if (key === 'quantity' || key === 'unit_price' || key === 'amount') {
                return { ...it, [key]: raw === '' ? null : Number(raw) };
            }
            return { ...it, [key]: raw };
        });
        onChange(next);
    }, [items, onChange]);

    const addRow = useCallback(() => {
        if (!onChange) return;
        onChange([...items, { description: '', quantity: null, unit: '', unit_price: null, amount: null }]);
    }, [items, onChange]);

    const removeRow = useCallback((idx: number) => {
        if (!onChange) return;
        onChange(items.filter((_, i) => i !== idx));
    }, [items, onChange]);

    if (!editing && (!items || items.length === 0)) return null;

    return (
        <div className="line-items-section">
            <h3 className="line-items-section__title">{t('lineItemsTitle')}</h3>
            <div className="line-items-section__table-wrap">
                <table className={`line-items-section__table ${editing ? 'line-items-section__table--editing' : ''}`}>
                    <thead>
                        <tr>
                            <th className="col-num">#</th>
                            <th className="col-desc">{t('lineItemDesc')}</th>
                            <th className="col-qty">{t('lineItemQty')}</th>
                            <th className="col-unit">{t('lineItemUnit')}</th>
                            <th className="col-price">{t('lineItemUnitPrice')}</th>
                            <th className="col-amount">{t('lineItemAmount')}</th>
                            {editing && <th className="col-actions"></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, idx) => (
                            <tr key={idx}>
                                <td className="col-num">{idx + 1}</td>
                                {editing ? (
                                    <>
                                        <td><input value={item.description || ''} onChange={e => updateItem(idx, 'description', e.target.value)} /></td>
                                        <td><input type="number" step="1" value={item.quantity ?? ''} onChange={e => updateItem(idx, 'quantity', e.target.value)} /></td>
                                        <td><input value={item.unit || ''} onChange={e => updateItem(idx, 'unit', e.target.value)} /></td>
                                        <td><input type="number" step="0.01" value={item.unit_price ?? ''} onChange={e => updateItem(idx, 'unit_price', e.target.value)} /></td>
                                        <td><input type="number" step="0.01" value={item.amount ?? ''} onChange={e => updateItem(idx, 'amount', e.target.value)} /></td>
                                        <td>
                                            <button className="line-items-section__remove-btn" onClick={() => removeRow(idx)} title={t('lineItemRemove')}>
                                                &times;
                                            </button>
                                        </td>
                                    </>
                                ) : (
                                    <>
                                        <td>{item.description || '-'}</td>
                                        <td className="num-cell">{item.quantity != null ? item.quantity : '-'}</td>
                                        <td>{item.unit || '-'}</td>
                                        <td className="num-cell">{fmtNum(item.unit_price)}</td>
                                        <td className="num-cell">{fmtNum(item.amount)}</td>
                                    </>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {editing && (
                <button className="line-items-section__add-btn" onClick={addRow}>
                    {t('lineItemAdd')}
                </button>
            )}
        </div>
    );
};

export default LineItemsTable;
