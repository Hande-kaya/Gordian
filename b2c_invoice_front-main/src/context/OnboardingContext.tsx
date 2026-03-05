/**
 * OnboardingContext - Manages wizard + tutorial state.
 *
 * Flow: user logs in → if !onboarding_completed → show wizard → show tutorial → mark complete.
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { authApi } from '../services/authApi';

const PUBLIC_ROUTES = ['/', '/login', '/register', '/verify', '/forgot-password', '/reset-password', '/auth/sso-callback'];

interface OnboardingContextType {
    showWizard: boolean;
    showTutorial: boolean;
    wizardStep: number;
    tutorialStep: number;
    totalTutorialSteps: number;
    setWizardStep: (step: number) => void;
    nextWizard: () => void;
    backWizard: () => void;
    finishWizard: (startTour: boolean) => void;
    nextTutorial: () => void;
    backTutorial: () => void;
    skipTutorial: () => void;
    completeTutorial: () => void;
    setTotalTutorialSteps: (n: number) => void;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export const useOnboarding = (): OnboardingContextType => {
    const ctx = useContext(OnboardingContext);
    if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
    return ctx;
};

const WIZARD_STEPS = 4; // Welcome, Theme, Language, Ready

export const OnboardingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const location = useLocation();
    const isPublicRoute = PUBLIC_ROUTES.some(r => location.pathname === r);
    const needsOnboarding = !!user && !user.preferences?.onboarding_completed && !isPublicRoute;

    const [showWizard, setShowWizard] = useState(needsOnboarding);
    const [showTutorial, setShowTutorial] = useState(false);
    const [wizardStep, setWizardStep] = useState(0);
    const [tutorialStep, setTutorialStep] = useState(0);
    const [totalTutorialSteps, setTotalTutorialSteps] = useState(9);

    // Re-evaluate when user or route changes
    React.useEffect(() => {
        if (user && !user.preferences?.onboarding_completed && !isPublicRoute) {
            setShowWizard(true);
        } else {
            setShowWizard(false);
            if (isPublicRoute) setShowTutorial(false);
        }
    }, [user, isPublicRoute]);

    const nextWizard = useCallback(() => {
        setWizardStep((s) => Math.min(s + 1, WIZARD_STEPS - 1));
    }, []);

    const backWizard = useCallback(() => {
        setWizardStep((s) => Math.max(s - 1, 0));
    }, []);

    const markComplete = useCallback(async () => {
        if (user) {
            await authApi.updatePreferences({ onboarding_completed: true });
        }
    }, [user]);

    const finishWizard = useCallback((startTour: boolean) => {
        setShowWizard(false);
        if (startTour) {
            setTutorialStep(0);
            setShowTutorial(true);
        } else {
            markComplete();
        }
    }, [markComplete]);

    const nextTutorial = useCallback(() => {
        setTutorialStep((s) => {
            if (s + 1 >= totalTutorialSteps) {
                setShowTutorial(false);
                markComplete();
                return s;
            }
            return s + 1;
        });
    }, [totalTutorialSteps, markComplete]);

    const backTutorial = useCallback(() => {
        setTutorialStep((s) => Math.max(s - 1, 0));
    }, []);

    const skipTutorial = useCallback(() => {
        setShowTutorial(false);
        markComplete();
    }, [markComplete]);

    const completeTutorial = useCallback(() => {
        setShowTutorial(false);
        markComplete();
    }, [markComplete]);

    return (
        <OnboardingContext.Provider value={{
            showWizard,
            showTutorial,
            wizardStep,
            tutorialStep,
            totalTutorialSteps,
            setWizardStep,
            nextWizard,
            backWizard,
            finishWizard,
            nextTutorial,
            backTutorial,
            skipTutorial,
            completeTutorial,
            setTotalTutorialSteps,
        }}>
            {children}
        </OnboardingContext.Provider>
    );
};
