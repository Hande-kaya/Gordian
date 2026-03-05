/**
 * Stats API - Dashboard statistics types and API calls.
 */

import { apiService, ApiResponse } from './api';

// =============================================================================
// Types
// =============================================================================

export interface DashboardCounts {
    total: number;
    matched: number;
    discrepancy: number;
    pending: number;
}

export interface SpendingDataPoint {
    date: string;
    total: number;
    count: number;
}

export interface CurrencySpending {
    currency: string;
    time_series: SpendingDataPoint[];
    currency_total: number;
}

export interface CategorySpending {
    category: string;
    currency: string;
    time_series: SpendingDataPoint[];
    category_total: number;
}

export interface DateRange {
    min_month: string | null;
    max_month: string | null;
}

export interface DashboardStatsResponse {
    counts: DashboardCounts;
    spending_by_date: CurrencySpending[];
    spending_by_category: CategorySpending[];
    date_range: DateRange;
    period: string;
    group_by: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Approximate exchange rates to TRY for chart normalization */
export const CURRENCY_RATES_TO_TRY: Record<string, number> = {
    TRY: 1,
    CHF: 55,
    EUR: 50,
    USD: 45,
    GBP: 57,
};

/** @deprecated Use useCategories() from CategoryContext instead */
export const EXPENSE_CATEGORIES: Record<string, { tr: string; en: string }> = {
    food: { tr: 'Yiyecek ve Icecek', en: 'Food & Beverage' },
    fuel: { tr: 'Akaryakit', en: 'Fuel' },
    accommodation: { tr: 'Konaklama', en: 'Accommodation' },
    transport: { tr: 'Ulasim', en: 'Transportation' },
    toll: { tr: 'Otoyol/Kopru Gecis', en: 'Toll' },
    parking: { tr: 'Otopark', en: 'Parking' },
    office_supplies: { tr: 'Kirtasiye/Ofis', en: 'Office Supplies' },
    communication: { tr: 'Iletisim', en: 'Communication' },
    other: { tr: 'Diger', en: 'Other' },
};

// =============================================================================
// API
// =============================================================================

export const getDashboardStats = async (
    period: string = '30d',
    groupBy: string = 'day',
    startDate?: string,
    endDate?: string,
    docType?: string,
): Promise<ApiResponse<DashboardStatsResponse>> => {
    const params: Record<string, string> = { period, group_by: groupBy };
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    if (docType) params.doc_type = docType;
    return apiService.get<DashboardStatsResponse>('/api/stats', params);
};
