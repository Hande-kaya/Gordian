/**
 * StatsCards - Dashboard stat cards with live counts.
 * Clicking a card navigates to the invoices list.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../../../shared/i18n';
import { DashboardCounts } from '../../../services/statsApi';

interface StatsCardsProps {
    counts: DashboardCounts | null;
    loading: boolean;
}

const TotalIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
    </svg>
);

const MatchedIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
);

const DiscrepancyIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
);

const PendingIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
);

const CARD_DEFS = [
    { key: 'total' as const, labelKey: 'totalExpenses', color: '#3b82f6', bg: '#eff6ff', filter: '', icon: <TotalIcon /> },
    { key: 'matched' as const, labelKey: 'matched', color: '#10b981', bg: '#ecfdf5', filter: 'matched', icon: <MatchedIcon /> },
    { key: 'discrepancy' as const, labelKey: 'discrepancies', color: '#f59e0b', bg: '#fffbeb', filter: 'discrepancy', icon: <DiscrepancyIcon /> },
    { key: 'pending' as const, labelKey: 'pendingReview', color: '#6b7280', bg: '#f3f4f6', filter: 'unmatched', icon: <PendingIcon /> },
];

const StatsCards: React.FC<StatsCardsProps> = ({ counts, loading }) => {
    const { t } = useLang();
    const navigate = useNavigate();

    const handleClick = (filter: string) => {
        const path = filter ? `/invoices?filter=${filter}` : '/invoices';
        navigate(path);
    };

    return (
        <div className="dashboard__stats">
            {CARD_DEFS.map((card) => (
                <div
                    key={card.key}
                    className={`dashboard__stat-card dashboard__stat-card--clickable dashboard__stat-card--${card.key}`}
                    onClick={() => handleClick(card.filter)}
                >
                    <div className="dashboard__stat-icon" style={{ backgroundColor: card.bg }}>
                        {card.icon}
                    </div>
                    <div>
                        <div className="dashboard__stat-value" style={{ color: card.color }}>
                            {loading ? '...' : (counts?.[card.key] ?? 0)}
                        </div>
                        <div className="dashboard__stat-label">{t(card.labelKey)}</div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default StatsCards;
