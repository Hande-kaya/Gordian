/**
 * Currency Conversion Utility
 * ============================
 * Static exchange rates (base: USD). Updated periodically.
 * Rates approximate — for display purposes only.
 */

// Rates relative to 1 USD (as of Feb 2026, approximate)
const RATES_TO_USD: Record<string, number> = {
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
    TRY: 36.5,
    CHF: 0.88,
    JPY: 150.0,
    CAD: 1.36,
    AUD: 1.55,
    SEK: 10.4,
    NOK: 10.8,
    DKK: 6.85,
    PLN: 4.0,
    CZK: 23.0,
    HUF: 370.0,
    RON: 4.55,
    BGN: 1.80,
    HRK: 6.93,
    RUB: 92.0,
    CNY: 7.25,
    KRW: 1330.0,
    INR: 83.5,
    BRL: 5.0,
    MXN: 17.2,
    SAR: 3.75,
    AED: 3.67,
    QAR: 3.64,
    KWD: 0.31,
};

export const SUPPORTED_CURRENCIES = Object.keys(RATES_TO_USD);

export const DISPLAY_CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP', 'CHF', 'SAR', 'AED'];

/**
 * Convert amount from one currency to another.
 * Returns null if either currency is unknown.
 */
export function convertCurrency(
    amount: number,
    fromCurrency: string,
    toCurrency: string
): number | null {
    if (fromCurrency === toCurrency) return amount;
    const fromRate = RATES_TO_USD[fromCurrency.toUpperCase()];
    const toRate = RATES_TO_USD[toCurrency.toUpperCase()];
    if (!fromRate || !toRate) return null;
    // Convert: amount → USD → target
    const usd = amount / fromRate;
    return usd * toRate;
}

const PREF_KEY = 'preferred_display_currency';

export function getPreferredCurrency(): string {
    return localStorage.getItem(PREF_KEY) || 'TRY';
}

export function setPreferredCurrency(currency: string): void {
    localStorage.setItem(PREF_KEY, currency);
}
