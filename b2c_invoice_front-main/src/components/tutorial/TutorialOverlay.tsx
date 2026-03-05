/**
 * TutorialOverlay - Spotlight engine with navigation between steps.
 * Finds target elements, positions spotlight cutout, renders tooltip.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLang } from '../../shared/i18n';
import { useOnboarding } from '../../context/OnboardingContext';
import { tutorialSteps } from './tutorialSteps';
import TutorialTooltip from './TutorialTooltip';
import './Tutorial.scss';

const PADDING = 8;
const MOBILE_BP = 768;

/** Check if a step targets something inside the sidebar */
const isSidebarStep = (selector: string) =>
    selector.includes('sidebar') || selector.includes('-nav');

const TutorialOverlay: React.FC = () => {
    const { lang } = useLang();
    const navigate = useNavigate();
    const location = useLocation();
    const {
        showTutorial,
        tutorialStep,
        nextTutorial,
        backTutorial,
        skipTutorial,
        completeTutorial,
        setTotalTutorialSteps,
    } = useOnboarding();

    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
    const [tooltipPos, setTooltipPos] = useState<React.CSSProperties>({});
    const [effectivePosition, setEffectivePosition] = useState<'top' | 'bottom' | 'left' | 'right'>('bottom');
    const rafRef = useRef<number>(0);

    useEffect(() => {
        setTotalTutorialSteps(tutorialSteps.length);
    }, [setTotalTutorialSteps]);

    const step = tutorialSteps[tutorialStep];
    const isLast = tutorialStep === tutorialSteps.length - 1;

    // Navigate to step route if needed, scroll to top on route change
    useEffect(() => {
        if (!showTutorial || !step?.route) return;
        if (location.pathname !== step.route) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            navigate(step.route);
        }
    }, [showTutorial, step, location.pathname, navigate]);

    // Find and track target element
    const updatePosition = useCallback(() => {
        if (!showTutorial || !step) return;

        const el = document.querySelector(step.targetSelector);
        if (el) {
            const rect = el.getBoundingClientRect();
            setTargetRect(rect);

            const pos: React.CSSProperties = {};
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const isMobile = vw < MOBILE_BP;
            const TOOLTIP_W = isMobile ? Math.min(320, vw - 32) : 380;
            const TOOLTIP_H = 200;

            // On mobile, right/left positions won't fit — fall back to bottom
            const effectivePos = isMobile && (step.position === 'right' || step.position === 'left')
                ? 'bottom' as const : step.position;
            setEffectivePosition(effectivePos);

            const centerY = rect.height > vh * 0.6
                ? vh / 2
                : Math.min(Math.max(rect.top + rect.height / 2, TOOLTIP_H / 2 + 16), vh - TOOLTIP_H / 2 - 16);

            switch (effectivePos) {
                case 'bottom':
                    pos.top = Math.min(rect.bottom + PADDING + 12, vh - TOOLTIP_H - 16);
                    pos.left = Math.min(Math.max(rect.left + rect.width / 2, TOOLTIP_W / 2 + 16), vw - TOOLTIP_W / 2 - 16);
                    pos.transform = 'translateX(-50%)';
                    break;
                case 'top':
                    pos.bottom = Math.min(vh - rect.top + PADDING + 12, vh - 16);
                    pos.left = Math.min(Math.max(rect.left + rect.width / 2, TOOLTIP_W / 2 + 16), vw - TOOLTIP_W / 2 - 16);
                    pos.transform = 'translateX(-50%)';
                    break;
                case 'right':
                    pos.top = centerY;
                    pos.left = Math.min(rect.right + PADDING + 12, vw - TOOLTIP_W - 16);
                    pos.transform = 'translateY(-50%)';
                    break;
                case 'left':
                    pos.top = centerY;
                    pos.right = Math.min(vw - rect.left + PADDING + 12, vw - 16);
                    pos.transform = 'translateY(-50%)';
                    break;
            }
            setTooltipPos(pos);

            if (rect.top < 0 || rect.bottom > window.innerHeight) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else {
            setTargetRect(null);
        }
    }, [showTutorial, step]);

    useEffect(() => {
        if (!showTutorial) return;
        // Longer delay for mobile sidebar steps — wait for slide-in animation
        const needsSidebarWait = window.innerWidth < MOBILE_BP && step && isSidebarStep(step.targetSelector);
        const delay = needsSidebarWait ? 650 : 300;
        const timer = setTimeout(updatePosition, delay);
        return () => clearTimeout(timer);
    }, [showTutorial, tutorialStep, location.pathname, updatePosition, step]);

    // Track resize/scroll
    useEffect(() => {
        if (!showTutorial) return;
        const handler = () => {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(updatePosition);
        };
        window.addEventListener('resize', handler);
        window.addEventListener('scroll', handler, true);
        return () => {
            window.removeEventListener('resize', handler);
            window.removeEventListener('scroll', handler, true);
            cancelAnimationFrame(rafRef.current);
        };
    }, [showTutorial, updatePosition]);

    // On mobile, open sidebar for sidebar steps, close for others
    useEffect(() => {
        if (!showTutorial || !step) return;
        if (window.innerWidth < MOBILE_BP) {
            if (isSidebarStep(step.targetSelector)) {
                window.dispatchEvent(new CustomEvent('tutorial-open-sidebar'));
            } else {
                window.dispatchEvent(new CustomEvent('tutorial-close-sidebar'));
            }
        }
    }, [showTutorial, step, tutorialStep]);

    if (!showTutorial || !step) return null;

    const handleNext = () => {
        if (isLast) completeTutorial();
        else nextTutorial();
    };

    // Spotlight cutout style
    const spotlightStyle: React.CSSProperties = targetRect
        ? {
            position: 'fixed',
            top: targetRect.top - PADDING,
            left: targetRect.left - PADDING,
            width: targetRect.width + PADDING * 2,
            height: targetRect.height + PADDING * 2,
            borderRadius: 10,
        }
        : {};

    // Interactive mode: clip-path hole in backdrop so user can click through
    const backdropStyle: React.CSSProperties = {};
    if (step.interactive && targetRect) {
        const p = PADDING;
        const l = targetRect.left - p;
        const t = targetRect.top - p;
        const r = targetRect.right + p;
        const b = targetRect.bottom + p;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        backdropStyle.clipPath = `polygon(evenodd, 0px 0px, ${vw}px 0px, ${vw}px ${vh}px, 0px ${vh}px, 0px 0px, ${l}px ${t}px, ${l}px ${b}px, ${r}px ${b}px, ${r}px ${t}px)`;
    }

    // Raise z-index above modal for noBackdrop steps (export modal is z-index 10003)
    const overlayClass = `tutorial-overlay${step.noBackdrop ? ' tutorial-overlay--above-modal' : ''}`;

    return (
        <div className={overlayClass}>
            {/* Dark backdrop (hidden for noBackdrop steps, clipped for interactive) */}
            {!step.noBackdrop && (
                <div className="tutorial-overlay__backdrop" style={backdropStyle} />
            )}

            {/* Spotlight cutout */}
            {targetRect && (
                <div
                    className={`tutorial-overlay__spotlight ${step.pulseTarget ? 'tutorial-overlay__spotlight--pulse' : ''}`}
                    style={spotlightStyle}
                />
            )}

            {/* Tooltip */}
            <TutorialTooltip
                title={step.title[lang as 'tr' | 'en'] || step.title.en}
                description={step.description[lang as 'tr' | 'en'] || step.description.en}
                avatarMood={step.avatarMood}
                position={effectivePosition}
                stepIndex={tutorialStep}
                totalSteps={tutorialSteps.length}
                onNext={handleNext}
                onBack={backTutorial}
                onSkip={skipTutorial}
                isLast={isLast}
                style={tooltipPos}
            />
        </div>
    );
};

export default TutorialOverlay;
