/**
 * UsageTab — Shows real usage data from API (free quota + purchased credits).
 */

import React, { useEffect, useState } from 'react';
import { useLang } from '../../shared/i18n';
import { billingApi, UsageSummary } from '../../services/billingApi';

interface Props {
    refreshKey?: number;
}

const UsageTab: React.FC<Props> = ({ refreshKey }) => {
    const { t } = useLang();
    const [usage, setUsage] = useState<UsageSummary | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        billingApi.getUsage().then(res => {
            if (!cancelled && res.success && res.data) {
                setUsage(res.data);
            }
            if (!cancelled) setLoading(false);
        });
        return () => { cancelled = true; };
    }, [refreshKey]);

    if (loading) {
        return (
            <div className="settings__card">
                <h3 className="settings__card-title">{t('usageTitle')}</h3>
                <p className="settings__card-desc">{t('loading')}</p>
            </div>
        );
    }

    if (!usage) {
        return (
            <div className="settings__card">
                <h3 className="settings__card-title">{t('usageTitle')}</h3>
                <p className="settings__card-desc">{t('usageLoadError')}</p>
            </div>
        );
    }

    const { free_plan: fp, credits: cr } = usage;
    const uploadPct = fp.uploads_limit > 0
        ? Math.round((fp.uploads_used / fp.uploads_limit) * 100) : 0;
    const rematchPct = fp.rematches_limit > 0
        ? Math.round((fp.rematches_used / fp.rematches_limit) * 100) : 0;

    return (
        <div className="settings__card">
            <h3 className="settings__card-title">{t('usageTitle')}</h3>
            <p className="settings__card-desc">{t('usageDescription')}</p>

            {/* Free plan uploads */}
            <div className="settings__usage-item">
                <div className="settings__usage-header">
                    <div>
                        <span className="settings__usage-label">{t('freePlanUploads')}</span>
                        <span className="settings__usage-reset">
                            {t('usageResetsIn').replace('{days}', String(fp.days_remaining))}
                        </span>
                    </div>
                    <span className="settings__usage-pct">{uploadPct}% {t('usageUsed')}</span>
                </div>
                <div className="settings__usage-bar">
                    <div className="settings__usage-bar-fill" style={{ width: `${uploadPct}%` }} />
                </div>
                <span className="settings__usage-count">{fp.uploads_used} / {fp.uploads_limit}</span>
            </div>

            {/* Free plan rematches */}
            <div className="settings__usage-item" style={{ marginTop: 20 }}>
                <div className="settings__usage-header">
                    <div>
                        <span className="settings__usage-label">{t('freePlanRematches')}</span>
                        <span className="settings__usage-reset">
                            {t('usageResetsIn').replace('{days}', String(fp.days_remaining))}
                        </span>
                    </div>
                    <span className="settings__usage-pct">{rematchPct}% {t('usageUsed')}</span>
                </div>
                <div className="settings__usage-bar">
                    <div className="settings__usage-bar-fill" style={{ width: `${rematchPct}%` }} />
                </div>
                <span className="settings__usage-count">{fp.rematches_used} / {fp.rematches_limit}</span>
            </div>

            {/* Purchased credits */}
            {(cr.uploads_remaining > 0 || cr.regenerates_remaining > 0) && (
                <div className="settings__info-grid" style={{ marginTop: 24 }}>
                    <div className="settings__info-item">
                        <span className="settings__info-label">{t('paidUploads')}</span>
                        <span className="settings__info-value">{cr.uploads_remaining}</span>
                    </div>
                    <div className="settings__info-item">
                        <span className="settings__info-label">{t('paidRegenerates')}</span>
                        <span className="settings__info-value">{cr.regenerates_remaining}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UsageTab;
