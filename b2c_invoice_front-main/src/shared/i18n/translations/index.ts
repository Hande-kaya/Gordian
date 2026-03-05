/**
 * Translations Barrel + Merge Utility
 * ====================================
 */

import { Translations } from '../types';

export { commonTranslations } from './common';

/** Merge multiple Translations objects into one. Later sources override earlier ones. */
export function mergeTranslations(...sources: Translations[]): Translations {
    const result: Translations = { tr: {}, en: {}, de: {} };
    for (const source of sources) {
        Object.assign(result.tr, source.tr);
        Object.assign(result.en, source.en);
        Object.assign(result.de, source.de);
    }
    return result;
}
