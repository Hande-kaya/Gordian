/**
 * Invoice List Page - B2C
 * ========================
 * Adapted from invoice-management. Differences:
 * - No RFQ nav items, only "Faturalar"
 * - Uses B2C AuthContext (not shared)
 * - Logout goes to /login (not Portal)
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { DataDashboard } from '../../shared/components';
import { useLang } from '../../shared/i18n';
import { useAuth } from '../../context/AuthContext';
import { useOnboarding } from '../../context/OnboardingContext';
import { tutorialSteps } from '../../components/tutorial/tutorialSteps';
import documentApi, { DocumentItem } from '../../services/documentApi';
import InvoiceExportModal, { ExportConfig } from './InvoiceExportModal';
import BulkUploadModal from './BulkUploadModal';
import { exportInvoicesToExcel } from '../../utils/invoiceExport';
import { getInvoiceColumns } from './columns';
import { useCategories } from '../../context/CategoryContext';
import { DISPLAY_CURRENCIES, getPreferredCurrency, setPreferredCurrency, convertCurrency } from '../../utils/currency';
import { useUnsavedChanges, guardNavigation } from '../../shared/hooks/useUnsavedChanges';
import ConfirmModal from '../../components/common/ConfirmModal';
import DragDropOverlay from '../../components/common/DragDropOverlay';
import { DashboardIcon, ExpenseIcon, IncomeIcon, BankIcon, ReconciliationIcon, TrashIcon, FilesIcon, SettingsIcon } from '../../shared/icons/NavIcons';
import './InvoiceList.scss';

interface InvoiceListProps {
    docType?: 'invoice' | 'income';
}

const InvoiceList: React.FC<InvoiceListProps> = ({ docType = 'invoice' }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout } = useAuth();
    const { t, lang } = useLang();
    const { categories, getLabelByKey } = useCategories();
    const { showTutorial, tutorialStep } = useOnboarding();

    // SWR: show cached docs instantly, refresh in background
    const listCacheKey = `doc_list_${docType}`;
    const cachedList = (() => {
        try {
            const raw = sessionStorage.getItem(listCacheKey);
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    })();

    const [data, setData] = useState<DocumentItem[]>(cachedList?.documents ?? []);
    const [loading, setLoading] = useState(!cachedList);
    const [error, setError] = useState<string | null>(null);
    const [pagination, setPagination] = useState(cachedList?.pagination ?? {
        page: 1, limit: 20, total: 0, pages: 1,
        has_next: false, has_prev: false
    });

    const [isEditing, setIsEditing] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [displayCurrency, setDisplayCurrency] = useState(getPreferredCurrency);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [deleteIds, setDeleteIds] = useState<string[]>([]);
    const [dropzoneHover, setDropzoneHover] = useState(false);
    const [droppedFiles, setDroppedFiles] = useState<File[] | undefined>(undefined);
    const [hasPendingEdits, setHasPendingEdits] = useState(false);
    const [matchFilter, setMatchFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
    const [matchSummary, setMatchSummary] = useState({ matched: 0, unmatched: 0 });

    const { isBlocked, confirmLeave, cancelLeave } = useUnsavedChanges(isEditing && hasPendingEdits);

    const navItems = useMemo(() => [
        { id: 'dashboard', label: t('navDashboard'), icon: <DashboardIcon />, route: '/dashboard' },
        { id: 'expenses', label: t('navExpenses'), icon: <ExpenseIcon />, route: '/invoices', dataTutorial: 'expenses-nav' },
        { id: 'income', label: t('navIncome'), icon: <IncomeIcon />, route: '/income' },
        { id: 'files', label: t('navFiles'), icon: <FilesIcon />, route: '/files' },
        { id: 'bank-statements', label: t('navBankStatements'), icon: <BankIcon />, route: '/bank-statements' },
        { id: 'reconciliation', label: t('navReconciliation'), icon: <ReconciliationIcon />, route: '/reconciliation' },
        { id: 'trash', label: t('navTrash'), icon: <TrashIcon />, route: '/trash' },
        { id: 'sep', label: '', icon: null, isSeparator: true },
        { id: 'settings', label: t('navSettings'), icon: <SettingsIcon />, route: '/settings', dataTutorial: 'settings-nav' },
    ], [t]);

    const logoEl = <span className="b2c-logo">Invoice<span>Manager</span></span>;

    const sidebarConfig = useMemo(() => ({
        logo: logoEl,
        navItems,
        currentRoute: location.pathname + location.search,
        onNavigate: (route: string) => {
            if (!guardNavigation(() => navigate(route))) navigate(route);
        },
        user: {
            name: user?.name || 'User',
            email: user?.email || '',
            avatar: user?.profile_photo,
        },
        onLogout: () => {
            logout();
            navigate('/');
        }
    }), [navItems, location.pathname, location.search, navigate, user, logout]);

    // Split docs: processing vs failed vs cancelled vs ready
    const processingDocs = useMemo(() =>
        data.filter(d => d.ocr_status === 'pending' || d.ocr_status === 'processing'), [data]);
    const failedDocs = useMemo(() =>
        data.filter(d => d.ocr_status === 'failed'), [data]);
    const cancelledDocs = useMemo(() =>
        data.filter(d => d.ocr_status === 'cancelled'), [data]);
    const readyDocs = useMemo(() =>
        data.filter(d => d.ocr_status !== 'pending' && d.ocr_status !== 'processing'), [data]);

    const flattenedData = useMemo(() => {
        return readyDocs.map(item => {
            const totalAmt = item.extracted_data?.financials?.total_amount || item.extracted_data?.total_amount || 0;
            const fromCurr = item.extracted_data?.financials?.currency || item.extracted_data?.currency || '';
            const converted = convertCurrency(totalAmt, fromCurr, displayCurrency);
            return {
                ...item,
                vendor_name: item.extracted_data?.vendor?.name || item.extracted_data?.supplier_name || '',
                supplier_tax_id: item.extracted_data?.supplier_tax_id || item.extracted_data?.vendor?.tax_id || '',
                supplier_address: item.extracted_data?.supplier_address || item.extracted_data?.vendor?.address || '',
                invoice_number: item.extracted_data?.invoice_number || '',
                invoice_date: item.extracted_data?.invoice_date || '',
                due_date: item.extracted_data?.due_date || '',
                total_amount: totalAmt,
                currency: fromCurr,
                converted_amount: converted ?? totalAmt,
                total_tax_amount: item.extracted_data?.total_tax_amount || item.extracted_data?.financials?.tax || 0,
                net_amount: item.extracted_data?.net_amount || item.extracted_data?.financials?.subtotal || 0,
                line_items_count: item.extracted_data?.line_items?.length || item.extracted_data?.items?.length || 0,
                expense_category: (item as any).expense_category || item.extracted_data?.expense_category || ''
            };
        });
    }, [readyDocs, displayCurrency]);

    // Inject sample row during tutorial when table is empty (new user)
    const displayData = useMemo(() => {
        if (showTutorial && flattenedData.length === 0) {
            const isEn = lang === 'en';
            return [{
                id: 'sample-001',
                filename: isEn ? 'restaurant_invoice.pdf' : 'restoran_fatura.pdf',
                ocr_status: 'completed',
                created_at: new Date().toISOString(),
                vendor_name: isEn ? 'The Capital Grille' : 'Nusret Steakhouse',
                supplier_tax_id: isEn ? 'US-47291038' : '8520147963',
                invoice_number: isEn ? 'TCG-2026-009174' : 'NSR-2026-014823',
                invoice_date: '2026-02-15',
                total_amount: isEn ? 285.50 : 4850.00,
                currency: isEn ? 'USD' : 'TRY',
                converted_amount: isEn ? 285.50 : 4850.00,
                total_tax_amount: isEn ? 37.24 : 738.00,
                net_amount: isEn ? 248.26 : 4112.00,
                line_items_count: 5,
                expense_category: 'food',
            }];
        }
        return flattenedData;
    }, [flattenedData, showTutorial, lang]);

    // Auto-open export modal when tutorial reaches export step
    const exportStepIndex = tutorialSteps.findIndex(s => s.id === 'export-modal');
    useEffect(() => {
        if (showTutorial && tutorialStep === exportStepIndex) {
            setIsExportModalOpen(true);
        } else if (showTutorial) {
            setIsExportModalOpen(false);
        }
    }, [showTutorial, tutorialStep, exportStepIndex]);

    // Polling refs
    const pollingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reprocessTriggered = useRef(false);
    const mountedRef = useRef(true);

    const hasDataRef = useRef(!!cachedList);

    const fetchData = useCallback(async (params: any = {}) => {
        const isPolling = params._polling === true;
        const currentFilter = params._matchFilter ?? matchFilter;
        if (!isPolling && !hasDataRef.current) {
            setLoading(true);
        }
        if (!isPolling) setError(null);
        try {
            const page = params.page || 1;
            const limit = params.limit || 20;
            const response = await documentApi.getDocuments(page, limit, docType, currentFilter);
            if (response.success && response.data) {
                const docs = response.data.documents;
                setData(docs);
                hasDataRef.current = true;
                const pag = {
                    page: response.data.page, limit: response.data.page_size,
                    total: response.data.total,
                    pages: Math.ceil(response.data.total / response.data.page_size),
                    has_next: response.data.has_next, has_prev: response.data.has_prev
                };
                setPagination(pag);

                if (response.data.match_summary) {
                    setMatchSummary(response.data.match_summary);
                }

                // Cache first page for SWR on next visit (only for 'all' filter)
                if (page === 1 && !isPolling && currentFilter === 'all') {
                    try {
                        sessionStorage.setItem(listCacheKey, JSON.stringify({ documents: docs, pagination: pag }));
                    } catch { /* quota */ }
                }

                // Poll while docs are still processing
                const hasActive = docs.some(
                    (d: DocumentItem) => d.ocr_status === 'pending' || d.ocr_status === 'processing'
                );
                if (hasActive) {
                    if (pollingTimer.current) clearTimeout(pollingTimer.current);
                    pollingTimer.current = setTimeout(() => {
                        if (mountedRef.current) fetchData({ page, limit, _polling: true, _matchFilter: currentFilter });
                    }, 3000);
                }
            } else if (!isPolling) {
                setError(response.message || 'Failed to fetch invoices');
            }
        } catch {
            if (!isPolling) setError('Error connecting to server');
        } finally {
            if (!isPolling) setLoading(false);
        }
    }, [docType, listCacheKey, matchFilter]);

    useEffect(() => {
        mountedRef.current = true;
        fetchData();
        return () => {
            mountedRef.current = false;
            if (pollingTimer.current) clearTimeout(pollingTimer.current);
        };
    }, [fetchData]);

    const handleDataFetch = (newParams: any) => { fetchData(newParams); };

    const formatCurrency = (amount?: number, currency?: string): string => {
        if (amount === undefined || amount === null) return '-';
        if (!currency) {
            return amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        try {
            return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(amount);
        } catch {
            return `${amount.toLocaleString('tr-TR')} ${currency}`;
        }
    };

    const handleCurrencyChange = useCallback((currency: string) => {
        setDisplayCurrency(currency);
        setPreferredCurrency(currency);
    }, []);

    const handleMatchFilterChange = useCallback((f: 'all' | 'matched' | 'unmatched') => {
        setMatchFilter(f);
        fetchData({ page: 1, limit: pagination.limit, _matchFilter: f });
    }, [fetchData, pagination.limit]);

    const columns = useMemo(() => getInvoiceColumns(formatCurrency, t, displayCurrency, categories, getLabelByKey), [t, displayCurrency, categories, getLabelByKey]);

    const handleSaveChanges = useCallback(async (changes: Record<string, Record<string, any>>) => {
        try {
            const promises = Object.entries(changes).map(([docId, fields]) =>
                documentApi.updateDocumentFields(docId, fields)
            );
            await Promise.all(promises);
            setIsEditing(false);
            fetchData({ page: pagination.page, limit: pagination.limit });
        } catch (err) {
            console.error('Failed to save changes:', err);
        }
    }, [fetchData, pagination]);

    const handleView = useCallback(() => {
        const base = docType === 'income' ? '/income' : '/invoices';
        if (selectedIds.length === 1) navigate(`${base}/${selectedIds[0]}`);
    }, [selectedIds, navigate, docType]);

    const handleDelete = useCallback((ids: string[]) => {
        setDeleteIds(ids);
    }, []);

    const handleDeleteConfirm = useCallback(async () => {
        const ids = deleteIds;
        setDeleteIds([]);
        try {
            await Promise.all(ids.map(id => documentApi.deleteDocument(id)));
            fetchData({ page: pagination.page, limit: pagination.limit });
        } catch {
            alert(t('deleteError'));
        }
    }, [deleteIds, fetchData, pagination, t]);

    const handleCancelProcessing = useCallback(async (docId: string) => {
        await documentApi.cancelProcessing(docId);
        fetchData({ page: pagination.page, limit: pagination.limit, _polling: true });
    }, [fetchData, pagination]);

    const handleRetryDocument = useCallback(async (docId: string) => {
        await documentApi.retryDocument(docId);
        fetchData({ page: pagination.page, limit: pagination.limit, _polling: true });
    }, [fetchData, pagination]);

    const handleDismissDocument = useCallback(async (docId: string) => {
        await documentApi.deleteDocument(docId);
        fetchData({ page: pagination.page, limit: pagination.limit });
    }, [fetchData, pagination]);

    const fetchAllInvoicesForExport = async (): Promise<DocumentItem[]> => {
        const all: DocumentItem[] = [];
        let page = 1, hasMore = true;
        while (hasMore) {
            const r = await documentApi.getDocuments(page, 100, docType);
            if (r.success && r.data) { all.push(...r.data.documents); hasMore = r.data.has_next; page++; }
            else hasMore = false;
        }
        return all;
    };

    const handleExportConfirm = async (config: ExportConfig) => {
        setIsExporting(true);
        try {
            const allInvoices = await fetchAllInvoicesForExport();
            exportInvoicesToExcel(allInvoices, {
                startDate: config.startDate,
                endDate: config.endDate,
                sheetMonths: config.sheetMonths,
            });
            setIsExportModalOpen(false);
        } catch {
            alert(t('exportError'));
        } finally {
            setIsExporting(false);
        }
    };

    const handleDropzoneDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDropzoneHover(true);
    }, []);

    const handleDropzoneDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDropzoneHover(false);
    }, []);

    const handleDropzoneDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDropzoneHover(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            setDroppedFiles(files);
            setIsUploadModalOpen(true);
        }
    }, []);

    const handleDropzoneClick = useCallback(() => {
        setDroppedFiles(undefined);
        setIsUploadModalOpen(true);
    }, []);

    const renderDocBanner = (
        docs: DocumentItem[], variant: string, titleKey: string,
        statusLabel: (d: DocumentItem) => string,
        extra?: { spinner?: boolean; cancel?: boolean; retry?: boolean; dismiss?: boolean }
    ) => docs.length === 0 ? null : (
        <div className={`processing-banner${variant ? ` processing-banner--${variant}` : ''}`}>
            <div className="processing-banner__header">
                {extra?.spinner && <div className="processing-banner__spinner" />}
                <span className="processing-banner__title">
                    {t(titleKey).replace('{count}', String(docs.length))}
                </span>
            </div>
            <div className="processing-banner__files">
                {docs.map(doc => (
                    <div key={doc.id} className="processing-banner__file">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span className="processing-banner__filename">{doc.filename}</span>
                        <span className={`processing-banner__status processing-banner__status--${doc.ocr_status}`}>
                            {statusLabel(doc)}
                        </span>
                        {extra?.retry && (
                            <button className="processing-banner__action processing-banner__action--retry"
                                onClick={(e) => { e.stopPropagation(); handleRetryDocument(doc.id); }}
                                title={t('retry')}>&#x21bb;</button>
                        )}
                        {extra?.cancel && (
                            <button className="processing-banner__action processing-banner__action--cancel"
                                onClick={(e) => { e.stopPropagation(); handleCancelProcessing(doc.id); }}
                                title={t('cancelProcessing')}>&times;</button>
                        )}
                        {extra?.dismiss && (
                            <button className="processing-banner__action processing-banner__action--cancel"
                                onClick={(e) => { e.stopPropagation(); handleDismissDocument(doc.id); }}
                                title={t('dismiss')}>&times;</button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );

    const topContent = (
        <>
            <div
                className={`upload-dropzone${dropzoneHover ? ' upload-dropzone--hover' : ''}`}
                data-tutorial="upload-btn"
                onDragOver={handleDropzoneDragOver}
                onDragLeave={handleDropzoneDragLeave}
                onDrop={handleDropzoneDrop}
                onClick={handleDropzoneClick}
            >
                <span className="upload-dropzone__icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                </span>
                <span className="upload-dropzone__text">
                    {dropzoneHover ? t('dropzoneInlineHover') : t('dropzoneInline')}
                </span>
            </div>
            {renderDocBanner(processingDocs, '', 'processingCount',
                d => d.ocr_status === 'processing' ? t('statusProcessing') : t('statusPending'),
                { spinner: true, cancel: true })}
            {renderDocBanner(failedDocs, 'failed', 'failedCount',
                () => t('statusFailed'), { retry: true, dismiss: true })}
            {renderDocBanner(cancelledDocs, 'cancelled', 'cancelledCount',
                () => t('statusCancelled'), { retry: true, dismiss: true })}
            <div className="match-filter-tabs">
                {(['all', 'matched', 'unmatched'] as const).map(f => (
                    <button
                        key={f}
                        className={`match-filter-tabs__tab${matchFilter === f ? ' match-filter-tabs__tab--active' : ''}`}
                        onClick={() => handleMatchFilterChange(f)}
                    >
                        {f === 'all' && `${t('filterAll')} (${matchSummary.matched + matchSummary.unmatched || pagination.total})`}
                        {f === 'matched' && `${t('filterMatched')} (${matchSummary.matched})`}
                        {f === 'unmatched' && `${t('filterUnmatched')} (${matchSummary.unmatched})`}
                    </button>
                ))}
            </div>
        </>
    );

    const customHeaderActions = (
        <>
            <div className="currency-selector">
                <label className="currency-selector__label">{t('displayCurrency')}</label>
                <select
                    className="currency-selector__select"
                    value={displayCurrency}
                    onChange={e => handleCurrencyChange(e.target.value)}
                >
                    {DISPLAY_CURRENCIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>
            </div>
            <button
                className="action-button"
                onClick={handleView}
                disabled={selectedIds.length !== 1}
                title={selectedIds.length !== 1 ? t('viewTooltipSingle') : t('viewTooltipReady')}
            >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                </svg>
                {t('view')}
            </button>
        </>
    );

    const handleGlobalDrop = useCallback((files: File[]) => {
        setDroppedFiles(files);
        setIsUploadModalOpen(true);
    }, []);

    return (
        <>
            <DragDropOverlay onDrop={handleGlobalDrop} label={t('dropzoneInlineHover')} />
            <DataDashboard
                title={docType === 'income' ? t('incomeTitle') : t('expensesTitle')}
                pageDescription={docType === 'income' ? t('incomeDescription') : t('expensesDescription')}
                collection="invoices_v3"
                data={displayData}
                columns={columns}
                isLoading={loading}
                error={error}
                onSelectionChange={setSelectedIds}
                onDataFetch={handleDataFetch}
                onExport={() => setIsExportModalOpen(true)}
                paginationInfo={pagination}
                showAddButton={false}
                showEditButton={true}
                showDeleteButton={true}
                onDelete={handleDelete}
                showExportButton={true}
                isEditing={isEditing}
                onEditToggle={() => setIsEditing(prev => !prev)}
                onSaveChanges={handleSaveChanges}
                onPendingChangesChange={setHasPendingEdits}
                customHeaderActions={customHeaderActions}
                topContent={topContent}
                sidebarConfig={sidebarConfig}
            />
            <InvoiceExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} onExport={handleExportConfirm} isLoading={isExporting} />
            <BulkUploadModal isOpen={isUploadModalOpen} onClose={() => { setIsUploadModalOpen(false); setDroppedFiles(undefined); }} onUploadComplete={() => fetchData({ page: 1, limit: 20 })} initialFiles={droppedFiles} docType={docType} />
            <ConfirmModal
                isOpen={isBlocked}
                title={t('unsavedTitle')}
                message={t('unsavedMessage')}
                confirmLabel={t('unsavedLeave')}
                cancelLabel={t('unsavedStay')}
                variant="danger"
                onConfirm={confirmLeave}
                onCancel={cancelLeave}
            />
            <ConfirmModal
                isOpen={deleteIds.length > 0}
                title={t('deleteTitle')}
                message={t('deleteConfirmMsg').replace('{count}', String(deleteIds.length))}
                confirmLabel={t('deleteConfirmLabel')}
                cancelLabel={t('deleteCancelLabel')}
                variant="danger"
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeleteIds([])}
            />
        </>
    );
};

export default InvoiceList;
