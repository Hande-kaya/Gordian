/**
 * ThemeContext - Manages light/dark/system theme preference.
 *
 * Reads from localStorage for fast hydration, syncs to DB via authApi.
 * Sets data-theme attribute on <html> for CSS custom properties.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    resolvedTheme: ResolvedTheme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = (): ThemeContextType => {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useTheme must be used within a ThemeProvider');
    return context;
};

const STORAGE_KEY = 'app_theme';

const getSystemTheme = (): ResolvedTheme => {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const resolveTheme = (theme: Theme): ResolvedTheme => {
    return theme === 'system' ? getSystemTheme() : theme;
};

const applyTheme = (resolved: ResolvedTheme) => {
    document.documentElement.dataset.theme = resolved;
};

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [theme, setThemeState] = useState<Theme>(() => {
        const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
        return saved && ['light', 'dark', 'system'].includes(saved) ? saved : 'system';
    });

    const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
        const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
        const t = saved && ['light', 'dark', 'system'].includes(saved) ? saved : 'system';
        return resolveTheme(t);
    });

    const setTheme = useCallback((newTheme: Theme) => {
        setThemeState(newTheme);
        localStorage.setItem(STORAGE_KEY, newTheme);
        const resolved = resolveTheme(newTheme);
        setResolvedTheme(resolved);
        applyTheme(resolved);
    }, []);

    // Apply on mount
    useEffect(() => {
        applyTheme(resolvedTheme);
    }, []);

    // Listen for system theme changes when in 'system' mode
    useEffect(() => {
        if (theme !== 'system') return;

        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = (e: MediaQueryListEvent) => {
            const resolved = e.matches ? 'dark' : 'light';
            setResolvedTheme(resolved);
            applyTheme(resolved);
        };
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};
