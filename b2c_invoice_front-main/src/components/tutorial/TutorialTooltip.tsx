/**
 * TutorialTooltip - Speech bubble with avatar and navigation.
 */

import React from 'react';
import { useLang } from '../../shared/i18n';
import Avatar, { AvatarMood } from './illustrations/Avatar';

interface TutorialTooltipProps {
    title: string;
    description: string;
    avatarMood: AvatarMood;
    position: 'top' | 'bottom' | 'left' | 'right';
    stepIndex: number;
    totalSteps: number;
    onNext: () => void;
    onBack: () => void;
    onSkip: () => void;
    isLast: boolean;
    style?: React.CSSProperties;
}

const TutorialTooltip: React.FC<TutorialTooltipProps> = ({
    title,
    description,
    avatarMood,
    position,
    stepIndex,
    totalSteps,
    onNext,
    onBack,
    onSkip,
    isLast,
    style,
}) => {
    const { t } = useLang();

    const stepText = t('tutorialStepOf')
        .replace('{current}', String(stepIndex + 1))
        .replace('{total}', String(totalSteps));

    return (
        <div className={`tutorial-tooltip tutorial-tooltip--${position}`} style={style}>
            <div className="tutorial-tooltip__avatar">
                <Avatar mood={avatarMood} size={48} />
            </div>
            <div className="tutorial-tooltip__bubble">
                <div className="tutorial-tooltip__header">
                    <h4 className="tutorial-tooltip__title">{title}</h4>
                    <button className="tutorial-tooltip__skip" onClick={onSkip}>
                        {t('onboardingSkip')}
                    </button>
                </div>
                <p className="tutorial-tooltip__desc">{description}</p>
                <div className="tutorial-tooltip__footer">
                    <span className="tutorial-tooltip__counter">{stepText}</span>
                    <div className="tutorial-tooltip__nav">
                        {stepIndex > 0 && (
                            <button className="tutorial-tooltip__btn" onClick={onBack}>
                                {t('onboardingBack')}
                            </button>
                        )}
                        <button
                            className="tutorial-tooltip__btn tutorial-tooltip__btn--primary"
                            onClick={onNext}
                        >
                            {isLast ? '🎉' : t('onboardingNext')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TutorialTooltip;
