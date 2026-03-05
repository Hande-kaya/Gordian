/**
 * Forgot Password Page
 */

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../../services/authApi';
import { useLang } from '../../shared/i18n';
import './AuthPages.scss';

const ForgotPasswordPage: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useLang();
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const result = await authApi.forgotPassword(email);

        if (result.success) {
            setSent(true);
        } else {
            setError(result.message || t('sendFailed'));
        }

        setLoading(false);
    };

    if (sent) {
        return (
            <div className="auth-page">
                <div className="auth-card">
                    <div className="auth-card__header">
                        <h1>{t('emailSentTitle')}</h1>
                        <p>
                            {t('emailSentDescription').replace('{email}', email)}
                        </p>
                    </div>
                    <div className="auth-form">
                        <button
                            className="auth-btn"
                            onClick={() => navigate(`/reset-password?email=${encodeURIComponent(email)}`)}
                        >
                            {t('enterCode')}
                        </button>
                    </div>
                    <div className="auth-footer">
                        <Link to="/login">{t('backToLogin')}</Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="auth-card__header">
                    <h1>{t('forgotTitle')}</h1>
                    <p>{t('forgotDescription')}</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {error && <div className="auth-error">{error}</div>}

                    <div className="form-group">
                        <label htmlFor="email">{t('emailLabel')}</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder={t('emailPlaceholder')}
                            required
                            autoFocus
                        />
                    </div>

                    <button type="submit" className="auth-btn" disabled={loading}>
                        {loading ? t('sendingCode') : t('sendCode')}
                    </button>
                </form>

                <div className="auth-footer">
                    <Link to="/login">{t('backToLogin')}</Link>
                </div>
            </div>
        </div>
    );
};

export default ForgotPasswordPage;
