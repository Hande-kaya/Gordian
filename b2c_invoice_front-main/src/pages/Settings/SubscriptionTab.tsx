/**
 * SubscriptionTab — Plans + credit purchase (custom amount) + purchase history.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useLang } from '../../shared/i18n';
import { billingApi, BillingTransaction } from '../../services/billingApi';
import './Billing.scss';

interface Props {
    refreshKey?: number;
}

const BASE_AMOUNT = 5;
const BASE_UPLOADS = 100;
const BASE_REGEN = 20;

const SubscriptionTab: React.FC<Props> = ({ refreshKey }) => {
    const { t } = useLang();
    const [amount, setAmount] = useState<string>('5');
    const [buying, setBuying] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [history, setHistory] = useState<BillingTransaction[]>([]);
    const [historyLoading, setHistoryLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setHistoryLoading(true);
        billingApi.getBillingHistory(1, 10).then(res => {
            if (!cancelled && res.success && res.data) setHistory(res.data.items || []);
            if (!cancelled) setHistoryLoading(false);
        });
        return () => { cancelled = true; };
    }, [refreshKey]);

    const credits = useMemo(() => {
        const val = parseFloat(amount);
        if (!val || val < 1) return { uploads: 0, regenerates: 0 };
        const ratio = val / BASE_AMOUNT;
        return {
            uploads: Math.floor(BASE_UPLOADS * ratio),
            regenerates: Math.floor(BASE_REGEN * ratio),
        };
    }, [amount]);

    const handleBuyCredits = async () => {
        const cents = Math.round(parseFloat(amount) * 100);
        if (!cents || cents < 100) return;
        setBuying(true);
        setError(null);
        try {
            const res = await billingApi.createCheckout(cents);
            if (res.success && res.data?.checkout_url) {
                window.location.href = res.data.checkout_url;
            } else {
                setError(res.message || t('checkoutError'));
            }
        } catch {
            setError(t('checkoutError'));
        } finally {
            setBuying(false);
        }
    };

    const formatDate = (iso: string) => {
        try {
            return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        } catch { return iso; }
    };

    const formatAmt = (cents: number, currency: string) => {
        const a = (cents / 100).toFixed(2);
        return currency === 'usd' ? `$${a}` : `${a} ${currency.toUpperCase()}`;
    };

    const statusClass = (s: string) => s === 'completed' ? 'success' : s === 'pending' ? 'pending' : 'error';

    const amountValid = parseFloat(amount) >= 1;

    return (
        <>
            {/* ── Plans ── */}
            <div className="settings__card">
                <h3 className="settings__card-title">{t('subscriptionSection')}</h3>
                <p className="settings__card-desc">{t('subscriptionDesc')}</p>

                <div className="settings__billing-grid">
                    {/* Free Plan */}
                    <div className="settings__billing-card settings__billing-card--free">
                        <div className="settings__billing-card-header">
                            <div className="settings__billing-icon settings__billing-icon--free">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                </svg>
                            </div>
                            <div>
                                <span className="settings__billing-badge settings__billing-badge--active">{t('currentPlan')}</span>
                                <h4 className="settings__billing-name">{t('planFree')}</h4>
                            </div>
                        </div>
                        <span className="settings__billing-price">$0 <span>/ {t('historyPerMonth')}</span></span>
                        <ul className="settings__billing-features">
                            <li>{t('freePlanFeature1')}</li>
                            <li>{t('freePlanFeature2')}</li>
                            <li>{t('freePlanFeature3')}</li>
                        </ul>
                    </div>

                    {/* Credit Pack */}
                    <div className="settings__billing-card settings__billing-card--credit">
                        <div className="settings__billing-card-header">
                            <div className="settings__billing-icon settings__billing-icon--credit">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 4H3a2 2 0 00-2 2v12a2 2 0 002 2h18a2 2 0 002-2V6a2 2 0 00-2-2z" />
                                    <path d="M1 10h22" />
                                </svg>
                            </div>
                            <div>
                                <span className="settings__billing-badge settings__billing-badge--credit">{t('creditPackBadge')}</span>
                                <h4 className="settings__billing-name">{t('creditPackTitle')}</h4>
                            </div>
                        </div>

                        <ul className="settings__billing-features">
                            <li>{t('creditFeature1')}</li>
                            <li>{t('creditFeature3')}</li>
                        </ul>

                        {/* Amount input */}
                        <div className="settings__billing-amount-row">
                            <div className="settings__billing-amount-wrap">
                                <input
                                    type="number"
                                    className="settings__billing-amount-input"
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    min="1"
                                    step="1"
                                    placeholder="5"
                                />
                            </div>
                        </div>

                        {/* Credit preview */}
                        {amountValid && (
                            <div className="settings__billing-preview">
                                <span className="settings__billing-preview-tag">
                                    {credits.uploads} {t('historyUploads')}
                                </span>
                                <span className="settings__billing-preview-tag">
                                    {credits.regenerates} {t('historyRegenerates')}
                                </span>
                            </div>
                        )}

                        <button
                            className="settings__billing-buy"
                            onClick={handleBuyCredits}
                            disabled={buying || !amountValid}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                                <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
                            </svg>
                            {buying ? t('checkoutLoading') : `${t('buyCredits')} — $${amountValid ? parseFloat(amount).toFixed(0) : '...'}`}
                        </button>
                    </div>
                </div>
                {error && <div className="settings__message settings__message--error" style={{ marginTop: 12 }}>{error}</div>}
            </div>

            {/* ── Purchase History ── */}
            <div className="settings__card" style={{ marginTop: 20 }}>
                <h3 className="settings__card-title">{t('historyTitle')}</h3>

                {historyLoading ? (
                    <p className="settings__card-desc">{t('loading')}</p>
                ) : history.length === 0 ? (
                    <div className="settings__history-empty">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
                            <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
                        </svg>
                        <p>{t('historyEmpty')}</p>
                    </div>
                ) : (
                    <div className="settings__history-table-wrap">
                        <table className="settings__history-table">
                            <thead>
                                <tr>
                                    <th>{t('historyDate')}</th>
                                    <th>{t('historyAmount')}</th>
                                    <th>{t('historyCredits')}</th>
                                    <th>{t('historyStatus')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map(tx => (
                                    <tr key={tx._id}>
                                        <td>{formatDate(tx.created_at)}</td>
                                        <td className="settings__history-amount">{formatAmt(tx.amount_cents, tx.currency)}</td>
                                        <td>
                                            {tx.credits_granted.uploads > 0 && (
                                                <span className="settings__history-credit-tag">{tx.credits_granted.uploads} {t('historyUploads')}</span>
                                            )}
                                            {tx.credits_granted.regenerates > 0 && (
                                                <span className="settings__history-credit-tag">{tx.credits_granted.regenerates} {t('historyRegenerates')}</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`settings__history-status settings__history-status--${statusClass(tx.status)}`}>
                                                {t(`historyStatus_${tx.status}`)}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    );
};

export default SubscriptionTab;
