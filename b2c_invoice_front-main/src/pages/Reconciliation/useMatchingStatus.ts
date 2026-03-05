/**
 * useMatchingStatus — polls backend for matching_in_progress state.
 * On mount: checks if matching is already running (e.g. user navigated away).
 * Exposes startPolling() for when a new match attempt returns "already in progress".
 */
import { useEffect, useRef, useCallback } from 'react';
import { getMatchingStatus } from '../../services/reconciliationApi';

const POLL_INTERVAL = 3000;

interface UseMatchingStatusOpts {
    setMatching: (v: boolean) => void;
    onComplete: () => void;
}

export function useMatchingStatus({ setMatching, onComplete }: UseMatchingStatusOpts) {
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    const startPolling = useCallback(() => {
        stopPolling();
        pollRef.current = setInterval(async () => {
            const s = await getMatchingStatus();
            if (!s.data?.matching_in_progress) {
                stopPolling();
                setMatching(false);
                onComplete();
            }
        }, POLL_INTERVAL);
    }, [stopPolling, setMatching, onComplete]);

    // On mount: check if matching is already in progress
    useEffect(() => {
        let cancelled = false;
        getMatchingStatus().then(res => {
            if (cancelled) return;
            if (res.data?.matching_in_progress) {
                setMatching(true);
                startPolling();
            }
        });
        return () => {
            cancelled = true;
            stopPolling();
        };
    }, []);

    return { startPolling };
}
