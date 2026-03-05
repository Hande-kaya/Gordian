/**
 * Avatar - Friendly mascot character with mood variants.
 * Inline SVG for consistent rendering across themes.
 */

import React from 'react';

export type AvatarMood = 'happy' | 'pointing' | 'thinking' | 'celebrate';

interface AvatarProps {
    mood?: AvatarMood;
    size?: number;
}

const Avatar: React.FC<AvatarProps> = ({ mood = 'happy', size = 64 }) => {
    const getExpression = () => {
        switch (mood) {
            case 'pointing':
                return (
                    <>
                        {/* Eyes looking right */}
                        <circle cx="18" cy="18" r="2.5" fill="#111827" />
                        <circle cx="30" cy="18" r="2.5" fill="#111827" />
                        <circle cx="19" cy="17.5" r="0.8" fill="white" />
                        <circle cx="31" cy="17.5" r="0.8" fill="white" />
                        {/* Smile */}
                        <path d="M18 26 Q24 31 30 26" stroke="#111827" strokeWidth="2" fill="none" strokeLinecap="round" />
                        {/* Pointing hand on right */}
                        <g transform="translate(38, 20)">
                            <path d="M0 0 L12 -4 L14 -2 L4 2 Z" fill="#fbbf24" stroke="#f59e0b" strokeWidth="0.5" />
                        </g>
                    </>
                );
            case 'thinking':
                return (
                    <>
                        {/* Eyes looking up */}
                        <circle cx="18" cy="17" r="2.5" fill="#111827" />
                        <circle cx="30" cy="17" r="2.5" fill="#111827" />
                        <circle cx="18.5" cy="16" r="0.8" fill="white" />
                        <circle cx="30.5" cy="16" r="0.8" fill="white" />
                        {/* Thinking mouth */}
                        <path d="M20 27 Q24 25 28 27" stroke="#111827" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                        {/* Hand on chin */}
                        <g transform="translate(10, 28)">
                            <circle cx="0" cy="4" r="3.5" fill="#fbbf24" stroke="#f59e0b" strokeWidth="0.5" />
                        </g>
                        {/* Thought dots */}
                        <circle cx="40" cy="8" r="1.5" fill="#d1d5db" />
                        <circle cx="43" cy="4" r="1" fill="#d1d5db" />
                    </>
                );
            case 'celebrate':
                return (
                    <>
                        {/* Happy closed eyes */}
                        <path d="M15 18 Q18 15 21 18" stroke="#111827" strokeWidth="2" fill="none" strokeLinecap="round" />
                        <path d="M27 18 Q30 15 33 18" stroke="#111827" strokeWidth="2" fill="none" strokeLinecap="round" />
                        {/* Big smile */}
                        <path d="M16 25 Q24 33 32 25" stroke="#111827" strokeWidth="2" fill="none" strokeLinecap="round" />
                        {/* Raised arms */}
                        <g transform="translate(-6, 8)">
                            <path d="M8 20 L2 8" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
                            <circle cx="2" cy="6" r="3" fill="#fbbf24" />
                        </g>
                        <g transform="translate(38, 8)">
                            <path d="M0 20 L6 8" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
                            <circle cx="6" cy="6" r="3" fill="#fbbf24" />
                        </g>
                        {/* Stars */}
                        <text x="0" y="6" fontSize="8" fill="#f59e0b">✦</text>
                        <text x="42" y="4" fontSize="6" fill="#10b981">✦</text>
                        <text x="46" y="14" fontSize="5" fill="#3b82f6">✦</text>
                    </>
                );
            case 'happy':
            default:
                return (
                    <>
                        {/* Eyes */}
                        <circle cx="18" cy="18" r="2.5" fill="#111827" />
                        <circle cx="30" cy="18" r="2.5" fill="#111827" />
                        <circle cx="18.5" cy="17" r="0.8" fill="white" />
                        <circle cx="30.5" cy="17" r="0.8" fill="white" />
                        {/* Smile */}
                        <path d="M17 25 Q24 32 31 25" stroke="#111827" strokeWidth="2" fill="none" strokeLinecap="round" />
                        {/* Waving hand */}
                        <g transform="translate(38, 14)">
                            <path d="M0 6 L6 0" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
                            <circle cx="7" cy="-1" r="3" fill="#fbbf24" />
                        </g>
                    </>
                );
        }
    };

    return (
        <svg width={size} height={size} viewBox="-4 -4 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Head circle */}
            <circle cx="24" cy="24" r="22" fill="#fbbf24" />
            <circle cx="24" cy="24" r="22" fill="url(#avatarGrad)" />
            {/* Gradient */}
            <defs>
                <radialGradient id="avatarGrad" cx="0.35" cy="0.35" r="0.65">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.25)" />
                    <stop offset="100%" stopColor="rgba(0,0,0,0)" />
                </radialGradient>
            </defs>
            {/* Expression */}
            {getExpression()}
        </svg>
    );
};

export default Avatar;
