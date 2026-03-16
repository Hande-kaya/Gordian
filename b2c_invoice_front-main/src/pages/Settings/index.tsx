/**
 * Settings Page - B2C
 * ====================
 * Claude.ai-style sidebar tabs: Profile, Security, Language, Subscription, Account.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { useLang } from '../../shared/i18n';
import { useAuth } from '../../context/AuthContext';
import { useTheme, Theme } from '../../context/ThemeContext';
import { useDateFormat, DateFormat } from '../../context/DateFormatContext';
import { authApi } from '../../services/authApi';
import { guardNavigation } from '../../shared/hooks/useUnsavedChanges';
import CategorySettings from './CategorySettings';
import SubscriptionTab from './SubscriptionTab';
import UsageTab from './UsageTab';
import { TAB_ICONS } from './tabIcons';
import ConfirmModal from '../../components/common/ConfirmModal';
import './Settings.scss';

type MsgState = { type: 'success' | 'error'; text: string } | null;
const hasPasswordFlag = (u: any): boolean => u?.has_password !== undefined ? !!u.has_password : true;
const isValidEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(value);
type TabId = 'profile' | 'security' | 'display' | 'categories' | 'subscription' | 'usage' | 'account';
const TABS: TabId[] = ['profile', 'security', 'display', 'categories', 'subscription', 'usage', 'account'];

const Settings: React.FC = () => {
    const navigate = useNavigate();
    const { t, lang, setLang } = useLang();
    const { user, refreshSession, logout } = useAuth();
    const { theme, setTheme } = useTheme();
    const { dateFormat, setDateFormat, fmtDate } = useDateFormat();

    const [activeTab, setActiveTab] = useState<TabId>(() => {
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('tab') as TabId;
        return tab && TABS.includes(tab) ? tab : 'profile';
    });
    const [usageRefreshKey, setUsageRefreshKey] = useState(0);
    const [paymentMsg, setPaymentMsg] = useState<MsgState>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const payment = params.get('payment');
        if (payment === 'success') {
            setPaymentMsg({ type: 'success', text: t('paymentSuccess') });
            setUsageRefreshKey(k => k + 1);
        } else if (payment === 'cancelled') {
            setPaymentMsg({ type: 'error', text: t('paymentCancelled') });
        }
        if (payment) {
            const url = new URL(window.location.href);
            url.searchParams.delete('payment');
            window.history.replaceState({}, '', url.toString());
        }
    }, [t]);

    // Profile form
    const [name, setName] = useState(user?.name || '');
    const [email, setEmail] = useState(user?.email || '');
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileMsg, setProfileMsg] = useState<MsgState>(null);

    // Profile photo
    const [photoPreview, setPhotoPreview] = useState<string | null>(user?.profile_photo || null);
    const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
    const [photoSaving, setPhotoSaving] = useState(false);
    const [photoMsg, setPhotoMsg] = useState<MsgState>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Password form
    const [currentPw, setCurrentPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [pwSaving, setPwSaving] = useState(false);
    const [pwMsg, setPwMsg] = useState<MsgState>(null);

    // Delete account
    const [deleteConfirm, setDeleteConfirm] = useState(false);
    const [deleteInput, setDeleteInput] = useState('');
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteFinal, setDeleteFinal] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    const tabLabelKey: Record<TabId, string> = {
        profile: 'tabProfile', security: 'tabSecurity', display: 'tabDisplay',
        categories: 'tabCategories', subscription: 'tabSubscription',
        usage: 'tabUsage', account: 'tabAccount',
    };

    const handleProfileSave = useCallback(async () => {
        setProfileMsg(null);
        setPhotoMsg(null);
        setProfileSaving(true);
        try {
            if (pendingPhoto === '__remove__') {
                await authApi.removeProfilePhoto();
                setPendingPhoto(null);
            } else if (pendingPhoto) {
                const photoRes = await authApi.uploadProfilePhoto(pendingPhoto);
                if (!photoRes.success) {
                    setPhotoMsg({ type: 'error', text: photoRes.message || t('photoError') });
                }
                setPendingPhoto(null);
            }
            const updates: { name?: string } = {};
            if (name.trim() && name.trim() !== user?.name) updates.name = name.trim();
            if (Object.keys(updates).length) {
                const res = await authApi.updateProfile(updates);
                if (!res.success) {
                    setProfileMsg({ type: 'error', text: res.message || t('profileError') });
                    return;
                }
            }
            await refreshSession();
            setProfileMsg({ type: 'success', text: t('profileSuccess') });
        } catch {
            setProfileMsg({ type: 'error', text: t('profileError') });
        } finally {
            setProfileSaving(false);
        }
    }, [name, email, user, pendingPhoto, refreshSession, t]);

    const handlePhotoSelect = useCallback(async (file: File) => {
        if (file.size > 5 * 1024 * 1024) {
            setPhotoMsg({ type: 'error', text: t('photoTooLarge') });
            return;
        }
        setPhotoMsg(null);
        try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = 200; canvas.height = 200;
                        const ctx = canvas.getContext('2d')!;
                        const size = Math.min(img.width, img.height);
                        const sx = (img.width - size) / 2;
                        const sy = (img.height - size) / 2;
                        ctx.drawImage(img, sx, sy, size, size, 0, 0, 200, 200);
                        resolve(canvas.toDataURL('image/jpeg', 0.85));
                    };
                    img.onerror = reject;
                    img.src = reader.result as string;
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            setPhotoPreview(dataUrl);
            setPendingPhoto(dataUrl);
        } catch {
            setPhotoMsg({ type: 'error', text: t('photoError') });
        }
    }, [t]);

    const handleRemovePhoto = useCallback(() => {
        setPhotoPreview(null);
        setPendingPhoto('__remove__');
        setPhotoMsg(null);
    }, []);

    const userHasPassword = hasPasswordFlag(user);

    const handlePasswordChange = useCallback(async () => {
        setPwMsg(null);
        if (newPw.length < 8) { setPwMsg({ type: 'error', text: t('passwordTooShort') }); return; }
        if (newPw !== confirmPw) { setPwMsg({ type: 'error', text: t('passwordMismatch') }); return; }
        setPwSaving(true);
        try {
            const res = userHasPassword
                ? await authApi.changePassword(currentPw, newPw)
                : await authApi.setPassword(newPw);
            if (res.success) {
                setPwMsg({ type: 'success', text: userHasPassword ? t('passwordSuccess') : t('setPasswordSuccess') });
                setCurrentPw(''); setNewPw(''); setConfirmPw('');
                await refreshSession();
            } else {
                const msg = res.message?.includes('incorrect') ? t('passwordWrong') : res.message || t('passwordError');
                setPwMsg({ type: 'error', text: msg });
            }
        } catch {
            setPwMsg({ type: 'error', text: t('passwordError') });
        } finally {
            setPwSaving(false);
        }
    }, [currentPw, newPw, confirmPw, userHasPassword, refreshSession, t]);

    const handleDeleteAccount = useCallback(async () => {
        setDeleteError('');
        setDeleteLoading(true);
        try {
            const res = await authApi.deleteAccount();
            if (res.success) {
                localStorage.removeItem('access_token');
                await logout();
                navigate('/login', { replace: true });
            } else {
                setDeleteError(res.message || t('deleteAccountError'));
            }
        } catch {
            setDeleteError(t('deleteAccountError'));
        } finally {
            setDeleteLoading(false);
        }
    }, [logout, navigate, t]);

    const handleCancelDelete = useCallback(() => {
        setDeleteConfirm(false);
        setDeleteInput('');
        setDeleteError('');
    }, []);

    const profileChanged = name.trim() !== (user?.name || '') || email.trim() !== (user?.email || '') || !!pendingPhoto;
    const pwReady = userHasPassword
        ? (currentPw.length > 0 && newPw.length >= 8 && confirmPw.length > 0)
        : (newPw.length >= 8 && confirmPw.length > 0);
    const initials = (user?.name || 'U').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

    const renderContent = () => {
        switch (activeTab) {
            case 'profile':
                return (
                    <div className="settings__card">
                        <h3 className="settings__card-title">{t('profileSection')}</h3>
                        <div className="settings__photo-row">
                            <div className="settings__avatar" onClick={() => fileInputRef.current?.click()}>
                                {photoPreview
                                    ? <img src={photoPreview} alt="avatar" className="settings__avatar-img" />
                                    : <span className="settings__avatar-initials">{initials}</span>
                                }
                                <div className="settings__avatar-overlay">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                        <circle cx="12" cy="13" r="4" />
                                    </svg>
                                </div>
                                {photoSaving && <div className="settings__avatar-spinner" />}
                            </div>
                            <input ref={fileInputRef} type="file" accept="image/*" hidden
                                onChange={e => { if (e.target.files?.[0]) handlePhotoSelect(e.target.files[0]); e.target.value = ''; }} />
                            <div className="settings__photo-actions">
                                <button className="settings__link-btn" onClick={() => fileInputRef.current?.click()}>{t('uploadPhoto')}</button>
                                {photoPreview && <button className="settings__link-btn settings__link-btn--danger" onClick={handleRemovePhoto}>{t('removePhoto')}</button>}
                            </div>
                        </div>
                        {photoMsg && <div className={`settings__message settings__message--${photoMsg.type}`}>{photoMsg.text}</div>}
                        <div className="settings__form">
                            <div className="settings__field">
                                <label className="settings__label">{t('profileName')}</label>
                                <input className="settings__input" value={name} onChange={e => setName(e.target.value)} />
                            </div>
                            <div className="settings__field">
                                <label className="settings__label">{t('profileEmail')}</label>
                                <input className="settings__input" type="email" value={email} readOnly disabled />
                            </div>
                            {profileMsg && <div className={`settings__message settings__message--${profileMsg.type}`}>{profileMsg.text}</div>}
                            <button className="settings__btn settings__btn--primary" onClick={handleProfileSave} disabled={profileSaving || !profileChanged}>
                                {profileSaving ? t('profileSaving') : t('profileSave')}
                            </button>
                        </div>
                    </div>
                );
            case 'security':
                return (
                    <div className="settings__card">
                        <h3 className="settings__card-title">{userHasPassword ? t('passwordSection') : t('setPasswordSection')}</h3>
                        <p className="settings__card-desc">{userHasPassword ? t('passwordDescription') : t('setPasswordDesc')}</p>
                        <div className="settings__form">
                            {userHasPassword && (
                                <div className="settings__field">
                                    <label className="settings__label">{t('currentPassword')}</label>
                                    <input className="settings__input" type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
                                </div>
                            )}
                            <div className="settings__field">
                                <label className="settings__label">{t('newPassword')}</label>
                                <input className="settings__input" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} />
                            </div>
                            <div className="settings__field">
                                <label className="settings__label">{t('confirmPassword')}</label>
                                <input className="settings__input" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
                            </div>
                            {pwMsg && <div className={`settings__message settings__message--${pwMsg.type}`}>{pwMsg.text}</div>}
                            <button className="settings__btn settings__btn--primary" onClick={handlePasswordChange} disabled={pwSaving || !pwReady}>
                                {pwSaving
                                    ? (userHasPassword ? t('changingPassword') : t('settingPassword'))
                                    : (userHasPassword ? t('changePassword') : t('setPasswordButton'))
                                }
                            </button>
                        </div>
                    </div>
                );
            case 'display': {
                const themeOptions: { value: Theme; label: string; desc: string; icon: JSX.Element }[] = [
                    {
                        value: 'light', label: t('themeLight'), desc: t('themeLightDesc'),
                        icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>,
                    },
                    {
                        value: 'dark', label: t('themeDark'), desc: t('themeDarkDesc'),
                        icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>,
                    },
                    {
                        value: 'system', label: t('themeSystem'), desc: t('themeSystemDesc'),
                        icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>,
                    },
                ];
                const handleThemeChange = (value: Theme) => {
                    setTheme(value);
                    authApi.updatePreferences({ theme: value });
                };
                return (
                    <div className="settings__card">
                        <h3 className="settings__card-title">{t('themeSection')}</h3>
                        <p className="settings__card-desc">{t('themeDescription')}</p>
                        <div className="settings__theme-options">
                            {themeOptions.map(opt => (
                                <button key={opt.value}
                                    className={`settings__theme-btn ${theme === opt.value ? 'settings__theme-btn--active' : ''}`}
                                    onClick={() => handleThemeChange(opt.value)}>
                                    <span className="settings__theme-icon">{opt.icon}</span>
                                    <span className="settings__theme-label">{opt.label}</span>
                                    <span className="settings__theme-desc">{opt.desc}</span>
                                </button>
                            ))}
                        </div>
                        <h3 className="settings__card-title" style={{ marginTop: 28 }}>{t('languageSection')}</h3>
                        <p className="settings__card-desc">{t('languageDescription')}</p>
                        <div className="settings__lang-options">
                            <button className={`settings__lang-btn ${lang === 'en' ? 'settings__lang-btn--active' : ''}`} onClick={() => setLang('en')}>
                                <span className="settings__lang-flag">EN</span>{t('languageEnglish')}
                            </button>
                            <button className={`settings__lang-btn ${lang === 'de' ? 'settings__lang-btn--active' : ''}`} onClick={() => setLang('de')}>
                                <span className="settings__lang-flag">DE</span>{t('languageGerman')}
                            </button>
                            <button className={`settings__lang-btn ${lang === 'tr' ? 'settings__lang-btn--active' : ''}`} onClick={() => setLang('tr')}>
                                <span className="settings__lang-flag">TR</span>{t('languageTurkish')}
                            </button>
                        </div>
                        <h3 className="settings__card-title" style={{ marginTop: 28 }}>{t('dateFormatSection')}</h3>
                        <p className="settings__card-desc">{t('dateFormatDescription')}</p>
                        <div className="settings__date-format-options">
                            {([
                                { value: 'eu' as DateFormat, label: 'EU', example: '15.03.2024' },
                                { value: 'us' as DateFormat, label: 'US', example: '03/15/2024' },
                                { value: 'iso' as DateFormat, label: 'ISO', example: '2024-03-15' },
                                { value: 'short' as DateFormat, label: 'Short', example: '15 Mar 2024' },
                            ]).map(opt => (
                                <button
                                    key={opt.value}
                                    className={`settings__date-format-btn ${dateFormat === opt.value ? 'settings__date-format-btn--active' : ''}`}
                                    onClick={() => {
                                        setDateFormat(opt.value);
                                        authApi.updatePreferences({ date_format: opt.value });
                                    }}
                                >
                                    <span className="settings__lang-flag">{opt.label}</span>
                                    {opt.example}
                                </button>
                            ))}
                        </div>
                    </div>
                );
            }
            case 'categories':
                return <CategorySettings />;
            case 'subscription':
                return (
                    <div className="settings__content--subscription">
                        {paymentMsg && <div className={`settings__message settings__message--${paymentMsg.type}`} style={{ marginBottom: 16 }}>{paymentMsg.text}</div>}
                        <SubscriptionTab refreshKey={usageRefreshKey} />
                    </div>
                );
            case 'usage':
                return <UsageTab refreshKey={usageRefreshKey} />;
            case 'account':
                return (
                    <>
                        <div className="settings__card">
                            <h3 className="settings__card-title">{t('accountSection')}</h3>
                            <div className="settings__info-grid">
                                <div className="settings__info-item">
                                    <span className="settings__info-label">{t('accountType')}</span>
                                    <span className="settings__info-value">{t('accountTypeB2C')}</span>
                                </div>
                                <div className="settings__info-item">
                                    <span className="settings__info-label">{t('memberId')}</span>
                                    <span className="settings__info-value">{user?.user_id || '-'}</span>
                                </div>
                            </div>
                        </div>
                        <div className="settings__card settings__card--danger" style={{ marginTop: 20 }}>
                            <h3 className="settings__card-title">{t('deleteAccountTitle')}</h3>
                            <p className="settings__card-desc">{t('deleteAccountWarning')}</p>
                            {!deleteConfirm ? (
                                <button className="settings__btn settings__btn--danger" onClick={() => setDeleteConfirm(true)}>
                                    {t('deleteAccountBtn')}
                                </button>
                            ) : (
                                <div className="settings__delete-confirm">
                                    <p className="settings__delete-hint">{t('deleteAccountTypeHint')}</p>
                                    <input
                                        className="settings__input"
                                        value={deleteInput}
                                        onChange={e => setDeleteInput(e.target.value)}
                                        placeholder={t('deleteAccountTypePlaceholder')}
                                        autoFocus
                                    />
                                    {deleteError && <div className="settings__message settings__message--error">{deleteError}</div>}
                                    <div className="settings__delete-actions">
                                        <button
                                            className="settings__btn settings__btn--danger"
                                            onClick={() => setDeleteFinal(true)}
                                            disabled={deleteInput !== 'delete' || deleteLoading}
                                        >
                                            {t('deleteAccountConfirm')}
                                        </button>
                                        <button
                                            className="settings__btn"
                                            onClick={handleCancelDelete}
                                            disabled={deleteLoading}
                                        >
                                            {t('deleteAccountCancel')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <ConfirmModal
                            isOpen={deleteFinal}
                            title={t('deleteAccountTitle')}
                            message={t('deleteAccountFinalMessage')}
                            confirmLabel={t('deleteAccountFinalConfirm')}
                            cancelLabel={t('deleteAccountCancel')}
                            variant="danger"
                            onConfirm={() => { setDeleteFinal(false); handleDeleteAccount(); }}
                            onCancel={() => setDeleteFinal(false)}
                        />
                    </>
                );
        }
    };

    return (
        <Layout pageTitle={t('settingsTitle')} pageDescription={t('settingsDescription')}>
            <div className="settings">
                <nav className="settings__sidebar">
                    {TABS.map(tab => (
                        <button
                            key={tab}
                            className={`settings__tab ${activeTab === tab ? 'settings__tab--active' : ''}`}
                            onClick={() => {
                                if (activeTab === tab) return;
                                if (!guardNavigation(() => setActiveTab(tab))) setActiveTab(tab);
                            }}
                        >
                            {TAB_ICONS[tab]}
                            <span>{t(tabLabelKey[tab])}</span>
                        </button>
                    ))}
                </nav>
                <div className="settings__content">
                    {renderContent()}
                </div>
            </div>
        </Layout>
    );
};

export default Settings;