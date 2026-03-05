/**
 * Billing API Service — Usage, checkout, and billing history.
 */

import { apiService, ApiResponse } from './api';

export interface FreePlan {
    uploads_used: number;
    uploads_limit: number;
    rematches_used: number;
    rematches_limit: number;
    period_end: string;
    days_remaining: number;
}

export interface Credits {
    uploads_remaining: number;
    regenerates_remaining: number;
}

export interface UsageSummary {
    free_plan: FreePlan;
    credits: Credits;
}

export interface CheckoutResult {
    checkout_url: string;
    session_id: string;
}

export interface BillingTransaction {
    _id: string;
    stripe_session_id: string;
    amount_cents: number;
    currency: string;
    status: 'pending' | 'completed' | 'failed';
    credits_granted: { uploads: number; regenerates: number };
    created_at: string;
}

export interface BillingHistoryResult {
    items: BillingTransaction[];
    total: number;
    page: number;
    page_size: number;
}

export const billingApi = {
    getUsage: (): Promise<ApiResponse<UsageSummary>> =>
        apiService.get('/api/billing/usage'),

    createCheckout: (amountCents?: number): Promise<ApiResponse<CheckoutResult>> =>
        apiService.post('/api/billing/checkout', amountCents ? { amount_cents: amountCents } : undefined),

    getBillingHistory: (page = 1, pageSize = 20): Promise<ApiResponse<BillingHistoryResult>> =>
        apiService.get('/api/billing/history', { page, page_size: pageSize }),
};
