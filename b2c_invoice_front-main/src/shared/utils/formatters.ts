/**
 * Common Formatters - Date, Currency, Number utilities
 */

/**
 * Format date to Turkish locale
 */
export const formatDate = (date: string | Date | null | undefined): string => {
    if (!date) return '-';
    try {
        const d = typeof date === 'string' ? new Date(date) : date;
        return d.toLocaleDateString('tr-TR');
    } catch {
        return '-';
    }
};

/**
 * Format date with time
 */
export const formatDateTime = (date: string | Date | null | undefined): string => {
    if (!date) return '-';
    try {
        const d = typeof date === 'string' ? new Date(date) : date;
        return d.toLocaleString('tr-TR');
    } catch {
        return '-';
    }
};

/**
 * Format currency with Turkish locale
 */
export const formatCurrency = (
    amount: number | string | null | undefined,
    currency: string = 'TRY'
): string => {
    if (amount === null || amount === undefined || amount === '') return '-';

    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numAmount)) return '-';

    try {
        return new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: currency
        }).format(numAmount);
    } catch {
        return `${numAmount.toLocaleString('tr-TR')} ${currency}`;
    }
};

/**
 * Format number with Turkish locale
 */
export const formatNumber = (
    num: number | string | null | undefined,
    decimals: number = 2
): string => {
    if (num === null || num === undefined || num === '') return '-';

    const numValue = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(numValue)) return '-';

    return numValue.toLocaleString('tr-TR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
};

/**
 * Format file size
 */
export const formatFileSize = (bytes: number | null | undefined): string => {
    if (!bytes) return '-';

    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
};

/**
 * Truncate text with ellipsis
 */
export const truncateText = (text: string | null | undefined, maxLength: number = 50): string => {
    if (!text) return '-';
    if (text.length <= maxLength) return text;
    return `${text.substring(0, maxLength)}...`;
};

/**
 * Parse localized number input (supports European format: "1.234,56" → 1234.56)
 */
export const parseLocalizedNumber = (value: string | number): number => {
    if (typeof value === 'number') return value;
    if (!value || typeof value !== 'string') return 0;
    const cleaned = value.replace(/\s/g, '');
    // Has comma as last separator? → European format (e.g. "1.234,56")
    if (/,\d{1,2}$/.test(cleaned)) {
        return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
    }
    return parseFloat(cleaned) || 0;
};

/**
 * Format percentage
 */
export const formatPercentage = (value: number | null | undefined, decimals: number = 1): string => {
    if (value === null || value === undefined) return '-';
    return `${value.toFixed(decimals)}%`;
};
