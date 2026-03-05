/**
 * Verify Email Page - 6-digit code verification
 */

import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../services/authApi';
import { useLang } from '../../shared/i18n';
import './AuthPages.scss';

const EXPIRY_SECONDS = 600; // 10 minutes
const INITIAL_COOLDOWN = 30;

const VerifyEmailPage: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { checkSession } = useAuth();
    const { t } = useLang();

    const email = searchParams.get('email') || '';
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const [resendSuccess, setResendSuccess] = useState(false);
    const [countdown, setCountdown] = useState(EXPIRY_SECONDS);
    const [resendCooldown, setResendCooldown] = useState(INITIAL_COOLDOWN);
    const nextCooldownRef = useRef(INITIAL_COOLDOWN * 2);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!email) { navigate('/register'); return; }
        inputRef.current?.focus();
    }, [email, navigate]);

    useEffect(() => {
        if (countdown <= 0) return;
        const timer = setInterval(() => setCountdown(prev => prev - 1), 1000);
        return () => clearInterval(timer);
    }, [countdown]);

    useEffect(() => {
        if (resendCooldown <= 0) return;
        const timer = setInterval(() => setResendCooldown(prev => prev - 1), 1000);
        return () => clearInterval(timer);
    }, [resendCooldown]);

    const formatTime = (seconds: number): string => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const formatCooldown = (s: number): string => {
        if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
        return `${s}s`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const result = await authApi.verifyEmail(email, code);

        if (result.success) {
            // Cookie was set by backend — validate session
            const ok = await checkSession();
            if (ok) {
                navigate('/dashboard');
            } else {
                setError(t('verifySuccessLoginFailed'));
                setTimeout(() => navigate('/login'), 2000);
            }
        } else {
            setError(result.message || t('verifyFailed'));
        }

        setLoading(false);
    };

    const handleResend = async () => {
        setResending(true);
        setResendSuccess(false);
        setError('');

        const result = await authApi.resendVerification(email);
        if (result.success) {
            setResendSuccess(true);
            setCountdown(EXPIRY_SECONDS);
            setResendCooldown(nextCooldownRef.current);
            nextCooldownRef.current = Math.min(nextCooldownRef.current * 2, 300);
            setTimeout(() => setResendSuccess(false), 3000);
        } else {
            setError(result.message || t('resendFailed'));
        }

        setResending(false);
    };

    const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/\D/g, '').slice(0, 8);
        setCode(val);
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="auth-card__header">
                    <h1>{t('verifyTitle')}</h1>
                    <p>
                        {t('verifyDescription')} <strong>{email}</strong>
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {error && <div className="auth-error">{error}</div>}
                    {resendSuccess && <div className="auth-success">{t('resendSuccess')}</div>}

                    <div className="form-group">
                        <input
                            ref={inputRef}
                            type="text"
                            value={code}
                            onChange={handleCodeChange}
                            placeholder="00000000"
                            className="verify-code-input"
                            maxLength={8}
                            required
                        />
                    </div>

                    <div className="verify-timer">
                        {countdown > 0 ? (
                            <span>{t('codeExpiry')} {formatTime(countdown)}</span>
                        ) : (
                            <span className="expired">{t('codeExpired')}</span>
                        )}
                    </div>

                    <button type="submit" className="auth-btn" disabled={loading || code.length !== 8}>
                        {loading ? t('verifyLoading') : t('verifyButton')}
                    </button>

                    <button
                        type="button"
                        className="auth-btn auth-btn--secondary"
                        onClick={handleResend}
                        disabled={resending || resendCooldown > 0}
                    >
                        {resending
                            ? t('resendLoading')
                            : resendCooldown > 0
                                ? `${t('resendCode')} (${formatCooldown(resendCooldown)})`
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

export default VerifyEmailPage;
