/**
 * InvoiceDetail Page - B2C
 * ========================
 * Two-column layout: PDF viewer (left) + fields & line items (right).
 * Read-only by default; "Duzenle" button toggles edit mode.
 * Action buttons rendered in Layout headerActions.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Layout from '../../shared/layout/Layout';
import { useLang } from '../../shared/i18n';
import { useAuth } from '../../context/AuthContext';
import documentApi, { DocumentItem } from '../../services/documentApi';
import FieldSection, { FieldDef } from './FieldSection';
import PdfViewerPanel, { EntityWithBounds } from './PdfViewerPanel';
import LineItemsTable, { LineItem } from './LineItemsTable';
import ConfirmModal from '../../components/common/ConfirmModal';
import { useOnboarding } from '../../context/OnboardingContext';
import { useCategories } from '../../context/CategoryContext';
import { SAMPLE_ID, buildSampleDoc } from './sampleData';
import { tutorialSteps } from '../../components/tutorial/tutorialSteps';
import { DashboardIcon, ExpenseIcon, IncomeIcon, BankIcon, ReconciliationIcon, TrashIcon, SettingsIcon } from '../../shared/icons/NavIcons';
import './InvoiceDetail.scss';

/** Flatten extracted_data fields to top-level for editing */
function flattenDoc(doc: DocumentItem): Record<string, any> {
    const ed = doc.extracted_data || {};
    return {
        supplier_name: ed.supplier_name || ed.vendor?.name || '',
        supplier_tax_id: ed.supplier_tax_id || ed.vendor?.tax_id || '',
        supplier_address: ed.supplier_address || ed.vendor?.address || '',
        supplier_email: ed.supplier_email || '',
        supplier_phone: ed.supplier_phone || '',
        supplier_website: ed.supplier_website || '',
        supplier_iban: ed.supplier_iban || '',
        receiver_name: ed.receiver_name || '',
        receiver_address: ed.receiver_address || '',
        total_amount: ed.total_amount ?? ed.financials?.total_amount ?? '',
        net_amount: ed.net_amount ?? ed.financials?.subtotal ?? '',
        total_tax_amount: ed.total_tax_amount ?? ed.financials?.tax ?? '',
        currency: ed.currency || ed.financials?.currency || '',
        expense_category: (doc as any).expense_category || ed.expense_category || '',
        invoice_number: ed.invoice_number || '',
        invoice_type: ed.invoice_type || '',
        invoice_date: ed.invoice_date || '',
        due_date: ed.due_date || '',
    };
}

function getLineItems(doc: DocumentItem): LineItem[] {
    return (doc.extracted_data?.items || doc.extracted_data?.line_items || []) as LineItem[];
}

const InvoiceDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { t, lang } = useLang();
    const { user, logout } = useAuth();
    const { showTutorial, tutorialStep } = useOnboarding();
    const { categories } = useCategories();
    const isSample = id === SAMPLE_ID;
    const isIncome = location.pathname.startsWith('/income');
    const listRoute = isIncome ? '/income' : '/invoices';

    const categoryKeys = useMemo(() => categories.map(c => c.key), [categories]);

    const dateFields: FieldDef[] = useMemo(() => [
        { key: 'invoice_number', label: t('fieldInvoiceNumber') },
        { key: 'invoice_type', label: t('fieldInvoiceType') },
        { key: 'invoice_date', label: t('fieldInvoiceDate') },
        { key: 'due_date', label: t('fieldDueDate') },
    ], [t]);

    const supplierFields: FieldDef[] = useMemo(() => [
        { key: 'supplier_name', label: t('fieldSupplierName') },
        { key: 'supplier_tax_id', label: t('fieldTaxId') },
        { key: 'supplier_address', label: t('fieldAddress') },
        { key: 'supplier_email', label: t('fieldEmail') },
        { key: 'supplier_phone', label: t('fieldPhone') },
        { key: 'supplier_website', label: t('fieldWebsite') },
        { key: 'supplier_iban', label: t('fieldIban') },
    ], [t]);

    const receiverFields: FieldDef[] = useMemo(() => [
        { key: 'receiver_name', label: t('fieldReceiverName') },
        { key: 'receiver_address', label: t('fieldReceiverAddress') },
    ], [t]);

    const financialFields: FieldDef[] = useMemo(() => [
        { key: 'total_amount', label: t('fieldTotalAmount'), type: 'number' },
        { key: 'net_amount', label: t('fieldNetAmount'), type: 'number' },
        { key: 'total_tax_amount', label: t('fieldTaxAmount'), type: 'number' },
        { key: 'currency', label: t('fieldCurrency') },
        { key: 'expense_category', label: t('fieldCategory'), type: 'select', options: categoryKeys },
    ], [t, categoryKeys]);

    const [doc, setDoc] = useState<DocumentItem | null>(null);
    const [values, setValues] = useState<Record<string, any>>({});
    const [originalValues, setOriginalValues] = useState<Record<string, any>>({});
    const [lineItems, setLineItems] = useState<LineItem[]>([]);
    const [originalLineItems, setOriginalLineItems] = useState<LineItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [highlightsOn, setHighlightsOn] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    const navItems = useMemo(() => [
        { id: 'dashboard', label: t('navDashboard'), icon: <DashboardIcon />, route: '/dashboard' },
        { id: 'expenses', label: t('navExpenses'), icon: <ExpenseIcon />, route: '/invoices', dataTutorial: 'expenses-nav' },
        { id: 'income', label: t('navIncome'), icon: <IncomeIcon />, route: '/income' },
        { id: 'bank-statements', label: t('navBankStatements'), icon: <BankIcon />, route: '/bank-statements' },
        { id: 'reconciliation', label: t('navReconciliation'), icon: <ReconciliationIcon />, route: '/reconciliation' },
        { id: 'trash', label: t('navTrash'), icon: <TrashIcon />, route: '/trash' },
        { id: 'sep', label: '', icon: null, isSeparator: true },
        { id: 'settings', label: t('navSettings'), icon: <SettingsIcon />, route: '/settings', dataTutorial: 'settings-nav' },
    ], [t]);

    const fetchDocument = useCallback(async () => {
        if (!id) return;
        // Tutorial sample: use mock data, skip API
        if (isSample) {
            const sampleDoc = buildSampleDoc(lang);
            setDoc(sampleDoc);
            setValues(flattenDoc(sampleDoc));
            setOriginalValues(flattenDoc(sampleDoc));
            setLineItems(getLineItems(sampleDoc));
            setOriginalLineItems(getLineItems(sampleDoc));
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const res = await documentApi.getDocument(id);
            if (res.success && res.data) {
                setDoc(res.data);
                const flat = flattenDoc(res.data);
                const items = getLineItems(res.data);
                setValues(flat);
                setOriginalValues(flat);
                setLineItems(items);
                setOriginalLineItems(items);
            } else {
                setError(res.message || t('invoiceNotFound'));
            }
        } catch {
            setError(t('serverError'));
        } finally {
            setLoading(false);
        }
    }, [id, isSample, lang]);

    useEffect(() => { fetchDocument(); }, [fetchDocument]);

    // Auto-enable edit mode when tutorial reaches the edit step on sample page
    const editStepIndex = tutorialSteps.findIndex(s => s.id === 'edit-fields');
    useEffect(() => {
        if (isSample && showTutorial && tutorialStep === editStepIndex) {
            setEditing(true);
        }
    }, [isSample, showTutorial, tutorialStep, editStepIndex]);

    const handleChange = useCallback((key: string, value: any) => {
        setValues(prev => ({ ...prev, [key]: value }));
    }, []);

    const handleCancel = useCallback(() => {
        setValues({ ...originalValues });
        setLineItems([...originalLineItems]);
        setEditing(false);
    }, [originalValues, originalLineItems]);

    const handleSave = useCallback(async () => {
        if (!id) return;
        setSaving(true);
        try {
            const changed: Record<string, any> = {};
            for (const k of Object.keys(values)) {
                if (values[k] !== originalValues[k]) {
                    const apiKey = k === 'supplier_name' ? 'vendor_name' : k;
                    changed[apiKey] = values[k];
                }
            }
            if (JSON.stringify(lineItems) !== JSON.stringify(originalLineItems)) {
                changed['line_items'] = lineItems;
            }
            if (Object.keys(changed).length > 0) {
                await documentApi.updateDocumentFields(id, changed);
                setOriginalValues({ ...values });
                setOriginalLineItems([...lineItems]);
            }
            setEditing(false);
        } catch {
            alert(t('saveError'));
        } finally {
            setSaving(false);
        }
    }, [id, values, originalValues, lineItems, originalLineItems]);

    const hasDateFormat = !!doc?.extracted_data?.date_format;

    const handleSwapDates = useCallback(async () => {
        if (!id) return;
        try {
            const res = await documentApi.swapDocumentDates(id);
            if (res.success && res.data) {
                setDoc(res.data);
                const flat = flattenDoc(res.data);
                setValues(flat);
                setOriginalValues(flat);
            }
        } catch {
            // silent fail
        }
    }, [id]);

    const handleDeleteConfirm = useCallback(async () => {
        if (!id) return;
        setShowDeleteModal(false);
        try {
            await documentApi.deleteDocument(id);
            navigate(listRoute);
        } catch {
            alert(t('deleteError'));
        }
    }, [id, navigate, listRoute]);

    const headerActions = useMemo(() => (
        <>
            <button
                className="header-action-btn"
                onClick={() => navigate(listRoute)}
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
                    <polyline points="15 18 9 12 15 6" />
                </svg>
                {t('backToList')}
            </button>
            <div className="header-actions">
                <button
                    className={`highlight-toggle${highlightsOn ? ' highlight-toggle--active' : ''}`}
                    onClick={() => setHighlightsOn(prev => !prev)}
                    title={t('highlightLabel')}
                >
                    <svg className="highlight-toggle__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" />
                    </svg>
                    <span className="highlight-toggle__label">{t('highlightLabel')}</span>
                    <span className="highlight-toggle__dot" />
                </button>
                {editing ? (
                    <>
                        <button className="action-button" onClick={handleCancel}>
                            {t('cancel')}
                        </button>
                        <button
                            className="action-button action-button-primary"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? t('saving') : t('save')}
                        </button>
                    </>
                ) : (
                    <>
                        <button className="action-button" data-tutorial="edit-btn" onClick={() => setEditing(true)}>
                            {t('edit')}
                        </button>
                        <button
                            className="header-action-btn header-action-btn--danger"
                            onClick={() => setShowDeleteModal(true)}
                        >
                            {t('delete')}
                        </button>
                    </>
                )}
            </div>
        </>
    ), [highlightsOn, editing, saving, handleCancel, handleSave, navigate]);

    const pageDescription = useMemo(() => {
        if (!doc) return undefined;
        const date = doc.created_at
            ? new Date(doc.created_at).toLocaleDateString('tr-TR')
            : '';
        return date ? `${doc.filename}  ·  ${date}` : doc.filename;
    }, [doc]);

    const logoEl = <span className="b2c-logo">Invoice<span>Manager</span></span>;

    const layoutProps = useMemo(() => ({
        pageTitle: t('invoiceDetailTitle'),
        pageDescription,
        logo: logoEl,
        navItems,
        currentRoute: location.pathname,
        onNavigate: (r: string) => navigate(r),
        user: { name: user?.name || 'User', email: user?.email || '', avatar: user?.profile_photo },
        onLogout: () => { logout(); navigate('/'); },
        headerActions,
    }), [navItems, location.pathname, navigate, user, logout, headerActions, pageDescription]);

    const entities: EntityWithBounds[] = useMemo(() => {
        return (doc?.extracted_data?.entities_with_bounds || []) as EntityWithBounds[];
    }, [doc]);

    const initialPage = useMemo(() => {
        const md = (doc as any)?.multi_document;
        if (!md?.boundaries?.length) return undefined;
        const b = md.boundaries[0];
        return b.pages ? b.pages[0] : b.page;
    }, [doc]);

    if (loading) {
        return (
            <Layout {...layoutProps}>
                <div className="invoice-detail__loading">{t('loading')}</div>
            </Layout>
        );
    }

    if (error || !doc) {
        return (
            <Layout {...layoutProps}>
                <div className="invoice-detail__error">{error || t('invoiceNotFound')}</div>
            </Layout>
        );
    }

    return (
        <Layout {...layoutProps}>
            <div className="invoice-detail">
                <div className="invoice-detail__body">
                    <div className="invoice-detail__pdf-col" data-tutorial="detail-pdf">
                        {isSample ? (
                            <div className="invoice-detail__sample-pdf">
                                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="16" y1="13" x2="8" y2="13" />
                                    <line x1="16" y1="17" x2="8" y2="17" />
                                    <line x1="10" y1="9" x2="8" y2="9" />
                                </svg>
                                <p>{t('pdfPreview')}</p>
                                <span>{doc?.filename}</span>
                            </div>
                        ) : (
                            <PdfViewerPanel
                                documentId={id!}
                                parentDocumentId={(doc as any).parent_document_id}
                                entities={entities}
                                showHighlights={highlightsOn}
                                initialPage={initialPage}
                                filename={doc.filename}
                            />
                        )}
                    </div>

                    <div className="invoice-detail__fields-col" data-tutorial="detail-fields">
                        <FieldSection
                            title={t('sectionInvoiceInfo')}
                            fields={dateFields}
                            values={values}
                            onChange={handleChange}
                            readOnly={!editing}
                            headerAction={hasDateFormat && !editing ? (
                                <button
                                    className="swap-dates-btn"
                                    onClick={handleSwapDates}
                                    title={t('swapDatesTitle')}
                                >
                                    {t('swapDates')}
                                </button>
                            ) : undefined}
                        />
                        <FieldSection title={t('sectionSupplier')} fields={supplierFields} values={values} onChange={handleChange} readOnly={!editing} />
                        <FieldSection title={t('sectionReceiver')} fields={receiverFields} values={values} onChange={handleChange} readOnly={!editing} />
                        <FieldSection title={t('sectionFinancial')} fields={financialFields} values={values} onChange={handleChange} readOnly={!editing} />
                        <LineItemsTable items={lineItems} editing={editing} onChange={setLineItems} />
                    </div>
                </div>
            </div>

            <ConfirmModal
                isOpen={showDeleteModal}
                title={t('deleteTitle')}
                message={t('deleteMessage')}
                confirmLabel={t('deleteConfirmLabel')}
                cancelLabel={t('deleteCancelLabel')}
                variant="danger"
                onConfirm={handleDeleteConfirm}
                onCancel={() => setShowDeleteModal(false)}
            />
        </Layout>
    );
};

export default InvoiceDetail;
