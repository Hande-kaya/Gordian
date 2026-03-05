import React from 'react';
import { useLang } from '../../i18n';

interface DashboardPaginationProps {
    paginationInfo: {
        page: number;
        limit: number;
        total: number;
        pages: number;
        has_next: boolean;
        has_prev: boolean;
    };
    onPageChange: (page: number) => void;
}

const DashboardPagination: React.FC<DashboardPaginationProps> = ({
    paginationInfo,
    onPageChange
}) => {
    const { t } = useLang();

    if (!paginationInfo || paginationInfo.pages <= 1) return null;

    const pageText = t('pageOf')
        .replace('{page}', String(paginationInfo.page))
        .replace('{pages}', String(paginationInfo.pages))
        .replace('{total}', String(paginationInfo.total));

    return (
        <div className="pagination">
            <button
                className="pagination-btn"
                disabled={!paginationInfo.has_prev}
                onClick={() => onPageChange(paginationInfo.page - 1)}
            >
                {t('prev')}
            </button>
            <span className="pagination-info">
                {pageText}
            </span>
            <button
                className="pagination-btn"
                disabled={!paginationInfo.has_next}
                onClick={() => onPageChange(paginationInfo.page + 1)}
            >
                {t('next')}
            </button>
        </div>
    );
};

export default DashboardPagination;
