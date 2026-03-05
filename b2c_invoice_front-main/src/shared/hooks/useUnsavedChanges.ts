/**
 * useUnsavedChanges - Navigation guard for unsaved changes.
 *
 * Works with BrowserRouter (no data router required):
 * - beforeunload: guards tab close / refresh
 * - popstate: guards browser back / forward
 * - guardNavigation(): exported function for sidebar / programmatic navigation
 */

import { useEffect, useState, useCallback, useRef } from 'react';

// --- Global guard registry (only one guard active at a time) ---
let _guardActive = false;
let _showGuardModal: ((onConfirm: () => void) => void) | null = null;

/**
 * Call before performing a navigation action.
 * If a guard is active, shows the confirmation modal and stores the action.
 * @returns true if navigation was blocked, false if it should proceed.
 */
export function guardNavigation(action: () => void): boolean {
    if (_guardActive && _showGuardModal) {
        _showGuardModal(action);
        return true;
    }
    return false;
}

export function useUnsavedChanges(hasUnsavedChanges: boolean) {
    const [showModal, setShowModal] = useState(false);
    const pendingRef = useRef<(() => void) | null>(null);
    const leavingRef = useRef(false);

    // Register / unregister global guard
    useEffect(() => {
        if (hasUnsavedChanges) {
            _guardActive = true;
            _showGuardModal = (action) => {
                pendingRef.current = action;
                setShowModal(true);
            };
        } else {
            _guardActive = false;
            _showGuardModal = null;
        }
        return () => {
            _guardActive = false;
            _showGuardModal = null;
        };
    }, [hasUnsavedChanges]);

    // Browser tab close / refresh
    useEffect(() => {
        if (!hasUnsavedChanges) return;
        const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [hasUnsavedChanges]);

    // Browser back / forward
    useEffect(() => {
        if (!hasUnsavedChanges) return;
        leavingRef.current = false;

        // Push a guard entry so "back" triggers popstate without leaving
        window.history.pushState({ __navGuard: true }, '', window.location.href);

        const handlePop = () => {
            // Re-push to stay on current page
            window.history.pushState({ __navGuard: true }, '', window.location.href);
            pendingRef.current = () => {
                leavingRef.current = true;
                window.history.go(-2); // past re-push + original guard
            };
            setShowModal(true);
        };

        window.addEventListener('popstate', handlePop);
        return () => {
            window.removeEventListener('popstate', handlePop);
            // Clean up guard entry if not navigating away (e.g. user saved)
            if (!leavingRef.current && window.history.state?.__navGuard) {
                window.history.back();
            }
        };
    }, [hasUnsavedChanges]);

    const confirmLeave = useCallback(() => {
        setShowModal(false);
        const action = pendingRef.current;
        pendingRef.current = null;
        // Deactivate guard before executing action to prevent re-trigger
        _guardActive = false;
        _showGuardModal = null;
        leavingRef.current = true;
        action?.();
    }, []);

    const cancelLeave = useCallback(() => {
        setShowModal(false);
        pendingRef.current = null;
    }, []);

    return { isBlocked: showModal, confirmLeave, cancelLeave };
}
