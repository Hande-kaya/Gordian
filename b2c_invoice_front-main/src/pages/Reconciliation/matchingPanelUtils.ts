/**
 * Shared helpers for MatchingPanel, TransactionRow & TransactionModal.
 */
import { ReconciliationMatch, UnifiedTransaction } from '../../services/reconciliationApi';
import { DocumentItem } from '../../services/documentApi';

export const HIGH_CONFIDENCE = 0.75;
export const MEDIUM_CONFIDENCE = 0.50;
export const MAX_DATE_DIFF_DAYS = 62; // ~2 months

export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type ScoreLevel = 'high' | 'medium' | 'low';

export function fmtCurrency(v?: number | null, currency = 'TRY'): string {
    if (v == null) return '-';
    try {
        return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(v);
    } catch {
        return `${v.toLocaleString('tr-TR')} ${currency}`;
    }
}

export function getConfidenceLevel(score: number): ConfidenceLevel {
    if (score >= HIGH_CONFIDENCE) return 'high';
    if (score >= MEDIUM_CONFIDENCE) return 'medium';
    return 'low';
}

export function getMatchScore(match: ReconciliationMatch): number {
    return match.score.final_score ?? match.score.total_score;
}

export function getMatches(tx: UnifiedTransaction): ReconciliationMatch[] {
    return tx.matches || (tx.match ? [tx.match] : []);
}

/* ---- Document helpers (shared by TransactionModal & DocumentPickerModal) ---- */

export function getDocAmount(doc: DocumentItem): number {
    const ed = doc.extracted_data;
    if (!ed) return 0;
    const val = ed.financials?.total_amount || ed.total_amount || 0;
    try { return Math.abs(Number(val)); } catch { return 0; }
}

export function getDocCurrency(doc: DocumentItem): string {
    const ed = doc.extracted_data;
    if (!ed) return '';
    return ed.financials?.currency || ed.currency || '';
}

export function getDocVendor(doc: DocumentItem): string {
    const ed = doc.extracted_data;
    if (!ed) return '';
    return ed.vendor?.name || ed.supplier_name || '';
}

export function parseDocDate(raw?: string): Date | null {
    if (!raw) return null;
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
    const parts = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (parts) return new Date(+parts[3], +parts[2] - 1, +parts[1]);
    return null;
}

export function daysBetween(a: Date, b: Date): number {
    return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

export function calcProximityScore(
    txAmount: number, txDate: Date | null,
    docAmount: number, docDateStr?: string,
): number {
    const amountDiff = txAmount > 0 ? Math.abs(docAmount - txAmount) / txAmount : 1;
    const amountScore = Math.max(0, 60 * (1 - amountDiff / 0.5));
    const docDate = parseDocDate(docDateStr);
    let dateScore = 20;
    if (txDate && docDate) {
        const diff = daysBetween(txDate, docDate);
        dateScore = Math.max(0, 40 * (1 - diff / MAX_DATE_DIFF_DAYS));
    }
    return Math.round(amountScore + dateScore);
}

export function getScoreLevel(score: number): ScoreLevel {
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
}
