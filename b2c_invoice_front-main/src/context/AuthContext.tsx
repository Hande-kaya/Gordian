/**
 * AuthContext - B2C authentication context
 *
 * Uses httpOnly cookies for JWT storage.
 * Token is never accessible to JavaScript — only the user profile is in state.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { authApi } from '../services/authApi';

export interface UserPreferences {
    onboarding_completed: boolean;
    theme: 'light' | 'dark' | 'system';
    language: 'tr' | 'en';
}

export interface User {
    user_id: string;
    email: string;
    name: string;
    role: string;
    company_id?: string;
    is_admin?: boolean;
    account_type?: 'b2c' | 'b2b';
    profile_photo?: string;
    has_password?: boolean;
    preferences?: UserPreferences;
}

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    login: (email: string, password: string) => Promise<{ success: boolean; message?: string; code?: string }>;
    register: (name: string, email: string, password: string) => Promise<{ success: boolean; message?: string }>;
    checkSession: () => Promise<boolean>;
    refreshSession: () => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Optimistic init: if we have a cached user, render immediately
    const cachedUser = (() => {
        try {
            const raw = localStorage.getItem('auth_user');
            return raw ? JSON.parse(raw) as User : null;
        } catch { return null; }
    })();

    const [user, setUser] = useState<User | null>(cachedUser);
    const [isLoading, setIsLoading] = useState(!cachedUser);

    const setUserAndCache = (userData: User) => {
        setUser(userData);
        localStorage.setItem('auth_user', JSON.stringify(userData));
    };

    const clearSession = useCallback(() => {
        setUser(null);
        localStorage.removeItem('auth_user');
        localStorage.removeItem('access_token');
    }, []);

    const checkSession = useCallback(async (): Promise<boolean> => {
        try {
            const result = await authApi.me();
            if (result.success && result.data?.user) {
                setUserAndCache(result.data.user);
                return true;
            }
            clearSession();
            return false;
        } catch {
            clearSession();
            return false;
        }
    }, [clearSession]);

    const login = async (email: string, password: string) => {
        const result = await authApi.login(email, password);
        if (result.success) {
            // Cookie is set by the backend — fetch user profile
            const ok = await checkSession();
            if (ok) return { success: true };
            return { success: false, message: 'Login succeeded but session check failed' };
        }
        return {
            success: false,
            message: result.message,
            code: result.code,
        };
    };

    const register = async (name: string, email: string, password: string) => {
        const result = await authApi.register(name, email, password);
        return {
            success: result.success,
            message: result.message,
        };
    };

    const refreshSession = useCallback(async () => {
        await checkSession();
    }, [checkSession]);

    const logout = async () => {
        try { await authApi.logout(); } catch { /* best-effort */ }
        clearSession();
    };

    // Background validation — if cached user exists, page renders immediately
    // while this verifies the session. If invalid, user gets logged out.
    useEffect(() => {
        const init = async () => {
            await checkSession();
            setIsLoading(false);
        };
        init();
    }, [checkSession]);

    return (
        <AuthContext.Provider value={{
            user,
            isLoading,
            isAuthenticated: !!user,
            login,
            register,
            checkSession,
            refreshSession,
            logout,
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthProvider;
