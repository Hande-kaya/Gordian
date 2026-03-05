/**
 * AuthContext - Shared authentication context for all modules
 *
 * Usage:
 * <AuthProvider apiUrl="http://localhost:5004" portalUrl="http://localhost:3001">
 *   <App />
 * </AuthProvider>
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface User {
    _id: string;
    email: string;
    name: string;
    role: string;
    company_id?: string;
    company?: any;
    permissions?: any;
    is_admin?: boolean;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    loginWithToken: (token: string) => Promise<{ success: boolean; user?: User; error?: string }>;
    logout: () => void;
    isLoading: boolean;
    isAuthenticated: boolean;
}

interface AuthProviderProps {
    children: ReactNode;
    /** Backend API URL for token validation (e.g., http://localhost:5004) */
    apiUrl: string;
    /** Portal URL for SSO redirects (e.g., http://localhost:3001) */
    portalUrl: string;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider: React.FC<AuthProviderProps> = ({
    children,
    apiUrl,
    portalUrl
}) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // API endpoint for token validation
    const meEndpoint = `${apiUrl}/api/me`;

    const loginWithToken = async (accessToken: string): Promise<{ success: boolean; user?: User; error?: string }> => {
        try {
            const response = await fetch(meEndpoint, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            if (!response.ok) {
                return { success: false, error: `Token validation failed: ${response.status}` };
            }

            const data = await response.json();

            if (data.success && data.data?.user) {
                const userData = data.data.user;
                setToken(accessToken);
                setUser(userData);
                localStorage.setItem('auth_token', accessToken);
                localStorage.setItem('auth_user', JSON.stringify(userData));
                return { success: true, user: userData };
            }

            return { success: false, error: 'Failed to validate token' };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    };

    // Check for token in URL (SSO from Portal) or localStorage
    useEffect(() => {
        const initAuth = async () => {
            // Check URL for token from Portal redirect
            const urlParams = new URLSearchParams(window.location.search);
            const urlToken = urlParams.get('token');

            if (urlToken) {
                // Store in sessionStorage temporarily to survive URL clear
                sessionStorage.setItem('pending_token', urlToken);

                // Clear token from URL
                window.history.replaceState({}, document.title, window.location.pathname);

                // Validate and use token
                const result = await loginWithToken(urlToken);
                sessionStorage.removeItem('pending_token');
                setIsLoading(false);
                return;
            }

            // Check sessionStorage for pending token (race condition fix)
            const pendingToken = sessionStorage.getItem('pending_token');
            if (pendingToken) {
                const result = await loginWithToken(pendingToken);
                sessionStorage.removeItem('pending_token');
                setIsLoading(false);
                return;
            }

            // Check localStorage for existing session
            const savedToken = localStorage.getItem('auth_token');
            const savedUser = localStorage.getItem('auth_user');

            if (savedToken && savedUser) {
                try {
                    // Validate token is still valid
                    const response = await fetch(meEndpoint, {
                        headers: { 'Authorization': `Bearer ${savedToken}` }
                    });

                    if (response.ok) {
                        setToken(savedToken);
                        setUser(JSON.parse(savedUser));
                    } else {
                        localStorage.removeItem('auth_token');
                        localStorage.removeItem('auth_user');
                    }
                } catch (error) {
                    localStorage.removeItem('auth_token');
                    localStorage.removeItem('auth_user');
                }
            }

            setIsLoading(false);
        };

        initAuth();
    }, [meEndpoint]);

    const logout = () => {
        setUser(null);
        setToken(null);
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        // Redirect to Portal
        window.location.href = portalUrl;
    };

    const value: AuthContextType = {
        user,
        token,
        loginWithToken,
        logout,
        isLoading,
        isAuthenticated: !!user && !!token,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthProvider;
