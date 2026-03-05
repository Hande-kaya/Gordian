/**
 * Landing Page SVG Illustrations
 * ===============================
 * Extracted from LandingPage.tsx to keep component under 400 lines.
 */

import React from 'react';

/* ── Feature Card Illustrations ──────────────────── */

/** Upload Expenses: documents + receipts with upload arrow */
export const UploadExpensesIll = () => (
    <svg width="120" height="100" viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="58" y="8" width="36" height="48" rx="3" fill="#d1fae5" stroke="#059669" strokeWidth="1.2" transform="rotate(8 58 8)" />
        <line x1="66" y1="22" x2="86" y2="22" stroke="#6ee7b7" strokeWidth="1.5" transform="rotate(8 66 22)" />
        <line x1="66" y1="28" x2="82" y2="28" stroke="#6ee7b7" strokeWidth="1.5" transform="rotate(8 66 28)" />
        <rect x="26" y="12" width="40" height="54" rx="3" fill="white" stroke="#059669" strokeWidth="1.5" />
        <path d="M54 12v12h12" fill="#d1fae5" stroke="#059669" strokeWidth="1.2" />
        <line x1="34" y1="32" x2="56" y2="32" stroke="#a7f3d0" strokeWidth="2" />
        <line x1="34" y1="38" x2="52" y2="38" stroke="#a7f3d0" strokeWidth="2" />
        <line x1="34" y1="44" x2="48" y2="44" stroke="#a7f3d0" strokeWidth="2" />
        <line x1="34" y1="50" x2="54" y2="50" stroke="#a7f3d0" strokeWidth="2" />
        <circle cx="38" cy="56" r="3" fill="#10b981" opacity="0.3" />
        <circle cx="60" cy="82" r="14" fill="#ecfdf5" stroke="#059669" strokeWidth="1.2" />
        <path d="M60 90V76M54 80l6-6 6 6" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

/** Upload Bank Statement: bank building + PDF + lock */
export const UploadBankIll = () => (
    <svg width="120" height="100" viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 38L40 26l16 12" stroke="#059669" strokeWidth="1.5" fill="#d1fae5" />
        <rect x="24" y="38" width="32" height="24" fill="white" stroke="#059669" strokeWidth="1.2" />
        <rect x="30" y="42" width="4" height="16" rx="1" fill="#a7f3d0" />
        <rect x="38" y="42" width="4" height="16" rx="1" fill="#a7f3d0" />
        <rect x="46" y="42" width="4" height="16" rx="1" fill="#a7f3d0" />
        <rect x="22" y="60" width="36" height="4" rx="1" fill="#059669" opacity="0.3" />
        <path d="M62 44h16" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M74 40l4 4-4 4" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="82" y="28" width="24" height="32" rx="2" fill="white" stroke="#059669" strokeWidth="1.2" />
        <rect x="86" y="32" width="12" height="6" rx="1" fill="#dc2626" opacity="0.8" />
        <text x="88" y="37" fill="white" fontSize="5" fontWeight="bold" fontFamily="sans-serif">PDF</text>
        <line x1="86" y1="44" x2="102" y2="44" stroke="#a7f3d0" strokeWidth="1.5" />
        <line x1="86" y1="49" x2="98" y2="49" stroke="#a7f3d0" strokeWidth="1.5" />
        <line x1="86" y1="54" x2="100" y2="54" stroke="#a7f3d0" strokeWidth="1.5" />
        <rect x="88" y="68" width="12" height="10" rx="2" fill="#059669" opacity="0.2" stroke="#059669" strokeWidth="1" />
        <path d="M91 68v-3a3 3 0 0 1 6 0v3" stroke="#059669" strokeWidth="1.2" fill="none" />
    </svg>
);

/** Matching & Checks: spreadsheet + magnifier + checkmarks */
export const MatchingIll = () => (
    <svg width="120" height="100" viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="16" y="14" width="44" height="56" rx="3" fill="white" stroke="#059669" strokeWidth="1.5" />
        <rect x="16" y="14" width="44" height="12" rx="3" fill="#d1fae5" />
        <line x1="16" y1="26" x2="60" y2="26" stroke="#059669" strokeWidth="0.8" />
        <line x1="16" y1="36" x2="60" y2="36" stroke="#e5e7eb" strokeWidth="0.8" />
        <line x1="16" y1="46" x2="60" y2="46" stroke="#e5e7eb" strokeWidth="0.8" />
        <line x1="16" y1="56" x2="60" y2="56" stroke="#e5e7eb" strokeWidth="0.8" />
        <line x1="34" y1="14" x2="34" y2="70" stroke="#e5e7eb" strokeWidth="0.8" />
        <path d="M24 32l2 2 4-4" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M24 42l2 2 4-4" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M24 52l2 2 4-4" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
        <rect x="42" y="30" width="12" height="4" rx="1" fill="#a7f3d0" />
        <rect x="42" y="40" width="10" height="4" rx="1" fill="#a7f3d0" />
        <rect x="42" y="50" width="14" height="4" rx="1" fill="#fecaca" />
        <circle cx="78" cy="46" r="14" stroke="#059669" strokeWidth="2" fill="#ecfdf5" />
        <line x1="88" y1="56" x2="96" y2="64" stroke="#059669" strokeWidth="3" strokeLinecap="round" />
        <path d="M72 46l4 4 8-8" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="96" cy="24" r="10" fill="#10b981" opacity="0.15" />
        <path d="M91 24l3 3 6-6" stroke="#059669" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

/* ── Comparison Table Icon ───────────────────────── */

export const Ci = ({ v }: { v: string }) => (
    <svg className={`cmp-icon cmp-${v}`} viewBox="0 0 24 24" fill="none">
        {v === 'y' && <path d="M4 13 C5.5 12 8.5 18 10 19 C12 15 17 7 20.5 3.5" stroke="#059669" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />}
        {v === 'p' && <path d="M5 12.5 C8.5 8 13.5 16 19 11.5" stroke="#d97706" strokeWidth="3" strokeLinecap="round" />}
        {v === 'n' && <>
            <path d="M6.5 5.5 C9 9 14 14 17.5 18.5" stroke="#d4d4d8" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M17.5 5.5 C14 9.5 10 14 6.5 18.5" stroke="#d4d4d8" strokeWidth="2.5" strokeLinecap="round" />
        </>}
    </svg>
);

/* ── Security Section Illustrations ──────────────── */

/** EU-Based Data Hosting: cloud with EU stars */
export const EuHostingIll = () => (
    <svg className="sec-icon" width="56" height="56" viewBox="0 0 56 56" fill="none">
        <circle cx="28" cy="28" r="26" fill="#ecfdf5" stroke="#d1fae5" strokeWidth="1" />
        {/* Cloud */}
        <path d="M16 34a6 6 0 0 1 .5-12 8 8 0 0 1 15.5-2 6 6 0 0 1 8 5.5A5 5 0 0 1 39 34z"
            fill="#d1fae5" stroke="#059669" strokeWidth="1.3" />
        {/* EU stars ring */}
        {[0, 60, 120, 180, 240, 300].map((deg, i) => (
            <circle key={i} cx={28 + 7 * Math.cos((deg - 90) * Math.PI / 180)}
                cy={25 + 7 * Math.sin((deg - 90) * Math.PI / 180)}
                r="1.3" fill="#059669" />
        ))}
        {/* Small flag */}
        <rect x="24" y="38" width="8" height="6" rx="1" fill="#064e3b" opacity="0.15" />
        <text x="28" y="43" textAnchor="middle" fill="#059669" fontSize="4" fontWeight="700">EU</text>
    </svg>
);

/** GDPR-Compliant: shield with checkmark */
export const GdprIll = () => (
    <svg className="sec-icon" width="56" height="56" viewBox="0 0 56 56" fill="none">
        <circle cx="28" cy="28" r="26" fill="#ecfdf5" stroke="#d1fae5" strokeWidth="1" />
        {/* Shield */}
        <path d="M28 12 L40 18 V30 C40 38 28 44 28 44 C28 44 16 38 16 30 V18 Z"
            fill="#d1fae5" stroke="#059669" strokeWidth="1.3" />
        {/* Checkmark */}
        <path d="M22 28l4 4 8-8" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
);

/** Encrypted End-to-End: lock with circular arrows */
export const EncryptionIll = () => (
    <svg className="sec-icon" width="56" height="56" viewBox="0 0 56 56" fill="none">
        <circle cx="28" cy="28" r="26" fill="#ecfdf5" stroke="#d1fae5" strokeWidth="1" />
        {/* Lock body */}
        <rect x="21" y="26" width="14" height="12" rx="2.5" fill="#d1fae5" stroke="#059669" strokeWidth="1.3" />
        {/* Lock shackle */}
        <path d="M23 26v-4a5 5 0 0 1 10 0v4" stroke="#059669" strokeWidth="1.5" fill="none" />
        {/* Keyhole */}
        <circle cx="28" cy="31" r="1.5" fill="#059669" />
        <rect x="27.2" y="31" width="1.6" height="3.5" rx="0.8" fill="#059669" />
        {/* Circular arrows */}
        <path d="M14 28a14 14 0 0 1 4-9" stroke="#059669" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.5" />
        <path d="M18 17l0 3.5 3-1" stroke="#059669" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
        <path d="M42 28a14 14 0 0 1-4 9" stroke="#059669" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.5" />
        <path d="M38 39l0-3.5-3 1" stroke="#059669" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
    </svg>
);

/** Strict Access Controls: key + person silhouette */
export const AccessControlIll = () => (
    <svg className="sec-icon" width="56" height="56" viewBox="0 0 56 56" fill="none">
        <circle cx="28" cy="28" r="26" fill="#ecfdf5" stroke="#d1fae5" strokeWidth="1" />
        {/* Person silhouette */}
        <circle cx="22" cy="20" r="4" fill="#d1fae5" stroke="#059669" strokeWidth="1.2" />
        <path d="M14 36a8 8 0 0 1 16 0" fill="#d1fae5" stroke="#059669" strokeWidth="1.2" />
        {/* Key */}
        <circle cx="38" cy="24" r="5" fill="none" stroke="#059669" strokeWidth="1.5" />
        <circle cx="38" cy="24" r="2" fill="#059669" opacity="0.3" />
        <line x1="38" y1="29" x2="38" y2="40" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="38" y1="35" x2="42" y2="35" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="38" y1="38" x2="41" y2="38" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

/** Full Control & Transparency: hand + refresh arrows */
export const TransparencyIll = () => (
    <svg className="sec-icon" width="56" height="56" viewBox="0 0 56 56" fill="none">
        <circle cx="28" cy="28" r="26" fill="#ecfdf5" stroke="#d1fae5" strokeWidth="1" />
        {/* Open hand */}
        <path d="M22 38 C20 34 18 28 22 24 C24 22 26 24 26 26 L26 22 C26 20 28 18 30 20 L30 22 C30 20 32 18 34 20 L34 24 C34 22 36 20 38 22 L38 30 C38 36 34 40 28 40 Z"
            fill="#d1fae5" stroke="#059669" strokeWidth="1.2" strokeLinejoin="round" />
        {/* Refresh arrows on palm */}
        <path d="M26 30a4 4 0 0 1 6-2" stroke="#059669" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        <path d="M32 27l0.5 2-2 0" stroke="#059669" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M34 32a4 4 0 0 1-6 2" stroke="#059669" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        <path d="M28 35l-0.5-2 2 0" stroke="#059669" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

/* Security SVGs removed — using CSS-only background effects */
