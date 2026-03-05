/**
 * Language Context
 * ================
 * Provides i18n support via React Context.
 * Follows the same pattern as AuthContext.
 *
 * Usage:
 * <LanguageProvider translations={allTranslations}>
 *   <App />
 * </LanguageProvider>
 *
 * In components:
 * const { t, lang, setLang } = useLang();
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Lang, Translations } from './types';

interface LanguageContextType {
    lang: Lang;
    setLang: (lang: Lang) => void;
    t: (key: string) => string;
}

interface LanguageProviderProps {
    children: ReactNode;
    translations: Translations;
}

const STORAGE_KEY = 'app_lang';

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

/** Detect initial language from localStorage or browser */
export function getInitialLang(): Lang {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'tr' || stored === 'en' || stored === 'de') return stored;
    } catch { /* SSR or restricted storage */ }
    if (typeof navigator !== 'undefined') {
        if (navigator.language?.startsWith('tr')) return 'tr';
        if (navigator.language?.startsWith('de')) return 'de';
    }
    return 'en';
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children, translations }) => {
    const [lang, setLangState] = useState<Lang>(getInitialLang);

    const setLang = useCallback((newLang: Lang) => {
        setLangState(newLang);
        try { localStorage.setItem(STORAGE_KEY, newLang); } catch { /* ignore */ }
    }, []);

    const t = useCallback(
        (key: string): string => translations[lang]?.[key] ?? key,
        [lang, translations]
    );

    return (
        <LanguageContext.Provider value={{ lang, setLang, t }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLang = (): LanguageContextType => {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLang must be used within a LanguageProvider');
    }
    return context;
};

export default LanguageProvider;
