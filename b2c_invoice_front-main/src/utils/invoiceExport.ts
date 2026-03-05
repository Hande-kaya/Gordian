/**
 * Invoice Export Utility
 * ======================
 * Generates Excel files with invoices grouped by configurable intervals into sheets.
 */

import * as XLSX from 'xlsx';
import { DocumentItem } from '../services/documentApi';

interface ExportOptions {
    startDate: Date;
    endDate: Date;
    sheetMonths?: number;
    filename?: string;
}

interface InvoiceExportRow {
    'Dosya Adi': string;
    'Tedarikci': string;
    'Fatura No': string;
    'Fatura Tarihi': string;
    'Toplam Tutar': string;
    'Para Birimi': string;
    'KDV': string;
    'Alt Toplam': string;
    'Kalem Sayisi': number;
    'Extraction Durumu': string;
    'Yuklenme Tarihi': string;
}

const TURKISH_MONTHS = [
    'Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran',
    'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik'
];

const formatCurrency = (amount?: number): string => {
    if (amount === undefined || amount === null) return '-';
    return amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatDate = (dateStr?: string): string => {
    if (!dateStr) return '-';
    try { return new Date(dateStr).toLocaleDateString('tr-TR'); } catch { return dateStr; }
};

const getExtractionStatusLabel = (status?: string): string => {
    const statusMap: Record<string, string> = {
        'completed': 'Tamamlandi', 'processing': 'Isleniyor',
        'pending': 'Bekliyor', 'failed': 'Basarisiz'
    };
    return statusMap[status || ''] || status || 'Bilinmiyor';
};

const transformInvoiceToRow = (doc: DocumentItem): InvoiceExportRow => {
    const extracted = doc.extracted_data;
    const financials = extracted?.financials;
    return {
        'Dosya Adi': doc.filename || '-',
        'Tedarikci': extracted?.vendor?.name || extracted?.supplier_name || '-',
        'Fatura No': extracted?.invoice_number || '-',
        'Fatura Tarihi': formatDate(extracted?.invoice_date),
        'Toplam Tutar': formatCurrency(financials?.total_amount || extracted?.total_amount),
        'Para Birimi': financials?.currency || extracted?.currency || 'TRY',
        'KDV': formatCurrency(financials?.tax),
        'Alt Toplam': formatCurrency(financials?.subtotal),
        'Kalem Sayisi': extracted?.line_items?.length || 0,
        'Extraction Durumu': getExtractionStatusLabel(doc.extraction_status),
        'Yuklenme Tarihi': formatDate(doc.created_at)
    };
};

/** Generate period buckets based on sheetMonths interval */
const generateBuckets = (startDate: Date, endDate: Date, sheetMonths: number) => {
    const buckets: { start: Date; end: Date; label: string }[] = [];
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

    while (cursor <= endDate) {
        const bucketStart = new Date(cursor);
        cursor.setMonth(cursor.getMonth() + sheetMonths);
        const bucketEnd = new Date(Math.min(
            new Date(cursor.getFullYear(), cursor.getMonth(), 0, 23, 59, 59).getTime(),
            endDate.getTime()
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
    invoices: DocumentItem[], startDate: Date, endDate: Date, sheetMonths: number
): Map<string, DocumentItem[]> => {
    const filtered = invoices
        .filter(inv => {
            const d = new Date(inv.created_at);
            return d >= startDate && d <= endDate;
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const buckets = generateBuckets(startDate, endDate, sheetMonths);
    const grouped = new Map<string, DocumentItem[]>();

    buckets.forEach(bucket => {
        const items = filtered.filter(inv => {
            const d = new Date(inv.created_at);
            return d >= bucket.start && d <= bucket.end;
        });
        if (items.length > 0) {
            grouped.set(bucket.label, items);
        }
    });

    return grouped;
};

export const exportInvoicesToExcel = (
    invoices: DocumentItem[],
    options: ExportOptions
): void => {
    const { startDate, endDate, sheetMonths = 1, filename } = options;
    const grouped = groupByBuckets(invoices, startDate, endDate, sheetMonths);

    if (grouped.size === 0) {
        alert('Secilen tarih araliginda fatura bulunamadi.');
        return;
    }

    const workbook = XLSX.utils.book_new();
    const COL_WIDTHS = [
        { wch: 30 }, { wch: 25 }, { wch: 15 }, { wch: 12 },
        { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 15 }, { wch: 12 }
    ];

    const sheetLabels = Array.from(grouped.keys());
    sheetLabels.forEach(label => {
        const items = grouped.get(label)!;
        const rows = items.map(transformInvoiceToRow);
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = COL_WIDTHS;
        // Sheet name max 31 chars
        const safeName = label.length > 31 ? label.substring(0, 31) : label;
        XLSX.utils.book_append_sheet(workbook, ws, safeName);
    });

    // Summary sheet
    const summaryData = sheetLabels.map(label => {
        const items = grouped.get(label)!;
        const totals: Record<string, number> = {};
        items.forEach(inv => {
            const amt = inv.extracted_data?.financials?.total_amount || inv.extracted_data?.total_amount || 0;
            const curr = inv.extracted_data?.financials?.currency || inv.extracted_data?.currency || 'TRY';
            totals[curr] = (totals[curr] || 0) + amt;
        });
        const totalStr = Object.entries(totals).map(([c, a]) => `${formatCurrency(a)} ${c}`).join(', ') || '-';
        return { 'Donem': label, 'Fatura Sayisi': items.length, 'Toplam Tutar': totalStr };
    });

    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    summarySheet['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Ozet');

    const startStr = startDate.toLocaleDateString('tr-TR').replace(/\//g, '-');
    const endStr = endDate.toLocaleDateString('tr-TR').replace(/\//g, '-');
    XLSX.writeFile(workbook, filename || `Harcamalar_${startStr}_${endStr}.xlsx`);
};

export default exportInvoicesToExcel;
