/**
 * ExcelPreview — Renders Excel files (.xlsx/.xls) as HTML tables.
 * Uses SheetJS (xlsx) to parse the blob client-side.
 * Supports multi-sheet workbooks with tab navigation.
 *
 * Uses spreadsheet-style column headers (A, B, C…) and renders all
 * rows as data — handles both form-style invoices and tabular data.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { read, utils, type WorkBook } from 'xlsx';
import './ExcelPreview.scss';

interface ExcelPreviewProps {
    blob: Blob;
    filename?: string;
}

const MAX_PREVIEW_ROWS = 200;

/** Convert 0-based column index to Excel-style letter (0→A, 25→Z, 26→AA). */
function colLetter(idx: number): string {
    let s = '';
    let n = idx;
    while (n >= 0) {
        s = String.fromCharCode(65 + (n % 26)) + s;
        n = Math.floor(n / 26) - 1;
    }
    return s;
}

const ExcelPreview: React.FC<ExcelPreviewProps> = ({ blob, filename }) => {
    const [workbook, setWorkbook] = useState<WorkBook | null>(null);
    const [activeSheet, setActiveSheet] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // Parse blob into workbook
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        blob.arrayBuffer()
            .then(buffer => {
                if (cancelled) return;
                const wb = read(buffer, { type: 'array' });
                setWorkbook(wb);
                setActiveSheet(wb.SheetNames[0] || '');
                setLoading(false);
            })
            .catch(err => {
                if (cancelled) return;
                console.error('ExcelPreview parse error:', err);
                setError('Excel dosyasi okunamadi');
                setLoading(false);
            });

        return () => { cancelled = true; };
    }, [blob]);

    // Convert active sheet to row data
    const { colCount, rows, totalRows } = useMemo(() => {
        if (!workbook || !activeSheet) return { colCount: 0, rows: [], totalRows: 0 };

        const sheet = workbook.Sheets[activeSheet];
        if (!sheet) return { colCount: 0, rows: [], totalRows: 0 };

        const raw: unknown[][] = utils.sheet_to_json(sheet, { header: 1 });
        if (raw.length === 0) return { colCount: 0, rows: [], totalRows: 0 };

        // Find max column count across ALL rows
        let maxCols = 0;
        for (const row of raw) {
            const arr = row as unknown[];
            // Find last non-empty column to trim trailing blanks
            let lastNonEmpty = -1;
            for (let i = arr.length - 1; i >= 0; i--) {
                if (arr[i] != null && String(arr[i]).trim() !== '') {
                    lastNonEmpty = i;
                    break;
                }
            }
            if (lastNonEmpty + 1 > maxCols) maxCols = lastNonEmpty + 1;
        }

        if (maxCols === 0) return { colCount: 0, rows: [], totalRows: 0 };

        const allRows = raw.map(row => {
            const arr = row as unknown[];
            const cells: string[] = [];
            for (let i = 0; i < maxCols; i++) {
                cells.push(arr[i] != null ? String(arr[i]) : '');
            }
            return cells;
        });

        return {
            colCount: maxCols,
            rows: allRows.slice(0, MAX_PREVIEW_ROWS),
            totalRows: allRows.length,
        };
    }, [workbook, activeSheet]);

    const sheetNames = workbook?.SheetNames || [];

    if (loading) {
        return (
            <div className="excel-preview excel-preview--loading">
                <div className="reconciliation-page__spinner" />
            </div>
        );
    }

    if (error) {
        return <div className="excel-preview excel-preview--error">{error}</div>;
    }

    return (
        <div className="excel-preview">
            {filename && (
                <div className="excel-preview__filename">{filename}</div>
            )}

            {sheetNames.length > 1 && (
                <div className="excel-preview__tabs">
                    {sheetNames.map(name => (
                        <button
                            key={name}
                            className={`excel-preview__tab ${name === activeSheet ? 'excel-preview__tab--active' : ''}`}
                            onClick={() => setActiveSheet(name)}
                        >
                            {name}
                        </button>
                    ))}
                </div>
            )}

            <div className="excel-preview__table-wrap">
                {colCount === 0 ? (
                    <div className="excel-preview__empty">Sayfa bos</div>
                ) : (
                    <table className="excel-preview__table">
                        <thead>
                            <tr>
                                <th className="excel-preview__row-num">#</th>
                                {Array.from({ length: colCount }, (_, i) => (
                                    <th key={i}>{colLetter(i)}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, ri) => (
                                <tr key={ri}>
                                    <td className="excel-preview__row-num">{ri + 1}</td>
                                    {row.map((cell, ci) => (
                                        <td key={ci}>{cell}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {totalRows > MAX_PREVIEW_ROWS && (
                <div className="excel-preview__truncated">
                    {MAX_PREVIEW_ROWS} / {totalRows} satir gosteriliyor
                </div>
            )}
        </div>
    );
};

export default ExcelPreview;
