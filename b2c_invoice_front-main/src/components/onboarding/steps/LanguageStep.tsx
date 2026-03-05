/**
 * LanguageStep - Language picker with flag cards.
 */

import React from 'react';
import { useLang } from '../../../shared/i18n';
import { authApi } from '../../../services/authApi';

const LanguageStep: React.FC = () => {
    const { t, lang, setLang } = useLang();

    const handleSelect = (selected: 'tr' | 'en' | 'de') => {
        setLang(selected);
        authApi.updatePreferences({ language: selected });
    };

    const langs = [
        { key: 'tr' as const, flag: '🇹🇷', label: t('onboardingLangTR') },
        { key: 'en' as const, flag: '🇬🇧', label: t('onboardingLangEN') },
        { key: 'de' as const, flag: '🇩🇪', label: t('onboardingLangDE') },
    ];

    return (
        <div className="wizard-step wizard-step--language">
            <h2 className="wizard-step__title">{t('onboardingLangTitle')}</h2>
            <p className="wizard-step__desc">{t('onboardingLangDesc')}</p>

            <div className="lang-cards">
                {langs.map(({ key, flag, label }) => (
                    <button
                        key={key}
                        className={`lang-card ${lang === key ? 'lang-card--selected' : ''}`}
                        onClick={() => handleSelect(key)}
                    >
                        <span className="lang-card__flag">{flag}</span>
                        <span className="lang-card__label">{label}</span>
                        {lang === key && <span className="lang-card__check">&#10003;</span>}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default LanguageStep;
