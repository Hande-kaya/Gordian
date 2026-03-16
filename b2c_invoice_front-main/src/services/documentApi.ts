/**
 * Document API Service
 *
 * API calls for document/invoice listing and management.
 * Copied from invoice-management, uses B2C api.ts.
 */

import { apiService, ApiResponse } from './api';

// =============================================================================
// Types
// =============================================================================

export interface DocumentItem {
    id: string;
    company_id: string;
    user_id: string;
    type: 'invoice' | 'quote' | 'income' | 'bank-statement';
    filename: string;
    file_size: number;
    ocr_status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
    extraction_status?: 'pending' | 'completed' | 'failed';
    extraction_error?: string;
    extracted_text?: string;
    extracted_data?: {
        line_items?: any[];
        total_amount?: number;
        invoice_number?: string;
        invoice_date?: string;
        supplier_name?: string;
        vendor?: {
            name?: string;
            [key: string]: any;
        };
        financials?: {
            total_amount?: number;
            currency?: string;
            tax?: number;
            subtotal?: number;
        };
        [key: string]: any;
    };
    comparison?: {
        linked_quote_id?: string;
        status?: string;
        match_score?: number;
    };
    ocr_error?: string;
    created_at: string;
    updated_at: string;
    deleted_at?: string;
}

export interface DocumentListResponse {
    documents: DocumentItem[];
    total: number;
    page: number;
    page_size: number;
    has_next: boolean;
    has_prev: boolean;
    match_summary?: { matched: number; unmatched: number };
}

// =============================================================================
// API Functions
// =============================================================================

export interface DocumentFilters {
    search?: string;
    filter_date?: string;
    filter_amount?: string;
    filter_currency?: string;
    filter_supplier?: string;
}

export const getDocuments = async (
    page: number = 1,
    pageSize: number = 20,
    type?: 'invoice' | 'quote' | 'income' | 'bank-statement',
    matchStatus?: 'all' | 'matched' | 'unmatched',
    filters?: DocumentFilters,
): Promise<ApiResponse<DocumentListResponse>> => {
    const params: Record<string, any> = { page, page_size: pageSize };
    if (type) params.type = type;
    if (matchStatus) params.match_status = matchStatus;
    if (filters) {
        Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    }
    return apiService.get<DocumentListResponse>('/api/documents', params);
};

export const createManualDocument = async (
    type: 'invoice' | 'income' | 'bank-statement',
    extractedData: Record<string, any>,
    filename?: string,
): Promise<ApiResponse<DocumentItem>> => {
    const body: Record<string, any> = { type, extracted_data: extractedData };
    if (filename) body.filename = filename;
    return apiService.post<DocumentItem>('/api/documents/create', body);
};

export const getDocument = async (
    documentId: string
): Promise<ApiResponse<DocumentItem>> => {
    return apiService.get<DocumentItem>(`/api/documents/${documentId}`);
};

export const deleteDocument = async (
    documentId: string
): Promise<ApiResponse<void>> => {
    return apiService.delete<void>(`/api/documents/${documentId}`);
};

export const updateDocumentFields = async (
    documentId: string,
    fields: Record<string, any>
): Promise<ApiResponse<void>> => {
    return apiService.patch<void>(
        `/api/documents/${documentId}/fields`,
        { fields }
    );
};

export const reprocessPending = async (): Promise<ApiResponse<{ reprocessed: number }>> => {
    return apiService.post<{ reprocessed: number }>('/api/documents/reprocess-pending');
};

export const getDeletedDocuments = async (
    page: number = 1,
    pageSize: number = 20,
    type?: string
): Promise<ApiResponse<DocumentListResponse>> => {
    const params: Record<string, any> = { page, page_size: pageSize };
    if (type) params.type = type;
    return apiService.get<DocumentListResponse>('/api/documents/trash', params);
};

export const restoreDocument = async (
    documentId: string
): Promise<ApiResponse<void>> => {
    return apiService.post<void>(`/api/documents/${documentId}/restore`);
};

export const permanentDeleteDocuments = async (
    documentIds: string[]
): Promise<ApiResponse<{ count: number }>> => {
    return apiService.post<{ count: number }>('/api/documents/trash/permanent-delete', { document_ids: documentIds });
};

export const cancelProcessing = async (
    documentId: string
): Promise<ApiResponse<void>> => {
    return apiService.post<void>(`/api/documents/${documentId}/cancel-processing`);
};

export const retryDocument = async (
    documentId: string
): Promise<ApiResponse<void>> => {
    return apiService.post<void>(`/api/documents/${documentId}/retry`);
};

export const swapDocumentDates = async (
    documentId: string
): Promise<ApiResponse<DocumentItem>> => {
    return apiService.post<DocumentItem>(`/api/documents/${documentId}/swap-dates`);
};

export const updateTransactions = async (
    documentId: string,
    transactions: any[],
    currency?: string
): Promise<ApiResponse<DocumentItem>> => {
    const body: Record<string, any> = { transactions };
    if (currency) body.currency = currency;
    return apiService.patch<DocumentItem>(
        `/api/documents/${documentId}/transactions`,
        body
    );
};

// =============================================================================
// Expense Category API
// =============================================================================

export interface ExpenseCategory {
    key: string;
    labels: { tr: string; en: string; de: string };
    description: string;
}

export interface CategoriesResponse {
    categories: ExpenseCategory[];
    is_default: boolean;
}

export const getExpenseCategories = async (): Promise<ApiResponse<CategoriesResponse>> => {
    return apiService.get<CategoriesResponse>('/api/categories');
};

export const updateExpenseCategories = async (
    categories: ExpenseCategory[]
): Promise<ApiResponse<ExpenseCategory[]>> => {
    return apiService.put<ExpenseCategory[]>('/api/categories', { categories });
};

export const resetExpenseCategories = async (): Promise<ApiResponse<CategoriesResponse>> => {
    return apiService.post<CategoriesResponse>('/api/categories/reset');
};

const documentApi = {
    getDocuments,
    createManualDocument,
    getDocument,
    deleteDocument,
    updateDocumentFields,
    updateTransactions,
    reprocessPending,
    getDeletedDocuments,
    restoreDocument,
    permanentDeleteDocuments,
    cancelProcessing,
    retryDocument,
    swapDocumentDates,
    getExpenseCategories,
    updateExpenseCategories,
    resetExpenseCategories,
};

export default documentApi;
