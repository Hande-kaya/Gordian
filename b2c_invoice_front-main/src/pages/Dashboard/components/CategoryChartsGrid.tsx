/**
 * CategoryChartsGrid - Summary table + mini-charts, all in display currency.
 */

import React, { useMemo } from 'react';
import { CategorySpending } from '../../../services/statsApi';
import { convertCurrency } from '../../../utils/currency';
import { useCategories } from '../../../context/CategoryContext';
import { useLang } from '../../../shared/i18n';
import CategoryChart from './CategoryChart';

interface CategoryChartsGridProps {
    categories: CategorySpending[];
    loading: boolean;
    displayCurrency: string;
}

interface GroupedCategory {
    name: string;
    series: CategorySpending[];
    convertedTotal: number;
}

const CategoryChartsGrid: React.FC<CategoryChartsGridProps> = ({ categories, loading, displayCurrency }) => {
    const { getLabelByKey } = useCategories();
    const { t } = useLang();

    const grouped = useMemo((): GroupedCategory[] => {
        const map = new Map<string, CategorySpending[]>();
        for (const cs of categories) {
            const existing = map.get(cs.category) || [];
            existing.push(cs);
            map.set(cs.category, existing);
        }

        const result: GroupedCategory[] = [];
        map.forEach((series, name) => {
            const total = series.reduce((sum, s) => {
                const converted = convertCurrency(s.category_total, s.currency, displayCurrency) ?? s.category_total;
                return sum + converted;
            }, 0);
            result.push({ name, series, convertedTotal: total });
        });

        return result.sort((a, b) => b.convertedTotal - a.convertedTotal);
    }, [categories, displayCurrency]);

    if (loading) {
        return (
            <div className="dashboard__section">
                <h3 className="dashboard__section-title">{t('spendingByCategory')}</h3>
                <div className="dashboard__chart-placeholder">Loading...</div>
            </div>
        );
    }

    if (!categories.length) {
        return (
            <div className="dashboard__section">
                <h3 className="dashboard__section-title">{t('spendingByCategory')}</h3>
                <div className="dashboard__chart-placeholder">No category data for this period</div>
            </div>
        );
    }

    return (
        <div className="dashboard__section">
            <h3 className="dashboard__section-title">{t('spendingByCategory')}</h3>

            <table className="dashboard__category-table">
                <thead>
                    <tr>
                        <th>{t('catColLabel')}</th>
                        <th>{t('colTotalAmount')} ({displayCurrency})</th>
                    </tr>
                </thead>
                <tbody>
                    {grouped.map((g) => (
                        <tr key={g.name}>
                            <td>{getLabelByKey(g.name)}</td>
                            <td className="dashboard__table-try">
                                {g.convertedTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="dashboard__category-grid">
                {grouped.map((g) => (
                    <CategoryChart
                        key={g.name}
                        categoryName={g.name}
                        series={g.series}
                        displayCurrency={displayCurrency}
                        convertedTotal={g.convertedTotal}
                    />
                ))}
            </div>
        </div>
    );
};

export default CategoryChartsGrid;
