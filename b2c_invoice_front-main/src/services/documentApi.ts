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
}

// =============================================================================
// API Functions
// =============================================================================

export const getDocuments = async (
    page: number = 1,
    pageSize: number = 20,
    type?: 'invoice' | 'quote' | 'income' | 'bank-statement'
): Promise<ApiResponse<DocumentListResponse>> => {
    const params: Record<string, any> = { page, page_size: pageSize };
    if (type) params.type = type;
    return apiService.get<DocumentListResponse>('/api/documents', params);
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
    getDocument,
    deleteDocument,
    updateDocumentFields,
    reprocessPending,
    getDeletedDocuments,
    restoreDocument,
    permanentDeleteDocuments,
    cancelProcessing,
    retryDocument,
    getExpenseCategories,
    updateExpenseCategories,
    resetExpenseCategories,
};

export default documentApi;
