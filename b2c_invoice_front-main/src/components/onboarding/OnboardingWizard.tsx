/**
 * OnboardingWizard - Full-screen overlay wizard with step navigation.
 * Renders current step component and progress dots.
 */

import React from 'react';
import { useLang } from '../../shared/i18n';
import { useOnboarding } from '../../context/OnboardingContext';
import WelcomeStep from './steps/WelcomeStep';
import ThemeStep from './steps/ThemeStep';
import LanguageStep from './steps/LanguageStep';
import ReadyStep from './steps/ReadyStep';
import './OnboardingWizard.scss';

const STEPS = ['welcome', 'theme', 'language', 'ready'] as const;

const OnboardingWizard: React.FC = () => {
    const { t } = useLang();
    const {
        showWizard,
        wizardStep,
        nextWizard,
        backWizard,
        finishWizard,
    } = useOnboarding();

    if (!showWizard) return null;

    const renderStep = () => {
        switch (STEPS[wizardStep]) {
            case 'welcome':
                return <WelcomeStep onNext={nextWizard} />;
            case 'theme':
                return <ThemeStep />;
            case 'language':
                return <LanguageStep />;
            case 'ready':
                return (
                    <ReadyStep
                        onStartTour={() => finishWizard(true)}
                        onSkipTour={() => finishWizard(false)}
                    />
                );
            default:
                return null;
        }
    };

    const showNav = wizardStep > 0 && wizardStep < STEPS.length - 1;

    return (
        <div className="onboarding-overlay">
            <div className="onboarding-wizard" key={wizardStep}>
                <div className="onboarding-wizard__content">
                    {renderStep()}
                </div>

                {/* Navigation for middle steps */}
                {showNav && (
                    <div className="onboarding-wizard__nav">
                        <button className="onboarding-wizard__nav-btn" onClick={backWizard}>
                            {t('onboardingBack')}
                        </button>
                        <button
                            className="onboarding-wizard__nav-btn onboarding-wizard__nav-btn--primary"
                            onClick={nextWizard}
                        >
                            {t('onboardingNext')}
                        </button>
                    </div>
                )}

                {/* Progress dots */}
                <div className="onboarding-wizard__dots">
                    {STEPS.map((_, i) => (
                        <div
                            key={i}
                            className={`onboarding-wizard__dot ${i === wizardStep ? 'onboarding-wizard__dot--active' : ''} ${i < wizardStep ? 'onboarding-wizard__dot--done' : ''}`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default OnboardingWizard;
