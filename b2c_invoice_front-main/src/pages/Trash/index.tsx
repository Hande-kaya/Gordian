/**
 * Trash Page - B2C
 * =================
 * Card-based layout with visual countdown, animated restore.
 * Shows soft-deleted documents. User can restore within 30 days.
 * Supports multi-select + permanent delete (empty trash).
 */

import React, { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/layout/Layout';
import { useLang } from '../../shared/i18n';
import documentApi, { DocumentItem } from '../../services/documentApi';
import './Trash.scss';

const TOTAL_DAYS = 30;

type TrashTab = 'invoice' | 'income' | 'bank-statement';

const TRASH_FOLDERS: { key: TrashTab; label: string; color: string }[] = [
    { key: 'invoice', label: 'trashTabExpenses', color: '#3b82f6' },
    { key: 'income', label: 'trashTabIncome', color: '#10b981' },
    { key: 'bank-statement', label: 'trashTabBankStatements', color: '#8b5cf6' },
];

const FolderIcon: React.FC<{ color: string; active: boolean }> = ({ color, active }) => (
    <svg viewBox="0 0 80 64" width="64" height="52" fill="none" className="trash-folder__svg">
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

const Trash: React.FC = () => {
    const { t } = useLang();
    const [activeTab, setActiveTab] = useState<TrashTab>('invoice');
    const [data, setData] = useState<DocumentItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [restoringId, setRestoringId] = useState<string | null>(null);
    const [restoredId, setRestoredId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [showConfirm, setShowConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await documentApi.getDeletedDocuments(1, 100, activeTab);
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

    const handleTabChange = useCallback((tab: TrashTab) => {
        setActiveTab(tab);
        setSelectedIds([]);
    }, []);

    const handleRestore = useCallback(async (id: string) => {
        setRestoringId(id);
        try {
            const res = await documentApi.restoreDocument(id);
            if (res.success) {
                setRestoredId(id);
                setSelectedIds(prev => prev.filter(sid => sid !== id));
                setTimeout(() => {
                    setData(prev => prev.filter(d => d.id !== id));
                    setRestoredId(null);
                }, 400);
            } else {
                alert(t('trashRestoreError'));
            }
        } catch {
            alert(t('trashRestoreError'));
        } finally {
            setRestoringId(null);
        }
    }, [t]);

    const handleToggleSelect = useCallback((id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
        );
    }, []);

    const handleSelectAll = useCallback(() => {
        if (selectedIds.length === data.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(data.map(d => d.id));
        }
    }, [selectedIds.length, data]);

    const handlePermanentDelete = useCallback(async () => {
        if (selectedIds.length === 0) return;
        setDeleting(true);
        try {
            const res = await documentApi.permanentDeleteDocuments(selectedIds);
            if (res.success) {
                setData(prev => prev.filter(d => !selectedIds.includes(d.id)));
                setSelectedIds([]);
                setShowConfirm(false);
            } else {
                alert(t('trashPermanentDeleteError'));
            }
        } catch {
            alert(t('trashPermanentDeleteError'));
        } finally {
            setDeleting(false);
        }
    }, [selectedIds, t]);

    const getDaysLeft = (deletedAt: string): number => {
        const deleted = new Date(deletedAt);
        const expiry = new Date(deleted.getTime() + TOTAL_DAYS * 24 * 60 * 60 * 1000);
        const now = new Date();
        return Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
    };

    const formatCurrency = (amount?: number, currency?: string): string => {
        if (!amount) return '-';
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

    const countdownCircle = (days: number) => {
        const ratio = days / TOTAL_DAYS;
        const circumference = 2 * Math.PI * 18;
        const offset = circumference * (1 - ratio);
        const isUrgent = days <= 5;
        const isExpired = days === 0;
        return (
            <div className={`countdown ${isUrgent ? 'countdown--urgent' : ''} ${isExpired ? 'countdown--expired' : ''}`}>
                <svg viewBox="0 0 40 40" className="countdown__svg">
                    <circle cx="20" cy="20" r="18" className="countdown__track" />
                    <circle cx="20" cy="20" r="18" className="countdown__progress"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        transform="rotate(-90 20 20)" />
                </svg>
                <div className="countdown__text">
                    <span className="countdown__number">{days}</span>
                    <span className="countdown__label">{t('trashDayUnit')}</span>
                </div>
            </div>
        );
    };

    const allSelected = data.length > 0 && selectedIds.length === data.length;

    return (
        <Layout pageTitle={t('trashTitle')} pageDescription={t('trashDescription')}>
            <div className="trash">
                <div className="trash__folders">
                    {TRASH_FOLDERS.map(folder => (
                        <button
                            key={folder.key}
                            className={`trash-folder ${activeTab === folder.key ? 'trash-folder--active' : ''}`}
                            onClick={() => handleTabChange(folder.key)}
                            style={{ '--folder-color': folder.color } as React.CSSProperties}
                        >
                            <FolderIcon color={folder.color} active={activeTab === folder.key} />
                            <span className="trash-folder__label">{t(folder.label)}</span>
                            {activeTab === folder.key && !loading && (
                                <span className="trash-folder__badge">{data.length}</span>
                            )}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="trash__loading">
                        <div className="trash__loading-spinner" />
                        <span>{t('loading')}</span>
                    </div>
                ) : data.length === 0 ? (
                    <div className="trash__empty">
                        <div className="trash__empty-illustration">
                            <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
                                <circle cx="60" cy="60" r="50" fill="var(--bg-hover)" />
                                <rect x="38" y="35" width="44" height="52" rx="4" fill="var(--bg-white)" stroke="var(--border-color)" strokeWidth="2" />
                                <path d="M34 42h52" stroke="var(--border-color)" strokeWidth="2" strokeLinecap="round" />
                                <path d="M50 35v-4a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v4" stroke="var(--border-color)" strokeWidth="2" strokeLinecap="round" />
                                <line x1="52" y1="50" x2="52" y2="75" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 3" />
                                <line x1="60" y1="50" x2="60" y2="75" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 3" />
                                <line x1="68" y1="50" x2="68" y2="75" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 3" />
                                <circle cx="90" cy="85" r="12" fill="var(--status-success-bg)" stroke="#10b981" strokeWidth="1.5" />
                                <polyline points="84,85 88,89 96,81" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <h3 className="trash__empty-title">{t('trashEmptyTitle')}</h3>
                        <p className="trash__empty-text">{t('trashEmptyText')}</p>
                    </div>
                ) : (
                    <>
                        <div className="trash__info-bar">
                            <div className="trash__info-left">
                                <label className="trash__select-all">
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={handleSelectAll}
                                    />
                                    <span>{t('trashSelectAll')}</span>
                                </label>
                                <div className="trash__info-badge">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="12" y1="16" x2="12" y2="12" />
                                        <line x1="12" y1="8" x2="12.01" y2="8" />
                                    </svg>
                                    <span>{t('trashAutoDelete')}</span>
                                </div>
                            </div>
                            <div className="trash__info-right">
                                {selectedIds.length > 0 && (
                                    <>
                                        <span className="trash__selected-count">
                                            {t('trashSelected').replace('{count}', String(selectedIds.length))}
                                        </span>
                                        <button
                                            className="trash__permanent-delete-btn"
                                            onClick={() => setShowConfirm(true)}
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="3 6 5 6 21 6" />
                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                <line x1="10" y1="11" x2="10" y2="17" />
                                                <line x1="14" y1="11" x2="14" y2="17" />
                                            </svg>
                                            <span>{t('trashPermanentDelete')}</span>
                                        </button>
                                    </>
                                )}
                                <span className="trash__count">
                                    {t('trashItemCount').replace('{count}', String(data.length))}
                                </span>
                            </div>
                        </div>
                        <div className="trash__grid">
                            {data.map(doc => {
                                const days = doc.deleted_at ? getDaysLeft(doc.deleted_at) : 0;
                                const supplier = doc.extracted_data?.supplier_name || doc.extracted_data?.vendor?.name || '-';
                                const amount = doc.extracted_data?.financials?.total_amount || doc.extracted_data?.total_amount;
                                const currency = doc.extracted_data?.financials?.currency || doc.extracted_data?.currency || 'TRY';
                                const isRestoring = restoringId === doc.id;
                                const isRestored = restoredId === doc.id;
                                const isSelected = selectedIds.includes(doc.id);
                                return (
                                    <div key={doc.id} className={`trash-card ${isRestored ? 'trash-card--restored' : ''} ${isSelected ? 'trash-card--selected' : ''}`}>
                                        <div className="trash-card__checkbox">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => handleToggleSelect(doc.id)}
                                            />
                                        </div>
                                        <div className="trash-card__left">
                                            {countdownCircle(days)}
                                        </div>
                                        <div className="trash-card__body">
                                            <div className="trash-card__file-row">
                                                <span className="trash-card__icon">{getFileIcon(doc.filename)}</span>
                                                <span className="trash-card__filename" title={doc.filename}>{doc.filename}</span>
                                            </div>
                                            <div className="trash-card__meta">
                                                {supplier !== '-' && <span className="trash-card__supplier">{supplier}</span>}
                                                {amount && <span className="trash-card__amount">{formatCurrency(amount, currency)}</span>}
                                            </div>
                                            <div className="trash-card__date">
                                                {doc.deleted_at ? new Date(doc.deleted_at).toLocaleDateString('tr-TR') : '-'}
                                            </div>
                                        </div>
                                        <div className="trash-card__action">
                                            <button
                                                className="trash-card__restore-btn"
                                                onClick={() => handleRestore(doc.id)}
                                                disabled={isRestoring}
                                                title={t('trashRestore')}
                                            >
                                                {isRestoring ? (
                                                    <span className="trash-card__spinner" />
                                                ) : (
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="1 4 1 10 7 10" />
                                                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                                                    </svg>
                                                )}
                                                <span>{t('trashRestore')}</span>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}

                {/* Permanent Delete Confirmation Modal */}
                {showConfirm && (
                    <div className="trash__modal-overlay" onClick={() => !deleting && setShowConfirm(false)}>
                        <div className="trash__modal" onClick={e => e.stopPropagation()}>
                            <div className="trash__modal-icon">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                    <line x1="12" y1="9" x2="12" y2="13" />
                                    <line x1="12" y1="17" x2="12.01" y2="17" />
                                </svg>
                            </div>
                            <h3 className="trash__modal-title">{t('trashPermanentDelete')}</h3>
                            <p className="trash__modal-text">
                                {t('trashPermanentDeleteConfirm').replace('{count}', String(selectedIds.length))}
                            </p>
                            <div className="trash__modal-actions">
                                <button
                                    className="trash__modal-cancel"
                                    onClick={() => setShowConfirm(false)}
                                    disabled={deleting}
                                >
                                    {t('deleteCancelLabel')}
                                </button>
                                <button
                                    className="trash__modal-confirm"
                                    onClick={handlePermanentDelete}
                                    disabled={deleting}
                                >
                                    {deleting ? t('preparing') : t('trashPermanentDelete')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default Trash;
