/**
 * API Service - Centralized API communication layer
 *
 * Handles all HTTP requests with proper error handling and auth headers.
 * Can be configured with different base URLs for different modules.
 */

// Response wrapper type
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    message?: string;
}

// Request options
interface RequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    body?: any;
    headers?: Record<string, string>;
    params?: Record<string, string | number>;
}

// API Service configuration
interface ApiServiceConfig {
    baseUrl: string;
    portalUrl?: string;
    tokenKey?: string;
}

export class ApiService {
    private baseUrl: string;
    private portalUrl: string;
    private tokenKey: string;

    constructor(config: ApiServiceConfig) {
        this.baseUrl = config.baseUrl;
        this.portalUrl = config.portalUrl || 'http://localhost:3001';
        this.tokenKey = config.tokenKey || 'auth_token';
    }

    /**
     * Get auth token from localStorage
     */
    private getToken(): string | null {
        return localStorage.getItem(this.tokenKey);
    }

    /**
     * Build URL with query params
     */
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

    /**
     * Make API request with auth headers
     */
    private async request<T>(
        endpoint: string,
        options: RequestOptions = {}
    ): Promise<ApiResponse<T>> {
        const {
            method = 'GET',
            body,
            headers = {},
            params
        } = options;

        const token = this.getToken();
        const url = this.buildUrl(endpoint, params);

        const requestHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            ...headers
        };

        if (token) {
            requestHeaders['Authorization'] = `Bearer ${token}`;
        }

        const requestConfig: RequestInit = {
            method,
            headers: requestHeaders
        };

        if (body && method !== 'GET') {
            // Handle file upload
            if (body instanceof FormData) {
                delete requestHeaders['Content-Type'];
                requestConfig.body = body;
            } else {
                requestConfig.body = JSON.stringify(body);
            }
        }

        try {
            const response = await fetch(url, requestConfig);

            // Handle 401 unauthorized - redirect to portal
            if (response.status === 401) {
                localStorage.removeItem(this.tokenKey);
                localStorage.removeItem('auth_user');
                window.location.href = this.portalUrl;
                return { success: false, message: 'Unauthorized' };
            }

            // Parse JSON response
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

    /** GET request */
    async get<T>(endpoint: string, params?: Record<string, string | number>): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, { method: 'GET', params });
    }

    /** POST request */
    async post<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, { method: 'POST', body });
    }

    /** PUT request */
    async put<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, { method: 'PUT', body });
    }

    /** PATCH request */
    async patch<T>(endpoint: string, body?: any): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, { method: 'PATCH', body });
    }

    /** DELETE request */
    async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
        return this.request<T>(endpoint, { method: 'DELETE' });
    }

    /** Upload file with FormData */
    async upload<T>(endpoint: string, file: File, additionalData?: Record<string, string>): Promise<ApiResponse<T>> {
        const formData = new FormData();
        formData.append('file', file);

        if (additionalData) {
            Object.entries(additionalData).forEach(([key, value]) => {
                formData.append(key, value);
            });
        }

        return this.request<T>(endpoint, {
            method: 'POST',
            body: formData
        });
    }
}

/**
 * Factory function to create API service instance
 *
 * Usage:
 * const api = createApiService({
 *     baseUrl: 'http://localhost:5004',
 *     portalUrl: 'http://localhost:3001'
 * });
 */
export const createApiService = (config: ApiServiceConfig): ApiService => {
    return new ApiService(config);
};
