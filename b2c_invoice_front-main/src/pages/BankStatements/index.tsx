/**
 * Bank Statements Page - B2C
 * ===========================
 * Full DataDashboard page for bank statement management.
 * Pattern: adapted from InvoiceList with bank-statement-specific columns.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { DataDashboard } from '../../shared/components';
import { useLang } from '../../shared/i18n';
import { useAuth } from '../../context/AuthContext';
import documentApi, { DocumentItem } from '../../services/documentApi';
import BulkUploadModal from '../InvoiceList/BulkUploadModal';
import { getBankStatementColumns } from './columns';
import ConfirmModal from '../../components/common/ConfirmModal';
import { DashboardIcon, ExpenseIcon, IncomeIcon, BankIcon, ReconciliationIcon, TrashIcon, FilesIcon, SettingsIcon } from '../../shared/icons/NavIcons';
import './BankStatements.scss';

const BankStatements: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout } = useAuth();
    const { t } = useLang();

    const [data, setData] = useState<DocumentItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pagination, setPagination] = useState({
        page: 1, limit: 20, total: 0, pages: 1,
        has_next: false, has_prev: false,
    });

    const [isEditing, setIsEditing] = useState(false);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [deleteIds, setDeleteIds] = useState<string[]>([]);
    const [dropzoneHover, setDropzoneHover] = useState(false);
    const [droppedFiles, setDroppedFiles] = useState<File[] | undefined>(undefined);
    const [hasPendingEdits, setHasPendingEdits] = useState(false);

    const navItems = useMemo(() => [
        { id: 'dashboard', label: t('navDashboard'), icon: <DashboardIcon />, route: '/dashboard' },
        { id: 'expenses', label: t('navExpenses'), icon: <ExpenseIcon />, route: '/invoices' },
        { id: 'income', label: t('navIncome'), icon: <IncomeIcon />, route: '/income' },
        { id: 'files', label: t('navFiles'), icon: <FilesIcon />, route: '/files' },
        { id: 'bank-statements', label: t('navBankStatements'), icon: <BankIcon />, route: '/bank-statements' },
        { id: 'reconciliation', label: t('navReconciliation'), icon: <ReconciliationIcon />, route: '/reconciliation' },
        { id: 'trash', label: t('navTrash'), icon: <TrashIcon />, route: '/trash' },
        { id: 'sep', label: '', icon: null, isSeparator: true },
        { id: 'settings', label: t('navSettings'), icon: <SettingsIcon />, route: '/settings' },
    ], [t]);

    const logoEl = <span className="b2c-logo">Invoice<span>Manager</span></span>;

    const sidebarConfig = useMemo(() => ({
        logo: logoEl,
        navItems,
        currentRoute: location.pathname + location.search,
        onNavigate: (route: string) => navigate(route),
        user: {
            name: user?.name || 'User',
            email: user?.email || '',
            avatar: user?.profile_photo,
        },
        onLogout: () => { logout(); navigate('/'); },
    }), [navItems, location.pathname, location.search, navigate, user, logout]);

    // Split: processing vs ready
    const processingDocs = useMemo(() =>
        data.filter(d => d.ocr_status === 'pending' || d.ocr_status === 'processing'), [data]);
    const readyDocs = useMemo(() =>
        data.filter(d => d.ocr_status !== 'pending' && d.ocr_status !== 'processing'), [data]);

    const flattenedData = useMemo(() => {
        return readyDocs.map(item => ({
            ...item,
            bank_name: item.extracted_data?.bank_name || '',
            account_number: item.extracted_data?.account_number || '',
            statement_period_start: item.extracted_data?.statement_period_start || '',
            statement_period_end: item.extracted_data?.statement_period_end || '',
            opening_balance: item.extracted_data?.opening_balance || 0,
            closing_balance: item.extracted_data?.closing_balance || 0,
            total_debits: item.extracted_data?.total_debits || 0,
            total_credits: item.extracted_data?.total_credits || 0,
            transaction_count: item.extracted_data?.transactions?.length || 0,
            currency: item.extracted_data?.currency || '',
        }));
    }, [readyDocs]);

    // Polling refs
    const pollingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reprocessTriggered = useRef(false);
    const mountedRef = useRef(true);

    const fetchData = useCallback(async (params: any = {}) => {
        const isPolling = params._polling === true;
        if (!isPolling) { setLoading(true); setError(null); }
        try {
            const page = params.page || 1;
            const limit = params.limit || 20;
            const response = await documentApi.getDocuments(page, limit, 'bank-statement');
            if (response.success && response.data) {
                const docs = response.data.documents;
                setData(docs);
                setPagination({
                    page: response.data.page, limit: response.data.page_size,
                    total: response.data.total,
                    pages: Math.ceil(response.data.total / response.data.page_size),
                    has_next: response.data.has_next, has_prev: response.data.has_prev,
                });
                const hasActive = docs.some(
                    (d: DocumentItem) => d.ocr_status === 'pending' || d.ocr_status === 'processing'
                );
                if (hasActive) {
                    if (pollingTimer.current) clearTimeout(pollingTimer.current);
                    pollingTimer.current = setTimeout(() => {
                        if (mountedRef.current) fetchData({ page, limit, _polling: true });
                    }, 3000);
                }
            } else if (!isPolling) {
                setError(response.message || 'Failed to fetch bank statements');
            }
        } catch {
            if (!isPolling) setError('Error connecting to server');
        } finally {
            if (!isPolling) setLoading(false);
        }
    }, []);

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

    const columns = useMemo(
        () => getBankStatementColumns(formatCurrency, t),
        [t]
    );

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
        if (selectedIds.length === 1) navigate(`/bank-statements/${selectedIds[0]}`);
    }, [selectedIds, navigate]);

    const handleDelete = useCallback((ids: string[]) => { setDeleteIds(ids); }, []);

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

    const handleDropzoneDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setDropzoneHover(true);
    }, []);
    const handleDropzoneDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setDropzoneHover(false);
    }, []);
    const handleDropzoneDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault(); setDropzoneHover(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) { setDroppedFiles(files); setIsUploadModalOpen(true); }
    }, []);
    const handleDropzoneClick = useCallback(() => {
        setDroppedFiles(undefined); setIsUploadModalOpen(true);
    }, []);

    const processingBanner = processingDocs.length > 0 ? (
        <div className="processing-banner">
            <div className="processing-banner__header">
                <div className="processing-banner__spinner" />
                <span className="processing-banner__title">
                    {t('processingCount').replace('{count}', String(processingDocs.length))}
                </span>
            </div>
            <div className="processing-banner__files">
                {processingDocs.map(doc => (
                    <div key={doc.id} className="processing-banner__file">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span className="processing-banner__filename">{doc.filename}</span>
                        <span className={`processing-banner__status processing-banner__status--${doc.ocr_status}`}>
                            {doc.ocr_status === 'processing' ? t('statusProcessing') : t('statusPending')}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    ) : null;

    const topContent = (
        <>
            <div
                className={`upload-dropzone${dropzoneHover ? ' upload-dropzone--hover' : ''}`}
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
                    {dropzoneHover ? t('dropzoneInlineHover') : t('uploadStatement')}
                </span>
            </div>
            {processingBanner}
        </>
    );

    const customHeaderActions = (
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
    );

    return (
        <>
            <DataDashboard
                title={t('bankStatementsTitle')}
                pageDescription={t('bankStatementsDescription')}
                collection="bank_statements"
                data={flattenedData}
                columns={columns}
                isLoading={loading}
                error={error}
                onSelectionChange={setSelectedIds}
                onDataFetch={handleDataFetch}
                paginationInfo={pagination}
                showAddButton={false}
                showEditButton={true}
                showDeleteButton={true}
                onDelete={handleDelete}
                showExportButton={false}
                isEditing={isEditing}
                onEditToggle={() => setIsEditing(prev => !prev)}
                onSaveChanges={handleSaveChanges}
                onPendingChangesChange={setHasPendingEdits}
                customHeaderActions={customHeaderActions}
                topContent={topContent}
                sidebarConfig={sidebarConfig}
            />
            <BulkUploadModal
                isOpen={isUploadModalOpen}
                onClose={() => { setIsUploadModalOpen(false); setDroppedFiles(undefined); }}
                onUploadComplete={() => fetchData({ page: 1, limit: 20 })}
                initialFiles={droppedFiles}
                docType="bank-statement"
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

export default BankStatements;
