/**
 * BankStatementDetail Page - B2C
 * ================================
 * Two-column layout: PDF viewer (left) + fields & transactions (right).
 * Pattern: adapted from InvoiceDetail.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Layout from '../../shared/layout/Layout';
import { useLang } from '../../shared/i18n';
import { useAuth } from '../../context/AuthContext';
import { useDateFormat } from '../../context/DateFormatContext';
import documentApi, { DocumentItem } from '../../services/documentApi';
import FieldSection, { FieldDef } from '../InvoiceDetail/FieldSection';
import PdfViewerPanel, { EntityWithBounds } from '../InvoiceDetail/PdfViewerPanel';
import TransactionsTable, { Transaction } from './TransactionsTable';
import ConfirmModal from '../../components/common/ConfirmModal';
import { DashboardIcon, ExpenseIcon, RevenueIcon, BankIcon, ReconciliationIcon, TrashIcon, FilesIcon, SettingsIcon } from '../../shared/icons/NavIcons';
import './BankStatementDetail.scss';

function flattenDoc(doc: DocumentItem): Record<string, any> {
    const ed = doc.extracted_data || {};
    return {
        bank_name: ed.bank_name || '',
        account_holder: ed.account_holder || '',
        account_number: ed.account_number || '',
        card_number: ed.card_number || '',
        statement_date: ed.statement_date || '',
        statement_period_start: ed.statement_period_start || '',
        statement_period_end: ed.statement_period_end || '',
        opening_balance: ed.opening_balance ?? '',
        closing_balance: ed.closing_balance ?? '',
        total_debits: ed.total_debits ?? '',
        total_credits: ed.total_credits ?? '',
        minimum_payment: ed.minimum_payment ?? '',
        due_date: ed.due_date || '',
        currency: ed.currency || '',
    };
}

function getTransactions(doc: DocumentItem): Transaction[] {
    return (doc.extracted_data?.transactions || []) as Transaction[];
}

const BankStatementDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useLang();
    const { user, logout } = useAuth();
    const { fmtDate } = useDateFormat();

    const COMMON_CURRENCIES = ['EUR', 'USD', 'TRY', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF'];

    const statementDetailFields: FieldDef[] = useMemo(() => [
        { key: 'bank_name', label: t('fieldBankName') },
        { key: 'account_holder', label: t('fieldAccountHolder') },
        { key: 'account_number', label: t('fieldAccountNumber') },
        { key: 'card_number', label: t('fieldCardNumber') },
        { key: 'statement_date', label: t('fieldStatementDate'), type: 'date' },
        { key: 'statement_period_start', label: t('fieldStatementPeriodStart'), type: 'date' },
        { key: 'statement_period_end', label: t('fieldStatementPeriodEnd'), type: 'date' },
        { key: 'opening_balance', label: t('fieldOpeningBalance'), type: 'number' },
        { key: 'closing_balance', label: t('fieldClosingBalance'), type: 'number' },
        { key: 'total_debits', label: t('fieldTotalDebits'), type: 'number' },
        { key: 'total_credits', label: t('fieldTotalCredits'), type: 'number' },
        { key: 'minimum_payment', label: t('fieldMinimumPayment'), type: 'number' },
        { key: 'due_date', label: t('fieldDueDate'), type: 'date' },
    ], [t]);

    const [doc, setDoc] = useState<DocumentItem | null>(null);
    const [values, setValues] = useState<Record<string, any>>({});
    const [originalValues, setOriginalValues] = useState<Record<string, any>>({});
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [highlightsOn, setHighlightsOn] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [editedTransactions, setEditedTransactions] = useState<Transaction[] | null>(null);
    const [editedCurrency, setEditedCurrency] = useState<string | null>(null);

    const navItems = useMemo(() => [
        { id: 'dashboard', label: t('navDashboard'), icon: <DashboardIcon />, route: '/dashboard' },
        { id: 'reconciliation', label: t('navReconciliation'), icon: <ReconciliationIcon />, route: '/reconciliation' },
        { id: 'bank-statements', label: t('navBankStatements'), icon: <BankIcon />, route: '/bank-statements' },
        { id: 'expenses', label: t('navExpenses'), icon: <ExpenseIcon />, route: '/invoices' },
        { id: 'revenue', label: t('navRevenue'), icon: <RevenueIcon />, route: '/revenue' },
        { id: 'files', label: t('navFiles'), icon: <FilesIcon />, route: '/files' },
        { id: 'trash', label: t('navTrash'), icon: <TrashIcon />, route: '/trash' },
        { id: 'sep', label: '', icon: null, isSeparator: true },
        { id: 'settings', label: t('navSettings'), icon: <SettingsIcon />, route: '/settings' },
    ], [t]);

    const fetchDocument = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        try {
            const res = await documentApi.getDocument(id);
            if (res.success && res.data) {
                setDoc(res.data);
                const flat = flattenDoc(res.data);
                setValues(flat);
                setOriginalValues(flat);
                setTransactions(getTransactions(res.data));
            } else {
                setError(res.message || t('invoiceNotFound'));
            }
        } catch {
            setError(t('serverError'));
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { fetchDocument(); }, [fetchDocument]);

    const handleChange = useCallback((key: string, value: any) => {
        setValues(prev => ({ ...prev, [key]: value }));
    }, []);

    const handleCancel = useCallback(() => {
        setValues({ ...originalValues });
        setEditedTransactions(null);
        setEditedCurrency(null);
        setEditing(false);
    }, [originalValues]);

    const handleSave = useCallback(async () => {
        if (!id) return;
        setSaving(true);
        try {
            // Save header field changes — exclude currency when sent via updateTransactions
            const changed: Record<string, any> = {};
            for (const k of Object.keys(values)) {
                if (values[k] !== originalValues[k]) {
                    if (k === 'currency' && editedCurrency) continue;
                    changed[k] = values[k];
                }
            }
            if (Object.keys(changed).length > 0) {
                await documentApi.updateDocumentFields(id, changed);
                setOriginalValues(prev => ({ ...prev, ...changed }));
            }

            // Save transaction + currency changes
            if (editedTransactions || editedCurrency) {
                const res = await documentApi.updateTransactions(
                    id,
                    editedTransactions || transactions,
                    editedCurrency || undefined,
                );
                if (res.success && res.data) {
                    setDoc(res.data);
                    const flat = flattenDoc(res.data);
                    setValues(flat);
                    setOriginalValues(flat);
                    setTransactions(getTransactions(res.data));
                }
                setEditedTransactions(null);
                setEditedCurrency(null);
            }

            setEditing(false);
        } catch {
            alert(t('saveError'));
        } finally {
            setSaving(false);
        }
    }, [id, values, originalValues, editedTransactions, editedCurrency, transactions]);

    const isBankStatement = doc?.type === 'bank-statement';
    const hasDateFormat = !!doc?.extracted_data?.date_format;
    const showSwapButton = isBankStatement || hasDateFormat;

    const handleSwapDates = useCallback(async () => {
        if (!id) return;
        try {
            const res = await documentApi.swapDocumentDates(id);
            if (res.success && res.data) {
                setDoc(res.data);
                const flat = flattenDoc(res.data);
                setValues(flat);
                setOriginalValues(flat);
                setTransactions(getTransactions(res.data));
                setEditedTransactions(null);
                setEditedCurrency(null);
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
            navigate('/bank-statements');
        } catch {
            alert(t('deleteError'));
        }
    }, [id, navigate]);

    const headerActions = useMemo(() => (
        <div className="header-actions">
            <div className="header-actions__left">
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
                        <button className="action-button" onClick={() => setEditing(true)}>
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
            <div className="header-actions__right">
                <button
                    className="header-action-btn"
                    onClick={() => navigate('/bank-statements')}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}>
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                    {t('backToStatements')}
                </button>
            </div>
        </div>
    ), [highlightsOn, editing, saving, handleCancel, handleSave, navigate]);

    const pageDescription = useMemo(() => {
        if (!doc) return undefined;
        const date = doc.created_at ? fmtDate(doc.created_at) : '';
        return date && date !== '-' ? `${doc.filename}  ·  ${date}` : doc.filename;
    }, [doc, fmtDate]);

    const logoEl = <span className="b2c-logo">Invoice<span>Manager</span></span>;

    const layoutProps = useMemo(() => ({
        pageTitle: t('statementDetailTitle'),
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
        const stored = (doc?.extracted_data?.entities_with_bounds || []) as EntityWithBounds[];
        if (stored.length > 0) return stored;

        // Fallback: build transaction_row entities from transaction position data
        const txEntities: EntityWithBounds[] = [];
        for (const tx of transactions) {
            const txAny = tx as any;
            if (txAny.page != null && txAny.y_min != null && txAny.y_max != null) {
                txEntities.push({
                    type: 'transaction_row',
                    value: tx.description || '',
                    confidence: 0.9,
                    bounding_box: [
                        { x: 0.02, y: txAny.y_min },
                        { x: 0.98, y: txAny.y_min },
                        { x: 0.98, y: txAny.y_max },
                        { x: 0.02, y: txAny.y_max },
                    ],
                    page: txAny.page,
                    source: 'line_pos',
                });
            }
        }
        return txEntities;
    }, [doc, transactions]);

    if (loading) {
        return (
            <Layout {...layoutProps}>
                <div className="bank-statement-detail__loading">{t('loading')}</div>
            </Layout>
        );
    }

    if (error || !doc) {
        return (
            <Layout {...layoutProps}>
                <div className="bank-statement-detail__error">{error || t('invoiceNotFound')}</div>
            </Layout>
        );
    }

    return (
        <Layout {...layoutProps}>
            <div className="bank-statement-detail">
                <div className="bank-statement-detail__body">
                    <div className="bank-statement-detail__pdf-col">
                        <PdfViewerPanel
                            documentId={id!}
                            parentDocumentId={(doc as any).parent_document_id}
                            entities={entities}
                            showHighlights={highlightsOn}
                            filename={doc.filename}
                        />
                    </div>

                    <div className="bank-statement-detail__fields-col">
                        {/* Format Settings — date format + currency (only editable in edit mode) */}
                        <div className={`format-settings${!editing ? ' format-settings--disabled' : ''}`}>
                            <h3 className="format-settings__title">{t('sectionFormatSettings')}</h3>
                            <div className="format-settings__grid">
                                {showSwapButton && (
                                    <div className="format-settings__item">
                                        <span className="format-settings__label">{t('formatDateLabel')}</span>
                                        <button
                                            className="format-settings__swap-btn"
                                            onClick={handleSwapDates}
                                            disabled={!editing}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                                                <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                                            </svg>
                                            DD/MM ↔ MM/DD
                                        </button>
                                        <p className="format-settings__desc">{t('formatDateDesc')}</p>
                                    </div>
                                )}
                                <div className="format-settings__item">
                                    <span className="format-settings__label">{t('formatCurrencyLabel')}</span>
                                    <select
                                        className="format-settings__currency-select"
                                        value={editedCurrency || values.currency || 'EUR'}
                                        onChange={e => {
                                            setEditedCurrency(e.target.value);
                                            handleChange('currency', e.target.value);
                                        }}
                                        disabled={!editing}
                                    >
                                        {COMMON_CURRENCIES.map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                    <p className="format-settings__desc">{t('formatCurrencyDesc')}</p>
                                </div>
                            </div>
                        </div>

                        <TransactionsTable
                            transactions={editedTransactions || transactions}
                            currency={editedCurrency || values.currency || 'EUR'}
                            editable={editing}
                            onTransactionsChange={txs => setEditedTransactions(txs)}
                        />

                        <FieldSection
                            title={t('sectionStatementDetails')}
                            fields={statementDetailFields}
                            values={values}
                            onChange={handleChange}
                            readOnly={!editing}
                            fmtDate={fmtDate}
                        />
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

export default BankStatementDetail;
