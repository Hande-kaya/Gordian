/**
 * Reconciliation Export Utility
 * ==============================
 * Generates Excel files with matched/unmatched transactions
 * grouped by configurable intervals into sheets.
 */

import * as XLSX from 'xlsx';
import { UnifiedTransaction, ReconciliationMatch } from '../services/reconciliationApi';

interface ExportOptions {
    startDate: Date;
    endDate: Date;
    sheetMonths?: number;
    filename?: string;
}

interface TxExportRow {
    'Tarih': string;
    'Aciklama': string;
    'Tutar': string;
    'Tur': string;
    'Eslesen Belge': string;
    'Tedarikci': string;
    'Belge Tutari': string;
    'Belge Tarihi': string;
    'Guven': string;
    'Durum': string;
}

const TURKISH_MONTHS = [
    'Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran',
    'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik',
];

const fmtNum = (v?: number | null): string => {
    if (v == null) return '-';
    return v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtDate = (d?: string | null): string => {
    if (!d) return '-';
    try { return new Date(d).toLocaleDateString('tr-TR'); } catch { return d; }
};

const getScore = (m: ReconciliationMatch): number =>
    m.score.final_score ?? m.score.total_score;

const transformTx = (tx: UnifiedTransaction): TxExportRow => {
    const m = tx.matches?.[0];
    const score = m ? getScore(m) : 0;
    return {
        'Tarih': fmtDate(tx.date),
        'Aciklama': tx.description || '-',
        'Tutar': fmtNum(tx.amount),
        'Tur': tx.type || '-',
        'Eslesen Belge': m?.document_ref?.filename || '-',
        'Tedarikci': m?.document_ref?.vendor_name || '-',
        'Belge Tutari': fmtNum(m?.document_ref?.amount),
        'Belge Tarihi': fmtDate(m?.document_ref?.date),
        'Guven': m ? `${Math.round(score * 100)}%` : '-',
        'Durum': (tx.matches?.length ?? 0) > 0 ? 'Eslesmis' : 'Eslesmemis',
    };
};

const generateBuckets = (startDate: Date, endDate: Date, sheetMonths: number) => {
    const buckets: { start: Date; end: Date; label: string }[] = [];
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

    while (cursor <= endDate) {
        const bucketStart = new Date(cursor);
        cursor.setMonth(cursor.getMonth() + sheetMonths);
        const bucketEnd = new Date(Math.min(
            new Date(cursor.getFullYear(), cursor.getMonth(), 0, 23, 59, 59).getTime(),
            endDate.getTime(),
        ));
        const startLabel = `${TURKISH_MONTHS[bucketStart.getMonth()]} ${bucketStart.getFullYear()}`;
        const endMonth = new Date(bucketEnd);
        const endLabel = `${TURKISH_MONTHS[endMonth.getMonth()]} ${endMonth.getFullYear()}`;
        const label = startLabel === endLabel ? startLabel : `${startLabel} - ${endLabel}`;
        buckets.push({ start: bucketStart, end: bucketEnd, label });
    }
    return buckets;
};

const groupByBuckets = (
    txs: UnifiedTransaction[], startDate: Date, endDate: Date, sheetMonths: number,
): Map<string, UnifiedTransaction[]> => {
    const filtered = txs
        .filter(tx => {
            if (!tx.date) return false;
            const d = new Date(tx.date);
            return d >= startDate && d <= endDate;
        })
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

    const buckets = generateBuckets(startDate, endDate, sheetMonths);
    const grouped = new Map<string, UnifiedTransaction[]>();

    buckets.forEach(bucket => {
        const items = filtered.filter(tx => {
            const d = new Date(tx.date || 0);
            return d >= bucket.start && d <= bucket.end;
        });
        if (items.length > 0) {
            grouped.set(bucket.label, items);
        }
    });

    return grouped;
};

export const exportReconciliationToExcel = (
    transactions: UnifiedTransaction[],
    options: ExportOptions,
): void => {
    const { startDate, endDate, sheetMonths = 1, filename } = options;
    const grouped = groupByBuckets(transactions, startDate, endDate, sheetMonths);

    if (grouped.size === 0) {
        alert('Secilen tarih araliginda islem bulunamadi.');
        return;
    }

    const workbook = XLSX.utils.book_new();
    const COL_WIDTHS = [
        { wch: 12 }, { wch: 35 }, { wch: 15 }, { wch: 10 },
        { wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 12 },
        { wch: 10 }, { wch: 12 },
    ];

    const sheetLabels = Array.from(grouped.keys());
    sheetLabels.forEach(label => {
        const items = grouped.get(label)!;
        const rows = items.map(transformTx);
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = COL_WIDTHS;
        const safeName = label.length > 31 ? label.substring(0, 31) : label;
        XLSX.utils.book_append_sheet(workbook, ws, safeName);
    });

    // Summary sheet
    const summaryData = sheetLabels.map(label => {
        const items = grouped.get(label)!;
        const matched = items.filter(tx => (tx.matches?.length ?? 0) > 0).length;
        const totalAmt = items.reduce((s, tx) => s + (tx.amount || 0), 0);
        return {
            'Donem': label,
            'Islem Sayisi': items.length,
            'Eslesmis': matched,
            'Eslesmemis': items.length - matched,
            'Toplam Tutar': fmtNum(totalAmt),
        };
    });

    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 14 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Ozet');

    const startStr = startDate.toLocaleDateString('tr-TR').replace(/\//g, '-');
    const endStr = endDate.toLocaleDateString('tr-TR').replace(/\//g, '-');
    XLSX.writeFile(workbook, filename || `Mutabakat_${startStr}_${endStr}.xlsx`);
};
