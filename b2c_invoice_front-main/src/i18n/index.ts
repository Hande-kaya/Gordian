/**
 * B2C Translations Barrel
 * =======================
 * Merges shared common translations with all B2C-specific translations.
 */

import { commonTranslations, mergeTranslations, Translations } from '../shared/i18n';
import { authTranslations } from './auth';
import { invoiceListTranslations } from './invoiceList';
import { invoiceDetailTranslations } from './invoiceDetail';
import { dashboardTranslations } from './dashboard';
import { landingTranslations } from './landing';
import { settingsTranslations } from './settings';
import { bankStatementsTranslations } from './bankStatements';
import { trashTranslations } from './trash';
import { reconciliationTranslations } from './reconciliation';
import { onboardingTranslations } from './onboarding';
import { filesTranslations } from './files';

export const allTranslations: Translations = mergeTranslations(
    commonTranslations,
    authTranslations,
    invoiceListTranslations,
    invoiceDetailTranslations,
    dashboardTranslations,
    landingTranslations,
    settingsTranslations,
    bankStatementsTranslations,
    trashTranslations,
    reconciliationTranslations,
    onboardingTranslations,
    filesTranslations,
);
