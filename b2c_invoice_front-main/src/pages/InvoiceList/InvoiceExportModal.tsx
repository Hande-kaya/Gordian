/**
 * Invoice Export Modal (2-step wizard)
 * =====================================
 * Step 1: Choose sheet grouping interval (how many months per sheet)
 * Step 2: Choose date range to export
 */

import React, { useState, useCallback } from 'react';
import { useLang } from '../../shared/i18n';

type SheetInterval = '1' | '2' | '3' | '6' | '12' | 'custom';

export interface ExportConfig {
    startDate: Date;
    endDate: Date;
    sheetMonths: number;
}

interface InvoiceExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onExport: (config: ExportConfig) => void;
    isLoading?: boolean;
}

const INTERVAL_OPTIONS: { value: SheetInterval; labelKey: string }[] = [
    { value: '1', labelKey: 'sheetInterval1' },
    { value: '2', labelKey: 'sheetInterval2' },
    { value: '3', labelKey: 'sheetInterval3' },
    { value: '6', labelKey: 'sheetInterval6' },
    { value: '12', labelKey: 'sheetInterval12' },
    { value: 'custom', labelKey: 'sheetIntervalCustom' },
];

const formatDateForInput = (date: Date): string => date.toISOString().split('T')[0];

const CalendarIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
);

const SheetsIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" />
        <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
);

const InvoiceExportModal: React.FC<InvoiceExportModalProps> = ({ isOpen, onClose, onExport, isLoading = false }) => {
    const { t } = useLang();
    const [step, setStep] = useState<1 | 2>(1);
    const [selectedInterval, setSelectedInterval] = useState<SheetInterval>('1');
    const [customMonths, setCustomMonths] = useState(2);
    const [startDate, setStartDate] = useState<string>(() => {
        const d = new Date(); d.setFullYear(d.getFullYear() - 1); return formatDateForInput(d);
    });
    const [endDate, setEndDate] = useState<string>(formatDateForInput(new Date()));

    const sheetMonths = selectedInterval === 'custom' ? customMonths : Number(selectedInterval);

    const handleExport = useCallback(() => {
        const start = new Date(startDate); start.setHours(0, 0, 0, 0);
        const end = new Date(endDate); end.setHours(23, 59, 59, 999);
        onExport({ startDate: start, endDate: end, sheetMonths });
    }, [startDate, endDate, sheetMonths, onExport]);

    const handleClose = useCallback(() => {
        if (!isLoading) { setStep(1); onClose(); }
    }, [isLoading, onClose]);

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) handleClose();
    };

    // Check if tutorial is active (export-modal step uses noBackdrop, so modal must be visible)
    const isTutorialExport = document.querySelector('.tutorial-overlay') !== null;

    if (!isOpen) return null;

    const estimatedSheets = (() => {
        const s = new Date(startDate);
        const e = new Date(endDate);
        const totalMonths = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
        return Math.max(1, Math.ceil(totalMonths / sheetMonths));
    })();

    return (
        <div className={`invoice-export-modal-overlay ${isTutorialExport ? 'invoice-export-modal-overlay--tutorial' : ''}`} onClick={handleBackdropClick}>
            <div className="invoice-export-modal" data-tutorial="export-modal">
                <div className="invoice-export-modal__header">
                    <h2>{t('exportTitle')}</h2>
                    <button className="invoice-export-modal__close" onClick={handleClose} disabled={isLoading}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Step indicator */}
                <div className="invoice-export-modal__steps">
                    <div className={`step-indicator ${step >= 1 ? 'step-indicator--active' : ''}`}>
                        <span className="step-indicator__number">1</span>
                        <span className="step-indicator__label">{t('exportStepSheets')}</span>
                    </div>
                    <div className="step-indicator__line" />
                    <div className={`step-indicator ${step >= 2 ? 'step-indicator--active' : ''}`}>
                        <span className="step-indicator__number">2</span>
                        <span className="step-indicator__label">{t('exportStepDates')}</span>
                    </div>
                </div>

                <div className="invoice-export-modal__body">
                    {step === 1 ? (
                        <>
                            <div className="export-step-header">
                                <SheetsIcon />
                                <div>
                                    <h3>{t('exportSheetTitle')}</h3>
                                    <p>{t('exportSheetDesc')}</p>
                                </div>
                            </div>
                            <div className="invoice-export-modal__presets">
                                {INTERVAL_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        className={`preset-btn ${selectedInterval === opt.value ? 'active' : ''}`}
                                        onClick={() => setSelectedInterval(opt.value)}
                                    >
                                        {t(opt.labelKey)}
                                    </button>
                                ))}
                            </div>
                            {selectedInterval === 'custom' && (
                                <div className="invoice-export-modal__custom-months">
                                    <label>{t('customMonthsLabel')}</label>
                                    <input
                                        type="number" min={1} max={24} value={customMonths}
                                        onChange={e => setCustomMonths(Math.max(1, Math.min(24, Number(e.target.value))))}
                                    />
                                    <span className="custom-months-hint">{t('customMonthsHint')}</span>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            <div className="export-step-header">
                                <CalendarIcon />
                                <div>
                                    <h3>{t('exportDateTitle')}</h3>
                                    <p>{t('exportDateDesc')}</p>
                                </div>
                            </div>
                            <div className="invoice-export-modal__custom-dates">
                                <div className="date-input-group">
                                    <label>{t('startDate')}</label>
                                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} max={endDate} disabled={isLoading} />
                                </div>
                                <div className="date-input-group">
                                    <label>{t('endDate')}</label>
                                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} max={formatDateForInput(new Date())} disabled={isLoading} />
                                </div>
                            </div>
                            <div className="invoice-export-modal__summary">
                                <div className="summary-row">
                                    <span className="summary-label">{t('exportSheetInterval')}</span>
                                    <span className="summary-value">{sheetMonths} {t('exportMonthsUnit')}</span>
                                </div>
                                <div className="summary-row">
                                    <span className="summary-label">{t('exportEstimatedSheets')}</span>
                                    <span className="summary-value">{estimatedSheets} {t('exportSheetsUnit')}</span>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="invoice-export-modal__footer">
                    {step === 1 ? (
                        <>
                            <button className="btn-cancel" onClick={handleClose}>{t('cancel')}</button>
                            <button className="btn-next" onClick={() => setStep(2)}>
                                {t('exportNext')}
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="9 18 15 12 9 6" />
                                </svg>
                            </button>
                        </>
                    ) : (
                        <>
                            <button className="btn-back" onClick={() => setStep(1)} disabled={isLoading}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="15 18 9 12 15 6" />
                                </svg>
                                {t('exportBack')}
                            </button>
                            <button className="btn-export" onClick={handleExport} disabled={isLoading}>
                                {isLoading ? (<><span className="spinner-small" />{t('preparing')}</>) : (
                                    <>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                            <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                                        </svg>
                                        {t('downloadExcel')}
                                    </>
                                )}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default InvoiceExportModal;
