/**
 * useTutorial - Convenience hook wrapping OnboardingContext for tutorial.
 */

import { useOnboarding } from '../context/OnboardingContext';
import { tutorialSteps, TutorialStep } from '../components/tutorial/tutorialSteps';

interface UseTutorialReturn {
    isActive: boolean;
    currentStep: TutorialStep | null;
    stepIndex: number;
    totalSteps: number;
    goNext: () => void;
    goBack: () => void;
    skip: () => void;
}

export const useTutorial = (): UseTutorialReturn => {
    const {
        showTutorial,
        tutorialStep,
        nextTutorial,
        backTutorial,
        skipTutorial,
    } = useOnboarding();

    return {
        isActive: showTutorial,
        currentStep: showTutorial ? (tutorialSteps[tutorialStep] || null) : null,
        stepIndex: tutorialStep,
        totalSteps: tutorialSteps.length,
        goNext: nextTutorial,
        goBack: backTutorial,
        skip: skipTutorial,
    };
};
