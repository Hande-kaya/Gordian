/**
 * Shared marketing panel for auth pages (login + register)
 * Mockup + floating bubbles + SVG illustrations
 */

import React from 'react';
import { useLang } from '../../shared/i18n';

const AuthMarketingPanel: React.FC = () => {
    const { t } = useLang();

    return (
        <div className="auth-marketing">
            {/* Central dashboard mockup */}
            <div className="mkt-mockup">
                <div className="mm-bar">
                    <span /><span /><span />
                    <div className="mm-title">Invoice Manager</div>
                </div>
                <div className="mm-body">
                    <div className="mm-side">
                        <div className="act" /><div /><div /><div />
                    </div>
                    <div className="mm-main">
                        <div className="mm-toolbar">
                            <div className="mm-search" />
                            <div className="mm-upload-btn" />
                        </div>
                        <div className="mm-table">
                            <div className="mm-row mm-head">
                                <span /><span /><span /><span /><span />
                            </div>
                            <div className="mm-row">
                                <span /><span /><span /><span />
                                <span className="mm-badge mm-green" />
                            </div>
                            <div className="mm-row">
                                <span /><span /><span /><span />
                                <span className="mm-badge mm-amber" />
                            </div>
                            <div className="mm-row">
                                <span /><span /><span /><span />
                                <span className="mm-badge mm-green" />
                            </div>
                            <div className="mm-row">
                                <span /><span /><span /><span />
                                <span className="mm-badge mm-green" />
                            </div>
                            <div className="mm-row">
                                <span /><span /><span /><span />
                                <span className="mm-badge mm-amber" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bubbles */}
            <div className="mkt-bubble mb-0">{t('mktBubble0')}</div>
            <div className="mkt-bubble mb-1">{t('mktBubble1')}</div>
            <div className="mkt-bubble mb-2">{t('mktBubble2')}</div>
            <div className="mkt-bubble mb-3">{t('mktBubble3')}</div>
            <div className="mkt-bubble mb-4">{t('mktBubble4')}</div>
            <div className="mkt-bubble mb-5">{t('mktBubble5')}</div>
            <div className="mkt-bubble mb-6">{t('mktBubble6')}</div>
            <div className="mkt-bubble mb-7">{t('mktBubble7')}</div>

            {/* SVG illustrations */}
            <svg className="mkt-svg ms-1" viewBox="0 0 46 56" fill="none">
                <rect x="4" y="4" width="38" height="48" rx="4" stroke="rgba(255,255,255,0.22)" strokeWidth="2" />
                <path d="M28 4 L28 16 L38 16" stroke="rgba(255,255,255,0.15)" strokeWidth="1.8" />
                <path d="M12 26h22M12 33h16M12 40h10" stroke="rgba(255,255,255,0.15)" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <svg className="mkt-svg ms-2" viewBox="0 0 56 46" fill="none">
                <path d="M6 38 L16 22 L26 30 L38 12 L50 18" stroke="rgba(255,255,255,0.25)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="26" cy="30" r="3" fill="rgba(16,185,129,0.4)" />
                <circle cx="38" cy="12" r="3" fill="rgba(16,185,129,0.4)" />
            </svg>
            <svg className="mkt-svg ms-3" viewBox="0 0 44 48" fill="none">
                <rect x="4" y="16" width="36" height="26" rx="5" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeDasharray="4 3" />
                <path d="M22 32 L22 8 M16 14 L22 8 L28 14" stroke="rgba(255,255,255,0.25)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </div>
    );
};

export default AuthMarketingPanel;
