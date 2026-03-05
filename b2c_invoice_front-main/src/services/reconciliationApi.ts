/**
 * Reconciliation API Service
 * ==========================
 * Backend-driven matching: run, list, delete.
 */

import { apiService, ApiResponse } from './api';

export interface ReconciliationMatch {
    _id: string;
    company_id: string;
    transaction_ref: {
        statement_id: string;
        tx_index: number;
        date: string;
        description: string;
        amount: number;
        type: 'debit' | 'credit';
    };
    document_ref: {
        document_id: string;
        filename: string;
        amount: number;
        date: string;
        vendor_name: string;
        receiver_name?: string;
    };
    match_type: 'expense' | 'income';
    score: {
        total_score: number;
        data_quality: number;
        breakdown: { amount: number; date: number; description: number };
        ai_score?: number;
        ai_reason?: string;
        final_score?: number;
    };
    status: 'auto' | 'manual' | 'confirmed' | 'rejected';
    source?: 'auto' | 'manual';
    created_at: string;
}

export interface UnifiedTransaction {
    statement_id: string;
    tx_index: number;
    date: string;
    description: string;
    amount: number;
    type: 'debit' | 'credit';
    bank_name: string;
    currency: string;
    page?: number;      // 0-based page index in bank statement PDF
    y_min?: number;     // normalized 0-1 top of transaction row
    y_max?: number;     // normalized 0-1 bottom of transaction row
    matches: ReconciliationMatch[];
    match: ReconciliationMatch | null; // backward compat — first match or null
}

interface TransactionsResult {
    transactions: UnifiedTransaction[];
    total: number;
    page: number;
    page_size: number;
    summary: {
        total: number;
        matched: number;
        unmatched: number;
    };
}

interface MatchingResult {
    success: boolean;
    matches_created: number;
    summary: {
        total_tx: number;
        matched: number;
        unmatched: number;
        expenses_count: number;
        incomes_count: number;
    };
}

interface MatchesListResult {
    matches: ReconciliationMatch[];
    total: number;
    page: number;
    page_size: number;
    has_next: boolean;
    has_prev: boolean;
}

export interface RunMatchingParams {
    bank_statement_ids?: string[];
    expense_ids?: string[];
    income_ids?: string[];
    rematch_mode?: 'preserve_all' | 'keep_manual' | 'fresh' | 'keep_selected';
    language?: string;
    preserve_match_ids?: string[];
}

export async function runMatching(params?: RunMatchingParams): Promise<ApiResponse<MatchingResult>> {
    return apiService.post<MatchingResult>('/api/reconciliation/match', params);
}

export async function getMatches(
    page = 1,
    pageSize = 50,
    status?: string,
    matchType?: string,
): Promise<ApiResponse<MatchesListResult>> {
    const params: Record<string, string | number> = { page, page_size: pageSize };
    if (status) params.status = status;
    if (matchType) params.match_type = matchType;
    return apiService.get<MatchesListResult>('/api/reconciliation/matches', params);
}

export async function deleteMatch(matchId: string): Promise<ApiResponse<void>> {
    return apiService.delete<void>(`/api/reconciliation/matches/${matchId}`);
}

export async function getTransactions(
    page = 1,
    pageSize = 50,
    filterStatus: 'all' | 'matched' | 'unmatched' = 'all',
): Promise<ApiResponse<TransactionsResult>> {
    return apiService.get<TransactionsResult>('/api/reconciliation/transactions', {
        page,
        page_size: pageSize,
        filter_status: filterStatus,
    });
}

export async function createManualMatch(
    statementId: string,
    txIndex: number,
    documentId: string,
): Promise<ApiResponse<{ match_id: string }>> {
    return apiService.post<{ match_id: string }>('/api/reconciliation/matches/manual', {
        statement_id: statementId,
        tx_index: txIndex,
        document_id: documentId,
    });
}

export async function updateMatchStatus(
    matchId: string,
    status: 'confirmed' | 'rejected',
): Promise<ApiResponse<void>> {
    return apiService.patch<void>(`/api/reconciliation/matches/${matchId}`, { status });
}

export async function getMatchingStatus(): Promise<ApiResponse<{ matching_in_progress: boolean }>> {
    return apiService.get<{ matching_in_progress: boolean }>('/api/reconciliation/matching-status');
}
