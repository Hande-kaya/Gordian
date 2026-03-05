/**
 * Reset Password Page
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../../services/authApi';
import { useLang } from '../../shared/i18n';
import './AuthPages.scss';

const INITIAL_COOLDOWN = 30;

const ResetPasswordPage: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { t } = useLang();
    const emailParam = searchParams.get('email') || '';

    const [email, setEmail] = useState(emailParam);
    const [code, setCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const [resendSuccess, setResendSuccess] = useState(false);
    const [cooldown, setCooldown] = useState(INITIAL_COOLDOWN);
    const nextCooldownRef = useRef(INITIAL_COOLDOWN * 2);

    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setInterval(() => setCooldown(prev => prev - 1), 1000);
        return () => clearInterval(timer);
    }, [cooldown]);

    const formatCooldown = (s: number): string => {
        if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
        return `${s}s`;
    };

    const handleResend = useCallback(async () => {
        const target = email.trim().toLowerCase();
        if (!target) { setError(t('emailRequired') || 'Email is required'); return; }

        setResending(true);
        setResendSuccess(false);
        setError('');

        const result = await authApi.forgotPassword(target);
        if (result.success) {
            setResendSuccess(true);
            setCooldown(nextCooldownRef.current);
            nextCooldownRef.current = Math.min(nextCooldownRef.current * 2, 300);
            setTimeout(() => setResendSuccess(false), 3000);
        } else {
            setError(result.message || t('resendFailed'));
        }

        setResending(false);
    }, [email, t]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (newPassword.length < 8) {
            setError(t('resetPasswordTooShort'));
            return;
        }

        if (newPassword !== confirmPassword) {
            setError(t('resetPasswordsNoMatch'));
            return;
        }

        setLoading(true);

        const result = await authApi.resetPassword(email, code, newPassword);

        if (result.success) {
            navigate('/login', { state: { message: t('resetSuccess') } });
        } else {
            setError(result.message || t('resetFailed'));
        }

        setLoading(false);
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="auth-card__header">
                    <h1>{t('resetTitle')}</h1>
                    <p>{t('resetDescription')}</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {error && <div className="auth-error">{error}</div>}
                    {resendSuccess && <div className="auth-success">{t('resendSuccess')}</div>}

                    {!emailParam && (
                        <div className="form-group">
                            <label htmlFor="email">{t('emailLabel')}</label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                placeholder={t('emailPlaceholder')}
                                required
                            />
                        </div>
                    )}

                    <div className="form-group">
                        <label htmlFor="code">{t('resetCodeLabel')}</label>
                        <input
                            id="code"
                            type="text"
                            value={code}
                            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                            placeholder={t('resetCodePlaceholder')}
                            className="verify-code-input"
                            maxLength={8}
                            required
                            autoFocus
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="newPassword">{t('newPasswordLabel')}</label>
                        <input
                            id="newPassword"
                            type="password"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            placeholder={t('newPasswordPlaceholder')}
                            required
                            minLength={8}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="confirmPassword">{t('confirmNewPasswordLabel')}</label>
                        <input
                            id="confirmPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            placeholder={t('confirmNewPasswordPlaceholder')}
                            required
                        />
                    </div>

                    <button type="submit" className="auth-btn" disabled={loading || code.length !== 8}>
                        {loading ? t('resetLoading') : t('resetButton')}
                    </button>

                    <button
                        type="button"
                        className="auth-btn auth-btn--secondary"
                        onClick={handleResend}
                        disabled={resending || cooldown > 0}
                    >
                        {resending
                            ? t('resendLoading')
                            : cooldown > 0
                                ? `${t('resendCode')} (${formatCooldown(cooldown)})`
                                : t('resendCode')
                        }
                    </button>
                </form>

                <div className="auth-footer">
                    <Link to="/login">{t('backToLogin')}</Link>
                </div>
            </div>
        </div>
    );
};

export default ResetPasswordPage;
