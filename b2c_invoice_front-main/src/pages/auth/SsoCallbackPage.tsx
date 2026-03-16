/**
 * SSO Callback Page - Handles Microsoft & Google SSO redirect
 *
 * URL params:
 *  ?success=true                                   -> cookie set, check session
 *  ?success=false&error=...                        -> show error
 *  ?needs_completion=true&provider=...&...          -> registration completion form
 */

import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../services/authApi';
import { useLang } from '../../shared/i18n';
import AuthMarketingPanel from './AuthMarketingPanel';
import './AuthPages.scss';

const SSO_ERROR_KEYS: Record<string, string> = {
    b2b_account: 'ssoErrB2bAccount',
    invalid_state: 'ssoErrInvalidState',
    email_not_found: 'ssoErrEmailNotFound',
    sso_not_configured: 'ssoErrNotConfigured',
    missing_code: 'ssoErrMissingCode',
};

const SsoCallbackPage: React.FC = () => {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const { checkSession } = useAuth();
    const { t } = useLang();

    const [status, setStatus] = useState<'loading' | 'completion' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState('');
    const [provider, setProvider] = useState<string>(() => params.get('provider') || 'google');

    // Completion form state
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [formError, setFormError] = useState('');
    const [formLoading, setFormLoading] = useState(false);
    const [completionToken, setCompletionToken] = useState('');

    useEffect(() => {
        handleCallback();
    }, []);

    const handleCallback = async () => {
        const success = params.get('success');
        const error = params.get('error');
        const needsCompletion = params.get('needs_completion');
        const prov = params.get('provider') || 'microsoft';
        setProvider(prov);

        if (success === 'true') {
            // Store token from URL (cross-domain: cookie may be blocked)
            const urlToken = params.get('token');
            if (urlToken) {
                localStorage.setItem('access_token', urlToken);
                // Remove token from URL to prevent leaking via Referer
                window.history.replaceState({}, '', window.location.pathname + '?success=true');
            }
            // Validate session
            const ok = await checkSession();
            if (ok) {
                navigate('/reconciliation', { replace: true });
            } else {
                setStatus('error');
                setErrorMsg(t('ssoSessionFailed'));
            }
            return;
        }

        if (needsCompletion === 'true') {
            setCompletionToken(params.get('completion_token') || '');
            setName(params.get('suggested_name') || '');
            setStatus('completion');
            return;
        }

        const errKey = error || 'unknown';
        const translationKey = SSO_ERROR_KEYS[errKey];
        setErrorMsg(translationKey ? t(translationKey) : (error || t('ssoErrUnknown')));
        setStatus('error');
    };

    const handleComplete = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');

        if (!name.trim()) { setFormError(t('nameRequired')); return; }
        // Password is optional — but if entered, must be valid
        if (password && password.length < 8) { setFormError(t('passwordTooShort')); return; }
        if (password && password !== confirmPassword) { setFormError(t('passwordsNoMatch')); return; }

        setFormLoading(true);
        const completeFn = provider === 'google'
            ? authApi.googleCompleteRegistration
            : authApi.microsoftCompleteRegistration;
        const result = await completeFn(completionToken, name.trim(), password || '');

        if (result.success) {
            // Store token if present (cross-domain fallback)
            if (result.access_token) {
                localStorage.setItem('access_token', result.access_token);
            }
            // Validate session
            const ok = await checkSession();
            if (ok) {
                navigate('/reconciliation', { replace: true });
                return;
            }
        }

        setFormError(result.message || t('ssoCompletionFailed'));
        setFormLoading(false);
    };

    const providerLabel = provider === 'google' ? 'Google' : 'Microsoft';

    // Loading state
    if (status === 'loading') {
        return (
            <div className="auth-page" style={{ flexDirection: 'column', gap: 16 }}>
                <div className="sso-spinner" />
                <p style={{ color: '#fff', fontSize: 15 }}>{t('ssoSigningIn').replace('{provider}', providerLabel)}</p>
            </div>
        );
    }

    // Error state
    if (status === 'error') {
        return (
            <div className="auth-page auth-split-page auth-animated">
                <div className="auth-panel">
                    <Link className="auth-panel__logo" to="/login">Invoice<span>Manager</span></Link>
                    <div className="auth-panel__form">
                        <h1>{t('ssoLoginFailed')}</h1>
                        <p className="auth-panel__subtitle">{errorMsg}</p>
                        <button className="auth-btn" onClick={() => navigate('/login', { replace: true })}>
                            {t('ssoBackToLogin')}
                        </button>
                    </div>
                </div>
                <AuthMarketingPanel />
            </div>
        );
    }

    // Completion form with split layout + animations
    return (
        <div className="auth-page auth-split-page auth-animated">
            <div className="auth-panel">
                <Link className="auth-panel__logo" to="/login">Invoice<span>Manager</span></Link>
                <div className="auth-panel__form">
                    <h1>{t('ssoCompleteTitle')}</h1>
                    <p className="auth-panel__subtitle">
                        {t('ssoCompleteSubtitle').replace('{provider}', providerLabel)}
                    </p>
                    <form onSubmit={handleComplete} className="auth-form">
                        {formError && <div className="auth-error">{formError}</div>}
                        <div className="form-group">
                            <label htmlFor="name">{t('nameLabel')}</label>
                            <input
                                id="name" type="text" value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder={t('namePlaceholder')} required autoFocus
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="password">{t('passwordLabel')} <span style={{ color: '#999', fontWeight: 400 }}>{t('ssoPasswordOptional')}</span></label>
                            <input
                                id="password" type="password" value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder={t('ssoPasswordHint')}
                            />
                        </div>
                        {password && (
                            <div className="form-group">
                                <label htmlFor="confirmPassword">{t('confirmPasswordLabel')}</label>
                                <input
                                    id="confirmPassword" type="password" value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    placeholder={t('confirmPasswordPlaceholder')}
                                />
                            </div>
                        )}
                        <button type="submit" className="auth-btn" disabled={formLoading}>
                            {formLoading ? t('ssoCompleteLoading') : t('ssoCompleteButton')}
                        </button>
                    </form>
                    <div className="auth-footer">
                        <span>{t('hasAccount')} </span>
                        <Link to="/login">{t('signIn')}</Link>
                    </div>
                </div>
            </div>
            <AuthMarketingPanel />
        </div>
    );
};

export default SsoCallbackPage;
