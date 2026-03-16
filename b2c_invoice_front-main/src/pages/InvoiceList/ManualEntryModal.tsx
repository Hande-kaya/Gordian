/**
 * ManualEntryModal - Create a document manually (no file upload).
 * Supports both expense (type='invoice') and revenue (type='income').
 * Uses HTML5 date inputs for format enforcement.
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useLang } from '../../shared/i18n';
import { useCategories } from '../../context/CategoryContext';
import documentApi from '../../services/documentApi';
import { DISPLAY_CURRENCIES } from '../../utils/currency';
import './ManualEntryModal.scss';

interface ManualEntryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated: () => void;
    docType: 'invoice' | 'income';
}

interface FormValues {
    invoice_date: string;
    supplier_name: string;
    total_amount: string;
    total_tax_amount: string;
    currency: string;
    expense_category: string;
    invoice_number: string;
}

interface FormErrors {
    [key: string]: string;
}

const INITIAL_VALUES: FormValues = {
    invoice_date: '',
    supplier_name: '',
    total_amount: '',
    total_tax_amount: '',
    currency: 'EUR',
    expense_category: '',
    invoice_number: '',
};

const ManualEntryModal: React.FC<ManualEntryModalProps> = ({
    isOpen, onClose, onCreated, docType,
}) => {
    const { t } = useLang();
    const { categories, getLabelByKey } = useCategories();

    const [values, setValues] = useState<FormValues>({ ...INITIAL_VALUES });
    const [errors, setErrors] = useState<FormErrors>({});
    const [creating, setCreating] = useState(false);

    // Reset form when opening + lock body scroll
    useEffect(() => {
        if (isOpen) {
            setValues({ ...INITIAL_VALUES });
            setErrors({});
            document.body.style.overflow = 'hidden';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    const handleChange = useCallback((key: keyof FormValues, value: string) => {
        setValues(prev => ({ ...prev, [key]: value }));
        setErrors(prev => {
            if (prev[key]) {
                const next = { ...prev };
                delete next[key];
                return next;
            }
            return prev;
        });
    }, []);

    const validate = useCallback((): boolean => {
        const errs: FormErrors = {};

        if (!values.invoice_date) {
            errs.invoice_date = t('manualRequired');
        }

        if (!values.total_amount.trim()) {
            errs.total_amount = t('manualRequired');
        } else {
            const parsed = parseFloat(values.total_amount.replace(',', '.'));
            if (isNaN(parsed)) {
                errs.total_amount = t('manualInvalidAmount');
            }
        }

        if (values.total_tax_amount.trim()) {
            const parsedTax = parseFloat(values.total_tax_amount.replace(',', '.'));
            if (isNaN(parsedTax)) {
                errs.total_tax_amount = t('manualInvalidAmount');
            }
        }

        if (!values.currency) {
            errs.currency = t('manualSelectCurrency');
        }

        if (docType === 'invoice' && !values.expense_category) {
            errs.expense_category = t('manualSelectCategory');
        }

        setErrors(errs);
        return Object.keys(errs).length === 0;
    }, [values, docType, t]);

    const handleSubmit = useCallback(async () => {
        if (!validate()) return;
        setCreating(true);
        try {
            const amount = parseFloat(values.total_amount.replace(',', '.'));
            const taxAmount = values.total_tax_amount.trim()
                ? parseFloat(values.total_tax_amount.replace(',', '.'))
                : null;
            const extracted_data: Record<string, any> = {
                invoice_date: values.invoice_date,
                total_amount: amount,
                financials: {
                    total_amount: amount,
                    currency: values.currency,
                    ...(taxAmount != null && { total_tax_amount: taxAmount }),
                },
                currency: values.currency,
                ...(taxAmount != null && { total_tax_amount: taxAmount }),
            };
            if (values.supplier_name.trim()) {
                extracted_data.supplier_name = values.supplier_name.trim();
                extracted_data.vendor = { name: values.supplier_name.trim() };
            }
            if (values.invoice_number) extracted_data.invoice_number = values.invoice_number;
            if (values.expense_category) extracted_data.expense_category = values.expense_category;

            const namePart = (values.supplier_name.trim() || 'manual')
                .replace(/[^a-zA-Z0-9_\-\s]/g, '')
                .replace(/\s+/g, '_').substring(0, 40);
            const filename = `${namePart}_${values.invoice_date}.manual`;

            const res = await documentApi.createManualDocument(
                docType, extracted_data, filename,
            );

            if (res.success) {
                onCreated();
                onClose();
            } else {
                alert(t('manualCreateError'));
            }
        } catch {
            alert(t('manualCreateError'));
        } finally {
            setCreating(false);
        }
    }, [values, docType, validate, onCreated, onClose, t]);

    const categoryOptions = useMemo(() => {
        return categories.map(c => ({
            key: c.key,
            label: getLabelByKey(c.key),
        }));
    }, [categories, getLabelByKey]);

    const title = docType === 'income'
        ? t('manualEntryRevenueTitle')
        : t('manualEntryExpenseTitle');

    if (!isOpen) return null;

    return (
        <div className="manual-entry-overlay" onClick={onClose}>
            <div className="manual-entry-modal" onClick={e => e.stopPropagation()}>
                <div className="manual-entry-modal__header">
                    <h3>{title}</h3>
                    <button className="manual-entry-modal__close" onClick={onClose}>&times;</button>
                </div>

                <div className="manual-entry-modal__body">
                    {/* Invoice Date - required */}
                    <div className={`manual-entry-field${errors.invoice_date ? ' manual-entry-field--error' : ''}`}>
                        <label>{t('manualFieldInvoiceDate')} *</label>
                        <input
                            type="date"
                            value={values.invoice_date}
                            onChange={e => handleChange('invoice_date', e.target.value)}
                        />
                        {errors.invoice_date && <span className="manual-entry-field__error">{errors.invoice_date}</span>}
                    </div>

                    {/* Supplier Name - optional */}
                    <div className="manual-entry-field">
                        <label>{t('manualFieldSupplierName')}</label>
                        <input
                            type="text"
                            value={values.supplier_name}
                            onChange={e => handleChange('supplier_name', e.target.value)}
                            placeholder={t('manualFieldSupplierName')}
                        />
                    </div>

                    {/* Invoice Number - optional */}
                    <div className="manual-entry-field">
                        <label>{t('manualFieldInvoiceNumber')}</label>
                        <input
                            type="text"
                            value={values.invoice_number}
                            onChange={e => handleChange('invoice_number', e.target.value)}
                            placeholder={t('manualFieldInvoiceNumber')}
                        />
                    </div>

                    {/* Amount + Currency on same row */}
                    <div className="manual-entry-row">
                        <div className={`manual-entry-field manual-entry-field--amount${errors.total_amount ? ' manual-entry-field--error' : ''}`}>
                            <label>{t('manualFieldTotalAmount')} *</label>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={values.total_amount}
                                onChange={e => handleChange('total_amount', e.target.value)}
                                placeholder="0.00"
                            />
                            {errors.total_amount && <span className="manual-entry-field__error">{errors.total_amount}</span>}
                        </div>
                        <div className={`manual-entry-field manual-entry-field--currency${errors.currency ? ' manual-entry-field--error' : ''}`}>
                            <label>{t('manualFieldCurrency')} *</label>
                            <select
                                value={values.currency}
                                onChange={e => handleChange('currency', e.target.value)}
                            >
                                {DISPLAY_CURRENCIES.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                            {errors.currency && <span className="manual-entry-field__error">{errors.currency}</span>}
                        </div>
                    </div>

                    {/* VAT - optional */}
                    <div className={`manual-entry-field${errors.total_tax_amount ? ' manual-entry-field--error' : ''}`}>
                        <label>{t('manualFieldVat')}</label>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={values.total_tax_amount}
                            onChange={e => handleChange('total_tax_amount', e.target.value)}
                            placeholder="0.00"
                        />
                        {errors.total_tax_amount && <span className="manual-entry-field__error">{errors.total_tax_amount}</span>}
                    </div>

                    {/* Category - required for expenses */}
                    {docType === 'invoice' && (
                        <div className={`manual-entry-field${errors.expense_category ? ' manual-entry-field--error' : ''}`}>
                            <label>{t('manualFieldCategory')} *</label>
                            <select
                                value={values.expense_category}
                                onChange={e => handleChange('expense_category', e.target.value)}
                            >
                                <option value="">{t('manualSelectCategory')}</option>
                                {categoryOptions.map(c => (
                                    <option key={c.key} value={c.key}>{c.label}</option>
                                ))}
                            </select>
                            {errors.expense_category && <span className="manual-entry-field__error">{errors.expense_category}</span>}
                        </div>
                    )}
                </div>

                <div className="manual-entry-modal__footer">
                    <button className="manual-entry-modal__cancel" onClick={onClose}>
                        {t('deleteCancelLabel')}
                    </button>
                    <button
                        className="manual-entry-modal__submit"
                        onClick={handleSubmit}
                        disabled={creating}
                    >
                        {creating ? t('manualCreating') : t('manualCreate')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ManualEntryModal;
