/**
 * Bulk Upload Modal
 * =================
 * Modal for uploading multiple invoice files at once.
 * Adapted from invoice-management - uses B2C AuthContext.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useLang } from '../../shared/i18n';
import { config } from '../../utils/config';
import { getAuthHeaders } from '../../services/api';

interface FileItem {
    file: File;
    id: string;
    status: 'pending' | 'uploading' | 'success' | 'error';
    error?: string;
}

interface BulkUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUploadComplete: () => void;
    initialFiles?: File[];
    docType?: string;
}

const ALLOWED_EXTENSIONS = [
    '.pdf', '.png', '.jpg', '.jpeg',
    '.webp', '.heic', '.heif', '.bmp', '.gif', '.tiff', '.tif',
    '.xlsx', '.xls',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const BulkUploadModal: React.FC<BulkUploadModalProps> = ({
    isOpen,
    onClose,
    onUploadComplete,
    initialFiles,
    docType = 'invoice'
}) => {
    const { t } = useLang();
    const [files, setFiles] = useState<FileItem[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadedCount, setUploadedCount] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const initialFilesProcessed = useRef(false);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isUploading) {
                e.preventDefault();
                e.returnValue = t('uploadBeforeUnload');
                return e.returnValue;
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isUploading]);

    useEffect(() => {
        return () => { abortControllerRef.current?.abort(); };
    }, []);

    const validateFile = (file: File): string | null => {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            return t('invalidFileType').replace('{types}', ALLOWED_EXTENSIONS.join(', '));
        }
        if (file.size > MAX_FILE_SIZE) {
            return t('fileTooLarge').replace('{size}', String(MAX_FILE_SIZE / (1024 * 1024)));
        }
        return null;
    };

    const addFiles = useCallback((newFiles: FileList | File[]) => {
        const fileArray = Array.from(newFiles);
        const newFileItems: FileItem[] = [];
        fileArray.forEach(file => {
            const isDuplicate = files.some(f => f.file.name === file.name && f.file.size === file.size);
            if (!isDuplicate) {
                const error = validateFile(file);
                newFileItems.push({
                    file,
                    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    status: error ? 'error' : 'pending',
                    error: error || undefined
                });
            }
        });
        setFiles(prev => [...prev, ...newFileItems]);
    }, [files]);

    useEffect(() => {
        if (isOpen && initialFiles && initialFiles.length > 0 && !initialFilesProcessed.current) {
            initialFilesProcessed.current = true;
            addFiles(initialFiles);
        }
        if (!isOpen) {
            initialFilesProcessed.current = false;
        }
    }, [isOpen, initialFiles, addFiles]);

    const removeFile = (id: string) => { setFiles(prev => prev.filter(f => f.id !== id)); };

    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
    const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files); };
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) addFiles(e.target.files);
        e.target.value = '';
    };

    const uploadFile = async (fileItem: FileItem): Promise<boolean> => {
        const formData = new FormData();
        formData.append('file', fileItem.file);
        formData.append('type', docType);

        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const response = await fetch(`${config.API_URL}/api/documents/upload`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: getAuthHeaders(),
                    body: formData,
                    signal: abortControllerRef.current?.signal
                });
                if (response.status === 429 && attempt < 2) {
                    await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
                    continue;
                }
                const data = await response.json();
                return data.success;
            } catch (error: any) {
                if (error.name === 'AbortError') return false;
                if (attempt === 2) throw error;
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        return false;
    };

    const startUpload = async () => {
        const pendingFiles = files.filter(f => f.status === 'pending');
        if (pendingFiles.length === 0) return;
        setIsUploading(true);
        setUploadedCount(0);
        abortControllerRef.current = new AbortController();
        let successCount = 0;

        for (let i = 0; i < pendingFiles.length; i++) {
            const fileItem = pendingFiles[i];
            if (abortControllerRef.current.signal.aborted) break;
            setFiles(prev => prev.map(f => f.id === fileItem.id ? { ...f, status: 'uploading' as const } : f));
            try {
                const success = await uploadFile(fileItem);
                setFiles(prev => prev.map(f =>
                    f.id === fileItem.id
                        ? { ...f, status: success ? 'success' : 'error', error: success ? undefined : t('uploadFailed') }
                        : f
                ));
                if (success) { successCount++; setUploadedCount(successCount); }
            } catch (error: any) {
                setFiles(prev => prev.map(f =>
                    f.id === fileItem.id ? { ...f, status: 'error', error: error.message || t('uploadErrorGeneric') } : f
                ));
            }
        }

        setIsUploading(false);
        abortControllerRef.current = null;
        if (successCount > 0) onUploadComplete();
    };

    const cancelUpload = () => { abortControllerRef.current?.abort(); };

    const handleClose = () => {
        if (isUploading) {
            const confirmed = window.confirm(t('uploadCancelConfirm'));
            if (!confirmed) return;
            cancelUpload();
        }
        setFiles([]);
        setUploadedCount(0);
        onClose();
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget && !isUploading) handleClose();
    };

    if (!isOpen) return null;

    const pendingCount = files.filter(f => f.status === 'pending').length;
    const successCount = files.filter(f => f.status === 'success').length;
    const errorCount = files.filter(f => f.status === 'error').length;

    return (
        <div className="bulk-upload-modal-overlay" onClick={handleBackdropClick}>
            <div className="bulk-upload-modal">
                <div className="bulk-upload-modal__header">
                    <h2>{t('uploadTitle')}</h2>
                    <button className="bulk-upload-modal__close" onClick={handleClose} title={t('close')}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
                <div className="bulk-upload-modal__body">
                    <div
                        className={`bulk-upload-modal__dropzone ${isDragging ? 'dragging' : ''} ${isUploading ? 'disabled' : ''}`}
                        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                        onClick={() => !isUploading && fileInputRef.current?.click()}
                    >
                        <input ref={fileInputRef} type="file" multiple accept={ALLOWED_EXTENSIONS.join(',')} onChange={handleFileSelect} style={{ display: 'none' }} />
                        <div className="dropzone-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                        </div>
                        <p className="dropzone-text">{isDragging ? t('dropzoneHover') : t('dropzoneText')}</p>
                        <p className="dropzone-hint">{t('dropzoneHint')}</p>
                    </div>
                    {files.length > 0 && (
                        <div className="bulk-upload-modal__file-list">
                            <div className="file-list-header">
                                <span>{t('filesSelected').replace('{count}', String(files.length))}</span>
                                {!isUploading && <button className="clear-all-btn" onClick={() => setFiles([])}>{t('clearAll')}</button>}
                            </div>
                            <div className="file-list-items">
                                {files.map(fileItem => (
                                    <div key={fileItem.id} className={`file-item file-item--${fileItem.status}`}>
                                        <div className="file-item__icon">
                                            {fileItem.status === 'pending' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>}
                                            {fileItem.status === 'uploading' && <span className="spinner-small" />}
                                            {fileItem.status === 'success' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>}
                                            {fileItem.status === 'error' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>}
                                        </div>
                                        <div className="file-item__info">
                                            <span className="file-item__name" title={fileItem.file.name}>{fileItem.file.name}</span>
                                            {fileItem.error && <span className="file-item__error">{fileItem.error}</span>}
                                        </div>
                                        <div className="file-item__size">{(fileItem.file.size / 1024).toFixed(1)} KB</div>
                                        {!isUploading && fileItem.status !== 'success' && (
                                            <button className="file-item__remove" onClick={() => removeFile(fileItem.id)} title={t('delete')}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {isUploading && (
                        <div className="bulk-upload-modal__progress">
                            <div className="progress-bar"><div className="progress-bar__fill" style={{ width: `${(uploadedCount / pendingCount) * 100}%` }} /></div>
                            <div className="progress-text">{t('uploadProgress').replace('{done}', String(uploadedCount)).replace('{total}', String(pendingCount + uploadedCount))}</div>
                        </div>
                    )}
                    {!isUploading && successCount > 0 && (
                        <div className="bulk-upload-modal__done-banner">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                <polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                            <div className="done-banner__text">
                                <strong>{t('uploadDoneTitle')}</strong>
                                <span>{t('uploadDoneMessage')}</span>
                            </div>
                        </div>
                    )}
                </div>
                <div className="bulk-upload-modal__footer">
                    {files.length > 0 && !isUploading && (
                        <div className="upload-stats">
                            {successCount > 0 && <span className="stat stat--success">{t('uploadSuccess').replace('{count}', String(successCount))}</span>}
                            {errorCount > 0 && <span className="stat stat--error">{t('uploadError').replace('{count}', String(errorCount))}</span>}
                            {pendingCount > 0 && <span className="stat stat--pending">{t('uploadPending').replace('{count}', String(pendingCount))}</span>}
                        </div>
                    )}
                    <div className="footer-buttons">
                        {isUploading ? (
                            <button className="btn-cancel" onClick={cancelUpload}>{t('cancelUpload')}</button>
                        ) : (
                            <>
                                <button className="btn-cancel" onClick={handleClose}>{t('close')}</button>
                                <button className="btn-upload" onClick={startUpload} disabled={pendingCount === 0}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                                    </svg>
                                    {t('uploadButton').replace('{count}', String(pendingCount))}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BulkUploadModal;
