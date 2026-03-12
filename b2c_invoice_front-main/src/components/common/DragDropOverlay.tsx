/**
 * DragDropOverlay — page-wide drag-and-drop handler
 * ===================================================
 * Single-zone mode: one full-screen drop target (default).
 * Multi-zone mode: pass `zones` to split into labeled drop areas.
 *
 * Uses a counter pattern (dragenter +1 / dragleave -1) to prevent
 * flicker from child-element events.
 *
 * The overlay itself is always pointer-events: none so it never
 * interferes with the counter. Individual zone divs opt-in to
 * pointer-events: auto to receive their own drop events.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import './DragDropOverlay.scss';

export interface DropZone {
    label: string;
    icon?: React.ReactNode;
    onDrop: (files: File[]) => void;
    className?: string;
}

interface DragDropOverlayProps {
    /** Single-zone drop handler (ignored when `zones` is provided) */
    onDrop?: (files: File[]) => void;
    /** Multi-zone mode — renders separate drop targets */
    zones?: DropZone[];
    label?: string;
    forceVisible?: boolean;
}

const DragDropOverlay: React.FC<DragDropOverlayProps> = ({ onDrop, zones, label, forceVisible }) => {
    const [visible, setVisible] = useState(false);
    const [activeZone, setActiveZone] = useState<number | null>(null);
    const counterRef = useRef(0);
    const isMultiZone = !!(zones && zones.length > 0);

    const handleDragEnter = useCallback((e: DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer?.types?.includes('Files')) {
            counterRef.current += 1;
            if (counterRef.current === 1) setVisible(true);
        }
    }, []);

    const handleDragLeave = useCallback((e: DragEvent) => {
        e.preventDefault();
        counterRef.current -= 1;
        if (counterRef.current <= 0) {
            counterRef.current = 0;
            setVisible(false);
            setActiveZone(null);
        }
    }, []);

    const handleDragOver = useCallback((e: DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    }, []);

    const handleDocDrop = useCallback((e: DragEvent) => {
        e.preventDefault();
        counterRef.current = 0;
        setVisible(false);
        setActiveZone(null);
        // Single-zone: forward files to onDrop
        if (!isMultiZone && onDrop) {
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) onDrop(Array.from(files));
        }
        // Multi-zone: if drop lands outside a zone, just close (no-op)
    }, [onDrop, isMultiZone]);

    useEffect(() => {
        document.addEventListener('dragenter', handleDragEnter);
        document.addEventListener('dragleave', handleDragLeave);
        document.addEventListener('dragover', handleDragOver);
        document.addEventListener('drop', handleDocDrop);
        return () => {
            document.removeEventListener('dragenter', handleDragEnter);
            document.removeEventListener('dragleave', handleDragLeave);
            document.removeEventListener('dragover', handleDragOver);
            document.removeEventListener('drop', handleDocDrop);
        };
    }, [handleDragEnter, handleDragLeave, handleDragOver, handleDocDrop]);

    // Zone drop handler factory
    const makeZoneDrop = useCallback((zone: DropZone) => (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        counterRef.current = 0;
        setVisible(false);
        setActiveZone(null);
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) zone.onDrop(Array.from(files));
    }, []);

    if (!visible && !forceVisible) return null;

    // ── Multi-zone mode ──
    if (isMultiZone) {
        return (
            <div className="drag-drop-overlay drag-drop-overlay--zones">
                {zones.map((zone, i) => (
                    <div
                        key={i}
                        className={`drag-drop-zone${activeZone === i ? ' drag-drop-zone--active' : ''}${zone.className ? ` ${zone.className}` : ''}`}
                        onDragEnter={() => setActiveZone(i)}
                        onDragOver={(e) => { e.preventDefault(); setActiveZone(i); }}
                        onDragLeave={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                setActiveZone(null);
                            }
                        }}
                        onDrop={makeZoneDrop(zone)}
                    >
                        <div className="drag-drop-zone__content">
                            {zone.icon || (
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                                     stroke="currentColor" strokeWidth="1.5">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="17 8 12 3 7 8" />
                                    <line x1="12" y1="3" x2="12" y2="15" />
                                </svg>
                            )}
                            <span className="drag-drop-zone__label">{zone.label}</span>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    // ── Single-zone mode (original) ──
    return (
        <div className="drag-drop-overlay">
            <div className="drag-drop-overlay__content">
                <svg className="drag-drop-overlay__icon" width="48" height="48" viewBox="0 0 24 24"
                     fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span className="drag-drop-overlay__text">
                    {label || 'Drop files anywhere to upload'}
                </span>
            </div>
        </div>
    );
};

export default DragDropOverlay;
