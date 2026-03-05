/**
 * WelcomeStep - First onboarding wizard step.
 * Logo, welcome message, avatar, and "Let's Start" button.
 */

import React from 'react';
import { useLang } from '../../../shared/i18n';
import Avatar from '../../tutorial/illustrations/Avatar';

interface WelcomeStepProps {
    onNext: () => void;
}

const WelcomeStep: React.FC<WelcomeStepProps> = ({ onNext }) => {
    const { t } = useLang();

    return (
        <div className="wizard-step wizard-step--welcome">
            <div className="wizard-step__avatar">
                <Avatar mood="happy" size={96} />
            </div>
            <h2 className="wizard-step__title">{t('onboardingWelcomeTitle')}</h2>
            <p className="wizard-step__desc">{t('onboardingWelcomeDesc')}</p>
            <button className="wizard-step__btn wizard-step__btn--primary" onClick={onNext}>
                {t('onboardingLetsStart')}
            </button>
        </div>
    );
};

export default WelcomeStep;
