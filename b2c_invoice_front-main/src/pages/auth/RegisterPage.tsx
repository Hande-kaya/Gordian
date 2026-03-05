/**
 * Register Page - B2C user registration
 * Split layout: full-white left panel + marketing right
 */

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../services/authApi';
import { useLang } from '../../shared/i18n';
import AuthMarketingPanel from './AuthMarketingPanel';
import MicrosoftIcon from './MicrosoftIcon';
import GoogleIcon from './GoogleIcon';
import './AuthPages.scss';

const RegisterPage: React.FC = () => {
    const navigate = useNavigate();
    const { register } = useAuth();
    const { t } = useLang();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [ssoLoading, setSsoLoading] = useState<string | null>(null);
    const [transition] = useState(() => sessionStorage.getItem('zoom_transition') || '');
    const [zoomOut, setZoomOut] = useState<{ cx: number; cy: number } | null>(null);

    useEffect(() => {
        if (transition) sessionStorage.removeItem('zoom_transition');
    }, [transition]);

    const handleLogoClick = (e: React.MouseEvent) => {
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        setZoomOut({ cx: r.left + r.width / 2, cy: r.top + r.height / 2 });
        setTimeout(() => navigate('/'), 900);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (password.length < 8) { setError(t('passwordTooShort')); return; }
        if (password !== confirmPassword) { setError(t('passwordsNoMatch')); return; }
        setLoading(true);
        const result = await register(name, email, password);
        if (result.success) {
            navigate(`/verify?email=${encodeURIComponent(email)}`);
        } else {
            setError(result.message || t('registerFailed'));
        }
        setLoading(false);
    };

    const handleSsoLogin = async (provider: 'microsoft' | 'google') => {
        setSsoLoading(provider);
        setError('');
        const result = provider === 'microsoft'
            ? await authApi.microsoftLogin()
            : await authApi.googleLogin();
        if (result.success && result.data?.authorization_url) {
            window.location.href = result.data.authorization_url;
        } else {
            setError(result.message || t('ssoFailed'));
            setSsoLoading(null);
        }
    };

    const anim = transition ? 'auth-animated' : '';
    const variant = transition === 'white' ? 'auth-from-white' : '';

    return (
        <>
        {zoomOut && <div className="auth-zoom-bg" />}
        <div
            className={`auth-page auth-split-page ${anim} ${variant} ${zoomOut ? 'auth-zoom-out' : ''}`}
            style={zoomOut ? { '--zx': `${zoomOut.cx}px`, '--zy': `${zoomOut.cy}px` } as React.CSSProperties : undefined}
        >
            <div className="auth-panel">
                <a className="auth-panel__logo" onClick={handleLogoClick}>Invoice<span>Manager</span></a>
                <div className="auth-panel__form">
                    <h1>{t('registerTitle')}</h1>
                    <p className="auth-panel__subtitle">{t('registerSubtitle')}</p>
                    <form onSubmit={handleSubmit} className="auth-form">
                        {error && <div className="auth-error">{error}</div>}
                        <div className="form-group">
                            <label htmlFor="name">{t('nameLabel')}</label>
                            <input id="name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder={t('namePlaceholder')} required autoFocus />
                        </div>
                        <div className="form-group">
                            <label htmlFor="email">{t('emailLabel')}</label>
                            <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('emailPlaceholder')} required />
                        </div>
                        <div className="form-group">
                            <label htmlFor="password">{t('passwordLabel')}</label>
                            <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('passwordMinLength')} required minLength={8} />
                        </div>
                        <div className="form-group">
                            <label htmlFor="confirmPassword">{t('confirmPasswordLabel')}</label>
                            <input id="confirmPassword" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder={t('confirmPasswordPlaceholder')} required />
                        </div>
                        <button type="submit" className="auth-btn" disabled={loading}>
                            {loading ? t('registerLoading') : t('registerButton')}
                        </button>
                    </form>
                    <div className="auth-divider"><span>{t('orDivider')}</span></div>
                    <div className="auth-sso-buttons">
                        <button type="button" className="auth-btn-sso" onClick={() => handleSsoLogin('google')} disabled={!!ssoLoading}>
                            <GoogleIcon /> {ssoLoading === 'google' ? t('redirecting') : t('googleRegister')}
                        </button>
                        <button type="button" className="auth-btn-sso" onClick={() => handleSsoLogin('microsoft')} disabled={!!ssoLoading}>
                            <MicrosoftIcon /> {ssoLoading === 'microsoft' ? t('redirecting') : t('microsoftRegister')}
                        </button>
                    </div>
                    <div className="auth-footer">
                        <span>{t('hasAccount')} </span>
                        <Link to="/login">{t('signIn')}</Link>
                    </div>
                </div>
            </div>
            <AuthMarketingPanel />
        </div>
        </>
    );
};

export default RegisterPage;
