/**
 * i18n Types
 * ==========
 * Shared type definitions for internationalization.
 */

export type Lang = 'tr' | 'en' | 'de';

export type Translations = Record<Lang, Record<string, string>>;
