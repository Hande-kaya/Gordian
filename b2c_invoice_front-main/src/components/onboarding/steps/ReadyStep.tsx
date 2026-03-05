/**
 * ReadyStep - Celebration screen with tour start/skip options.
 */

import React from 'react';
import { useLang } from '../../../shared/i18n';
import Avatar from '../../tutorial/illustrations/Avatar';

interface ReadyStepProps {
    onStartTour: () => void;
    onSkipTour: () => void;
}

const ReadyStep: React.FC<ReadyStepProps> = ({ onStartTour, onSkipTour }) => {
    const { t } = useLang();

    return (
        <div className="wizard-step wizard-step--ready">
            <div className="wizard-step__avatar">
                <Avatar mood="celebrate" size={96} />
            </div>
            <h2 className="wizard-step__title">{t('onboardingReadyTitle')}</h2>
            <p className="wizard-step__desc">{t('onboardingReadyDesc')}</p>
            <div className="wizard-step__actions">
                <button className="wizard-step__btn wizard-step__btn--primary" onClick={onStartTour}>
                    {t('onboardingStartTour')}
                </button>
                <button className="wizard-step__btn wizard-step__btn--ghost" onClick={onSkipTour}>
                    {t('onboardingSkipTour')}
                </button>
            </div>
        </div>
    );
};

export default ReadyStep;
