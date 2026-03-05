/**
 * API Service - Centralized API communication layer for B2C
 *
 * Handles all HTTP requests with auth headers.
 * On 401, redirects to /login (not Portal).
 */

import { config } from '../utils/config';

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    message?: string;
}

interface RequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    body?: any;
    headers?: Record<string, string>;
    params?: Record<string, string | number>;
}

class ApiService {
    private baseUrl: string;

    constructor() {
        this.baseUrl = config.API_URL;
    }

    private buildUrl(endpoint: string, params?: Record<string, string | number>): string {
        let url = `${this.baseUrl}${endpoint}`;
        if (params) {
            const searchParams = new URLSearchParams();
            Object.entries(params).forEach(([key, value]) => {
                searchParams.append(key, String(value));
            });
            const queryString = searchParams.toString();
            if (queryString) {
                url += `?${queryString}`;
            }
        }
        return url;
    }

    private async request<T>(
        endpoint: string,
        options: RequestOptions = {}
    ): Promise<ApiResponse<T>> {
        const { method = 'GET', body, headers = {}, params } = options;

        const url = this.buildUrl(endpoint, params);

        const requestHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            ...headers
        };

        // Cross-domain auth: send token via Authorization header
        const token = localStorage.getItem('access_token');
        if (token) {
            requestHeaders['Authorization'] = `Bearer ${token}`;
        }

        const requestConfig: RequestInit = {
            method,
            headers: requestHeaders,
            credentials: 'include',
        };

        if (body && method !== 'GET') {
            if (body instanceof FormData) {
                delete requestHeaders['Content-Type'];
                requestConfig.body = body;
            } else {
                requestConfig.body = JSON.stringify(body);
            }
        }

        try {
            const response = await fetch(url, requestConfig);

            // Handle 401 - redirect to B2C login
            // Skip redirect if already on a public/auth page to prevent loops
            if (response.status === 401) {
                const isAuthPage = ['/login', '/register', '/verify', '/forgot-password', '/reset-password', '/auth/sso-callback', '/'].includes(window.location.pathname);
                if (!isAuthPage) {
                    // Best-effort server-side logout (cookie sent automatically)
                    fetch(`${this.baseUrl}/api/auth/logout`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                    }).catch(() => {});
                    localStorage.removeItem('auth_user');
                    localStorage.removeItem('access_token');
                    window.location.href = '/login';
                }
                return { success: false, message: 'Unauthorized' };
            }

            const data = await response.json();

            if (!response.ok) {
                return {
                    success: false,
                    message: data.message || `Request failed with status ${response.status}`
                };
            }

            return {
                success: true,
                data: data.data !== undefined ? data.data : data,
                message: data.message
            };

        } catch (error) {
            console.error('API request error:', error);
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Network error'
            };
        }
    }

    async get<T>(endpoint: string, params?: Record<string, string | number>): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, { method: 'GET', params });
    }

    async post<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, { method: 'POST', body });
    }

    async put<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, { method: 'PUT', body });
    }

    async patch<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, { method: 'PATCH', body });
    }

    async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, { method: 'DELETE' });
    }

    async upload<T>(endpoint: string, file: File, additionalData?: Record<string, string>): Promise<ApiResponse<T>> {
        const formData = new FormData();
        formData.append('file', file);

        if (additionalData) {
            Object.entries(additionalData).forEach(([key, value]) => {
                formData.append(key, value);
            });
        }

        return this.request<T>(endpoint, { method: 'POST', body: formData });
    }
}

export const apiService = new ApiService();

/** Auth headers for direct fetch calls (cross-domain token support). */
export const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('access_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};
