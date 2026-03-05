/**
 * Auth API Service - B2C authentication API calls
 *
 * Uses httpOnly cookies for auth — no token in JS.
 */

import { config } from '../utils/config';

interface AuthResponse {
    success: boolean;
    message?: string;
    data?: {
        email?: string;
        authorization_url?: string;
    };
    code?: string;
    access_token?: string;
}

const authFetch = async (endpoint: string, body: any, method = 'POST'): Promise<AuthResponse> => {
    try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('access_token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const response = await fetch(`${config.API_URL}${endpoint}`, {
            method,
            headers,
            credentials: 'include',
            body: JSON.stringify(body),
        });
        const result = await response.json();
        // Store token from response body (cross-domain fallback)
        if (result.access_token) {
            localStorage.setItem('access_token', result.access_token);
        }
        return result;
    } catch (error) {
        return { success: false, message: 'Network error' };
    }
};

export const authApi = {
    register: (name: string, email: string, password: string) =>
        authFetch('/api/auth/register', { name, email, password }),

    login: (email: string, password: string) =>
        authFetch('/api/auth/login', { email, password }),

    verifyEmail: (email: string, code: string) =>
        authFetch('/api/auth/verify-email', { email, code }),

    resendVerification: (email: string) =>
        authFetch('/api/auth/resend-verification', { email }),

    forgotPassword: (email: string) =>
        authFetch('/api/auth/forgot-password', { email }),

    resetPassword: (email: string, code: string, newPassword: string) =>
        authFetch('/api/auth/reset-password', { email, code, new_password: newPassword }),

    me: async (): Promise<AuthResponse & { data?: { user?: any } }> => {
        try {
            const headers: Record<string, string> = {};
            const token = localStorage.getItem('access_token');
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            const response = await fetch(`${config.API_URL}/api/auth/me`, {
                credentials: 'include',
                headers,
            });
            return await response.json();
        } catch {
            return { success: false, message: 'Network error' };
        }
    },

    microsoftLogin: async (): Promise<AuthResponse> => {
        try {
            const response = await fetch(`${config.API_URL}/api/auth/microsoft/login`, {
                credentials: 'include',
            });
            return await response.json();
        } catch {
            return { success: false, message: 'Network error' };
        }
    },

    microsoftCompleteRegistration: (completionToken: string, name: string, password: string) =>
        authFetch('/api/auth/microsoft/complete-registration', {
            completion_token: completionToken,
            name,
            password,
        }),

    googleLogin: async (): Promise<AuthResponse> => {
        try {
            const response = await fetch(`${config.API_URL}/api/auth/google/login`, {
                credentials: 'include',
            });
            return await response.json();
        } catch {
            return { success: false, message: 'Network error' };
        }
    },

    googleCompleteRegistration: (completionToken: string, name: string, password: string) =>
        authFetch('/api/auth/google/complete-registration', {
            completion_token: completionToken,
            name,
            password,
        }),

    logout: () => authFetch('/api/auth/logout', {}),

    updateProfile: (updates: { name?: string; email?: string }) =>
        authFetch('/api/auth/profile', updates, 'PATCH'),

    setPassword: (newPassword: string) =>
        authFetch('/api/auth/set-password', { new_password: newPassword }),

    changePassword: (currentPassword: string, newPassword: string) =>
        authFetch('/api/auth/change-password', {
            current_password: currentPassword,
            new_password: newPassword,
        }),

    uploadProfilePhoto: (photo: string) =>
        authFetch('/api/auth/profile-photo', { photo }),

    removeProfilePhoto: () =>
        authFetch('/api/auth/profile-photo', { photo: null }),

    updatePreferences: (prefs: { theme?: string; language?: string; onboarding_completed?: boolean }) =>
        authFetch('/api/auth/preferences', prefs, 'PATCH'),
};

export default authApi;
