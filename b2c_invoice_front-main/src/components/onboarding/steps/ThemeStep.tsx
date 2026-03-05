/**
 * ThemeStep - Theme picker with visual preview cards.
 */

import React from 'react';
import { useLang } from '../../../shared/i18n';
import { useTheme, Theme } from '../../../context/ThemeContext';
import { authApi } from '../../../services/authApi';

const ThemeStep: React.FC = () => {
    const { t } = useLang();
    const { theme, setTheme } = useTheme();

    const handleSelect = (selected: Theme) => {
        setTheme(selected);
        authApi.updatePreferences({ theme: selected });
    };

    const themes: { key: Theme; label: string; desc: string }[] = [
        { key: 'light', label: t('onboardingThemeLight'), desc: t('onboardingThemeLightDesc') },
        { key: 'dark', label: t('onboardingThemeDark'), desc: t('onboardingThemeDarkDesc') },
        { key: 'system', label: t('onboardingThemeSystem'), desc: t('onboardingThemeSystemDesc') },
    ];

    return (
        <div className="wizard-step wizard-step--theme">
            <h2 className="wizard-step__title">{t('onboardingThemeTitle')}</h2>
            <p className="wizard-step__desc">{t('onboardingThemeDesc')}</p>

            <div className="theme-cards">
                {themes.map(({ key, label, desc }) => (
                    <button
                        key={key}
                        className={`theme-card theme-card--${key} ${theme === key ? 'theme-card--selected' : ''}`}
                        onClick={() => handleSelect(key)}
                    >
                        <div className="theme-card__preview">
                            {key === 'light' && (
                                <div className="theme-preview theme-preview--light">
                                    <div className="theme-preview__sidebar" />
                                    <div className="theme-preview__content">
                                        <div className="theme-preview__line" />
                                        <div className="theme-preview__line theme-preview__line--short" />
                                    </div>
                                </div>
                            )}
                            {key === 'dark' && (
                                <div className="theme-preview theme-preview--dark">
                                    <div className="theme-preview__sidebar" />
                                    <div className="theme-preview__content">
                                        <div className="theme-preview__line" />
                                        <div className="theme-preview__line theme-preview__line--short" />
                                    </div>
                                </div>
                            )}
                            {key === 'system' && (
                                <div className="theme-preview theme-preview--system">
                                    <div className="theme-preview--split-left">
                                        <div className="theme-preview__sidebar" />
                                        <div className="theme-preview__content">
                                            <div className="theme-preview__line" />
                                        </div>
                                    </div>
                                    <div className="theme-preview--split-right">
                                        <div className="theme-preview__sidebar" />
                                        <div className="theme-preview__content">
                                            <div className="theme-preview__line" />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="theme-card__info">
                            <span className="theme-card__label">{label}</span>
                            <span className="theme-card__desc">{desc}</span>
                        </div>
                        {theme === key && <div className="theme-card__check">&#10003;</div>}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default ThemeStep;
