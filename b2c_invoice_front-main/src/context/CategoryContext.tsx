/**
 * CategoryContext - Per-user expense category management.
 *
 * Fetches & caches categories on mount. Provides hook for
 * components to access categories and resolve labels by key.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getExpenseCategories, ExpenseCategory, CategoriesResponse } from '../services/documentApi';
import { useLang } from '../shared/i18n';
import { useAuth } from './AuthContext';

interface CategoryContextType {
    categories: ExpenseCategory[];
    isDefault: boolean;
    loading: boolean;
    refresh: () => Promise<void>;
    getLabelByKey: (key: string) => string;
}

const CategoryContext = createContext<CategoryContextType>({
    categories: [],
    isDefault: true,
    loading: true,
    refresh: async () => {},
    getLabelByKey: (key) => key,
});

export const useCategories = () => useContext(CategoryContext);

export const CategoryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [categories, setCategories] = useState<ExpenseCategory[]>([]);
    const [isDefault, setIsDefault] = useState(true);
    const [loading, setLoading] = useState(true);
    const { lang } = useLang();
    const { isAuthenticated, isLoading: authLoading } = useAuth();

    const fetchCategories = useCallback(async () => {
        if (!isAuthenticated) {
            setLoading(false);
            return;
        }
        try {
            const res = await getExpenseCategories();
            if (res.success && res.data) {
                setCategories(res.data.categories);
                setIsDefault(res.data.is_default);
            }
        } catch {
            // Keep whatever we had
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated]);

    useEffect(() => {
        if (!authLoading) fetchCategories();
    }, [fetchCategories, authLoading]);

    const getLabelByKey = useCallback((key: string): string => {
        const cat = categories.find(c => c.key === key);
        if (!cat) return key; // fallback to raw key for old/unknown categories
        return cat.labels[lang as 'tr' | 'en' | 'de'] || cat.labels.en || key;
    }, [categories, lang]);

    return (
        <CategoryContext.Provider value={{ categories, isDefault, loading, refresh: fetchCategories, getLabelByKey }}>
            {children}
        </CategoryContext.Provider>
    );
};
