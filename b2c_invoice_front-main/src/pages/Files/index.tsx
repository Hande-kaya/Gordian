/**
 * Files Page - B2C
 * =================
 * Card-based layout showing all uploaded files by type (folder view).
 * Users can download or soft-delete files. Cascade deletes reconciliation links.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/layout/Layout';
import { useLang } from '../../shared/i18n';
import documentApi, { DocumentItem } from '../../services/documentApi';
import BulkUploadModal from '../InvoiceList/BulkUploadModal';
import DragDropOverlay from '../../components/common/DragDropOverlay';
import config from '../../utils/config';
import './Files.scss';

type FilesTab = 'invoice' | 'income' | 'bank-statement';

const FILES_FOLDERS: { key: FilesTab; label: string; color: string }[] = [
    { key: 'invoice', label: 'filesFolderExpenses', color: '#3b82f6' },
    { key: 'income', label: 'filesFolderIncome', color: '#10b981' },
    { key: 'bank-statement', label: 'filesFolderStatements', color: '#8b5cf6' },
];

const FolderIcon: React.FC<{ color: string; active: boolean }> = ({ color, active }) => (
    <svg viewBox="0 0 80 64" width="64" height="52" fill="none" className="files-folder__svg">
        <path
            d="M4 14C4 10.69 6.69 8 10 8H26L32 14H70C73.31 14 76 16.69 76 20V52C76 55.31 73.31 58 70 58H10C6.69 58 4 55.31 4 52V14Z"
            fill={color} opacity={active ? 0.2 : 0.1}
        />
        <path
            d="M4 22C4 18.69 6.69 16 10 16H70C73.31 16 76 18.69 76 22V52C76 55.31 73.31 58 70 58H10C6.69 58 4 55.31 4 52V22Z"
            fill={color} opacity={active ? 0.35 : 0.15}
        />
        <path
            d="M4 14C4 10.69 6.69 8 10 8H26C27.3 8 28.5 8.5 29.4 9.4L32 12H4V14Z"
            fill={color} opacity={active ? 0.5 : 0.25}
        />
    </svg>
);

const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatCurrency = (amount?: number, currency?: string): string => {
    if (!amount) return '';
    try {
        return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: currency || 'TRY' }).format(amount);
    } catch {
        return `${amount.toLocaleString('tr-TR')} ${currency || 'TRY'}`;
    }
};

const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
    );
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
        </svg>
    );
};

const Files: React.FC = () => {
    const { t } = useLang();
    const [activeTab, setActiveTab] = useState<FilesTab>('invoice');
    const [data, setData] = useState<DocumentItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [uploadModalOpen, setUploadModalOpen] = useState(false);
    const [droppedFiles, setDroppedFiles] = useState<File[] | undefined>(undefined);

    const handleGlobalDrop = useCallback((files: File[]) => {
        setDroppedFiles(files);
        setUploadModalOpen(true);
    }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await documentApi.getDocuments(1, 100, activeTab);
            if (res.success && res.data) {
                setData(res.data.documents);
            }
        } catch {
            // silently fail
        } finally {
            setLoading(false);
        }
    }, [activeTab]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleTabChange = useCallback((tab: FilesTab) => {
        setActiveTab(tab);
    }, []);

    const handleDownload = useCallback((id: string) => {
        const token = localStorage.getItem('token');
        if (!token) return;
        window.open(`${config.API_URL}/api/documents/${id}/download?token=${token}`, '_blank');
    }, []);

    const handleDelete = useCallback(async () => {
        if (!deleteId) return;
        setDeleting(true);
        try {
            const res = await documentApi.deleteDocument(deleteId);
            if (res.success) {
                setData(prev => prev.filter(d => d.id !== deleteId));
                setDeleteId(null);
            } else {
                alert(t('filesDeleteError'));
            }
        } catch {
            alert(t('filesDeleteError'));
        } finally {
            setDeleting(false);
        }
    }, [deleteId, t]);

    return (
        <Layout pageTitle={t('filesTitle')} pageDescription={t('filesDescription')}>
            <DragDropOverlay onDrop={handleGlobalDrop} label={t('dropzoneInlineHover')} />
            <div className="files">
                <div className="files__folders">
                    {FILES_FOLDERS.map(folder => (
                        <button
                            key={folder.key}
                            className={`files-folder ${activeTab === folder.key ? 'files-folder--active' : ''}`}
                            onClick={() => handleTabChange(folder.key)}
                            style={{ '--folder-color': folder.color } as React.CSSProperties}
                        >
                            <FolderIcon color={folder.color} active={activeTab === folder.key} />
                            <span className="files-folder__label">{t(folder.label)}</span>
                            {activeTab === folder.key && !loading && (
                                <span className="files-folder__badge">{data.length}</span>
                            )}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="files__loading">
                        <div className="files__loading-spinner" />
                        <span>{t('loading')}</span>
                    </div>
                ) : data.length === 0 ? (
                    <div className="files__empty">
                        <div className="files__empty-illustration">
                            <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
                                <circle cx="60" cy="60" r="50" fill="var(--bg-hover)" />
                                <path d="M35 45C35 41.69 37.69 39 41 39H53L57 45H79C82.31 45 85 47.69 85 51V75C85 78.31 82.31 81 79 81H41C37.69 81 35 78.31 35 75V45Z" fill="var(--bg-white)" stroke="var(--border-color)" strokeWidth="2" />
                                <line x1="50" y1="60" x2="70" y2="60" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 3" />
                                <line x1="50" y1="67" x2="65" y2="67" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 3" />
                            </svg>
                        </div>
                        <h3 className="files__empty-title">{t('filesEmpty')}</h3>
                    </div>
                ) : (
                    <div className="files__grid">
                        {data.map(doc => {
                            const supplier = doc.extracted_data?.supplier_name || doc.extracted_data?.vendor?.name || '';
                            const amount = doc.extracted_data?.financials?.total_amount || doc.extracted_data?.total_amount;
                            const currency = doc.extracted_data?.financials?.currency || doc.extracted_data?.currency || 'TRY';
                            const docDate = doc.extracted_data?.invoice_date || doc.extracted_data?.document_date || '';
                            return (
                                <div key={doc.id} className="files-card">
                                    <div className="files-card__icon">{getFileIcon(doc.filename)}</div>
                                    <div className="files-card__body">
                                        <div className="files-card__filename" title={doc.filename}>{doc.filename}</div>
                                        <div className="files-card__meta">
                                            {supplier && <span className="files-card__supplier">{supplier}</span>}
                                            {amount ? <span className="files-card__amount">{formatCurrency(amount, currency)}</span> : null}
                                            <span className="files-card__size">{formatFileSize(doc.file_size)}</span>
                                        </div>
                                        <div className="files-card__dates">
                                            {docDate && (
                                                <span className="files-card__doc-date">
                                                    {t('filesDocDate')}: {docDate}
                                                </span>
                                            )}
                                            <span className="files-card__upload-date">
                                                {t('filesUploadDate')}: {new Date(doc.created_at).toLocaleDateString('tr-TR')}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="files-card__actions">
                                        <button
                                            className="files-card__download-btn"
                                            onClick={() => handleDownload(doc.id)}
                                            title={t('filesDownload')}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                <polyline points="7 10 12 15 17 10" />
                                                <line x1="12" y1="15" x2="12" y2="3" />
                                            </svg>
                                            <span>{t('filesDownload')}</span>
                                        </button>
                                        <button
                                            className="files-card__delete-btn"
                                            onClick={() => setDeleteId(doc.id)}
                                            title={t('filesDelete')}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="3 6 5 6 21 6" />
                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                            </svg>
                                            <span>{t('filesDelete')}</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Delete Confirmation Modal */}
                {deleteId && (
                    <div className="files__modal-overlay" onClick={() => !deleting && setDeleteId(null)}>
                        <div className="files__modal" onClick={e => e.stopPropagation()}>
                            <div className="files__modal-icon">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                    <line x1="12" y1="9" x2="12" y2="13" />
                                    <line x1="12" y1="17" x2="12.01" y2="17" />
                                </svg>
                            </div>
                            <h3 className="files__modal-title">{t('filesDelete')}</h3>
                            <p className="files__modal-text">{t('filesDeleteConfirm')}</p>
                            <div className="files__modal-actions">
                                <button
                                    className="files__modal-cancel"
                                    onClick={() => setDeleteId(null)}
                                    disabled={deleting}
                                >
                                    {t('deleteCancelLabel')}
                                </button>
                                <button
                                    className="files__modal-confirm"
                                    onClick={handleDelete}
                                    disabled={deleting}
                                >
                                    {deleting ? t('preparing') : t('filesDelete')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            <BulkUploadModal
                isOpen={uploadModalOpen}
                onClose={() => { setUploadModalOpen(false); setDroppedFiles(undefined); }}
                onUploadComplete={() => { setUploadModalOpen(false); setDroppedFiles(undefined); fetchData(); }}
                initialFiles={droppedFiles}
                docType={activeTab}
            />
        </Layout>
    );
};

export default Files;
