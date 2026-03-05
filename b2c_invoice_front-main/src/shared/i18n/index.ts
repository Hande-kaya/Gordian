/**
 * i18n Barrel Export
 * ==================
 */

export type { Lang, Translations } from './types';
export { LanguageProvider, useLang, getInitialLang } from './LanguageContext';
export { commonTranslations, mergeTranslations } from './translations';
