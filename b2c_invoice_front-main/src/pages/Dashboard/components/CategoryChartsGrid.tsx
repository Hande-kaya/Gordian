/**
 * CategoryChartsGrid - Spending by category as a donut pie chart.
 */

import React, { useMemo } from 'react';
import { CategorySpending } from '../../../services/statsApi';
import { convertCurrency } from '../../../utils/currency';
import { useCategories } from '../../../context/CategoryContext';
import { useLang } from '../../../shared/i18n';
import CategoryPieChart, { PieSlice } from './CategoryPieChart';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CategoryChartsGridProps {
    categories: CategorySpending[];
    loading: boolean;
    displayCurrency: string;
}

interface GroupedCategory {
    name: string;
    convertedTotal: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const groupCategories = (categories: CategorySpending[], displayCurrency: string): GroupedCategory[] => {
    const map = new Map<string, number>();
    for (const cs of categories) {
        const converted = convertCurrency(cs.category_total, cs.currency, displayCurrency) ?? cs.category_total;
        map.set(cs.category, (map.get(cs.category) ?? 0) + converted);
    }
    return Array.from(map.entries())
        .map(([name, convertedTotal]) => ({ name, convertedTotal }))
        .sort((a, b) => b.convertedTotal - a.convertedTotal);
};

const formatCategoryKey = (key: string): string =>
    key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const toPieSlices = (grouped: GroupedCategory[], getLabel: (k: string) => string): PieSlice[] => {
    const total = grouped.reduce((sum, g) => sum + g.convertedTotal, 0);
    if (total === 0) return [];
    return grouped.map((g) => ({
        name: formatCategoryKey(getLabel(g.name)),
        value: g.convertedTotal,
        percentage: (g.convertedTotal / total) * 100,
    }));
};

// ─── Component ────────────────────────────────────────────────────────────────

const CategoryChartsGrid: React.FC<CategoryChartsGridProps> = ({ categories, loading, displayCurrency }) => {
    const { getLabelByKey } = useCategories();
    const { t } = useLang();

    const grouped = useMemo(() => groupCategories(categories, displayCurrency), [categories, displayCurrency]);
    const pieSlices = useMemo(() => toPieSlices(grouped, getLabelByKey), [grouped, getLabelByKey]);

    if (loading) {
        return (
            <div className="dashboard__section">
                <h3 className="dashboard__section-title">{t('spendingByCategory')}</h3>
                <div className="dashboard__chart-placeholder">{t('loadingData')}</div>
            </div>
        );
    }

    if (!categories.length) {
        return (
            <div className="dashboard__section">
                <h3 className="dashboard__section-title">{t('spendingByCategory')}</h3>
                <div className="dashboard__chart-placeholder">{t('noCategoryData')}</div>
            </div>
        );
    }

    return (
        <div className="dashboard__section">
            <h3 className="dashboard__section-title">{t('spendingByCategory')}</h3>
            <div className="dashboard__chart-container">
                <CategoryPieChart data={pieSlices} displayCurrency={displayCurrency} />
            </div>
        </div>
    );
};

export default CategoryChartsGrid;
