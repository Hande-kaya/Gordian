/**
 * useDashboardStats Hook
 *
 * Fetches dashboard statistics with period/groupBy controls.
 * Uses stale-while-revalidate: shows cached data instantly, refetches in background.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getDashboardStats, DashboardStatsResponse } from '../services/statsApi';

const CACHE_PREFIX = 'dash_stats_';

function readCache(key: string): DashboardStatsResponse | null {
    try {
        const raw = sessionStorage.getItem(CACHE_PREFIX + key);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function writeCache(key: string, data: DashboardStatsResponse): void {
    try { sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data)); }
    catch { /* quota exceeded */ }
}

interface UseDashboardStatsResult {
    data: DashboardStatsResponse | null;
    loading: boolean;
    error: string | null;
    refetch: () => void;
}

export const useDashboardStats = (
    period: string = '30d',
    groupBy: string = 'day',
    startDate?: string,
    endDate?: string,
    docType?: string,
): UseDashboardStatsResult => {
    const cacheKey = `${docType}_${period}_${groupBy}_${startDate}_${endDate}`;
    const initialCache = readCache(cacheKey);

    const [data, setData] = useState<DashboardStatsResponse | null>(initialCache);
    const [loading, setLoading] = useState(!initialCache);
    const [error, setError] = useState<string | null>(null);
    const hasCacheRef = useRef(!!initialCache);

    const fetchStats = useCallback(async () => {
        if (!hasCacheRef.current) setLoading(true);
        setError(null);

        try {
            const response = await getDashboardStats(period, groupBy, startDate, endDate, docType);
            if (response.success && response.data) {
                setData(response.data);
                writeCache(cacheKey, response.data);
            } else {
                setError(response.message || 'Failed to fetch stats');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Network error');
        } finally {
            setLoading(false);
            hasCacheRef.current = false;
        }
    }, [period, groupBy, startDate, endDate, docType, cacheKey]);

    // When params change, check cache for new key
    useEffect(() => {
        const cached = readCache(cacheKey);
        if (cached) {
            setData(cached);
            setLoading(false);
            hasCacheRef.current = true;
        } else {
            hasCacheRef.current = false;
        }
    }, [cacheKey]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    return { data, loading, error, refetch: fetchStats };
};

export default useDashboardStats;
