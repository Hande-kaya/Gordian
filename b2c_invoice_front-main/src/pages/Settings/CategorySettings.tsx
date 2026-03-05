/**
 * CategorySettings - Manage per-user expense categories.
 *
 * Read-only table by default. Edit toggles big spacious inputs.
 * Import modal to paste multiple categories at once.
 * Reset button always in toolbar, enabled only when customized.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useLang } from '../../shared/i18n';
import { useCategories } from '../../context/CategoryContext';
import { updateExpenseCategories, resetExpenseCategories, ExpenseCategory } from '../../services/documentApi';
import { useUnsavedChanges } from '../../shared/hooks/useUnsavedChanges';
import ConfirmModal from '../../components/common/ConfirmModal';
import './CategorySettings.scss';

type MsgState = { type: 'success' | 'error'; text: string } | null;

const generateKey = (enLabel: string): string =>
    enLabel.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '_').slice(0, 40) || 'new_category';

const CategorySettings: React.FC = () => {
    const { t, lang } = useLang();
    const { categories: savedCategories, isDefault, refresh } = useCategories();

    const [localCats, setLocalCats] = useState<ExpenseCategory[]>(() => [...savedCategories]);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<MsgState>(null);
    const [resetConfirm, setResetConfirm] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [importText, setImportText] = useState('');

    // Sync from context when savedCategories changes
    const savedJson = JSON.stringify(savedCategories);
    const [prevSavedJson, setPrevSavedJson] = useState(savedJson);
    if (savedJson !== prevSavedJson) {
        setPrevSavedJson(savedJson);
        setLocalCats([...savedCategories]);
    }

    const hasChanges = useMemo(
        () => JSON.stringify(localCats) !== JSON.stringify(savedCategories),
        [localCats, savedCategories],
    );

    const { isBlocked, confirmLeave, cancelLeave } = useUnsavedChanges(isEditing && hasChanges);

    const langKey = lang as 'tr' | 'en' | 'de';

    const handleLabelChange = useCallback((idx: number, value: string) => {
        setLocalCats(prev => prev.map((c, i) => i !== idx ? c : { ...c, labels: { ...c.labels, [langKey]: value } }));
    }, [langKey]);

    const handleDescChange = useCallback((idx: number, value: string) => {
        setLocalCats(prev => prev.map((c, i) => i !== idx ? c : { ...c, description: value }));
    }, []);

    const handleDelete = useCallback((idx: number) => {
        setLocalCats(prev => prev.filter((_, i) => i !== idx));
    }, []);

    const handleAddRow = useCallback(() => {
        const base = 'new_category';
        let key = base;
        let n = 1;
        const existing = new Set(localCats.map(c => c.key));
        while (existing.has(key)) key = `${base}_${n++}`;
        setLocalCats(prev => [...prev, { key, labels: { en: '', tr: '', de: '' }, description: '' }]);
    }, [localCats]);

    const handleImportAdd = useCallback(() => {
        const lines = importText.split('\n').map(l => l.trim()).filter(Boolean);
        if (!lines.length) return;
        const existing = new Set(localCats.map(c => c.key));
        const newCats: ExpenseCategory[] = [];
        for (const line of lines) {
            const sep = line.includes('|') ? '|' : line.includes('=') ? '=' : null;
            const [name, desc] = sep ? line.split(sep).map(s => s.trim()) : [line.trim(), ''];
            if (!name) continue;
            let key = generateKey(name);
            let n = 1;
            while (existing.has(key)) key = `${key}_${n++}`;
            existing.add(key);
            newCats.push({ key, labels: { ...{ en: '', tr: '', de: '' }, [langKey]: name }, description: desc || '' });
        }
        setLocalCats(prev => [...prev, ...newCats]);
        setImportText('');
        setShowImport(false);
    }, [importText, localCats, langKey]);

    const handleEdit = useCallback(() => { setIsEditing(true); setMsg(null); }, []);

    const handleCancel = useCallback(() => {
        setIsEditing(false);
        setLocalCats([...savedCategories]);
        setMsg(null);
        setResetConfirm(false);
        setShowImport(false);
    }, [savedCategories]);

    const handleSave = useCallback(async () => {
        const withKeys = localCats.map(c => {
            const en = c.labels.en.trim();
            if (en && c.key.startsWith('new_category')) return { ...c, key: generateKey(en) };
            return c;
        });
        for (let i = 0; i < withKeys.length; i++) {
            if (!withKeys[i].labels.en.trim()) {
                setMsg({ type: 'error', text: `${t('catLabelEn')} — row ${i + 1}` });
                return;
            }
        }
        const keys = new Set<string>();
        for (const c of withKeys) {
            if (keys.has(c.key)) { setMsg({ type: 'error', text: t('catKeyDuplicate') + `: ${c.key}` }); return; }
            keys.add(c.key);
        }
        setSaving(true); setMsg(null);
        try {
            const res = await updateExpenseCategories(withKeys);
            if (res.success) { setMsg({ type: 'success', text: t('catSaved') }); setIsEditing(false); await refresh(); }
            else setMsg({ type: 'error', text: res.message || t('catError') });
        } catch { setMsg({ type: 'error', text: t('catError') }); }
        finally { setSaving(false); }
    }, [localCats, refresh, t]);

    const handleReset = useCallback(async () => {
        setResetConfirm(false); setSaving(true); setMsg(null);
        try {
            const res = await resetExpenseCategories();
            if (res.success) { setMsg({ type: 'success', text: t('catResetDone') }); setIsEditing(false); await refresh(); }
            else setMsg({ type: 'error', text: t('catError') });
        } catch { setMsg({ type: 'error', text: t('catError') }); }
        finally { setSaving(false); }
    }, [refresh, t]);

    return (
        <div className={`cat-settings${isEditing ? ' cat-settings--editing' : ''}`}>
            <div className="settings__card">
                {/* Header + Toolbar */}
                <div className="cat-settings__header">
                    <div>
                        <h3 className="settings__card-title">{t('catTitle')}</h3>
                        <p className="settings__card-desc">{t('catDescription')}</p>
                    </div>
                    <div className="cat-settings__toolbar">
                        {!isEditing ? (
                            <>
                                <button className="action-button" onClick={handleEdit}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                    {t('catEdit')}
                                </button>
                                {resetConfirm ? (
                                    <>
                                        <button className="action-button action-button--danger" onClick={handleReset} disabled={saving}>
                                            {t('catResetBtn')}
                                        </button>
                                        <button className="action-button" onClick={() => setResetConfirm(false)}>
                                            {t('catCancelBtn')}
                                        </button>
                                    </>
                                ) : (
                                    <button className="action-button" onClick={() => setResetConfirm(true)} disabled={isDefault}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 105.64-11.36L1 10" />
                                        </svg>
                                        {t('catResetBtn')}
                                    </button>
                                )}
                            </>
                        ) : (
                            <>
                                <button className="action-button action-button-primary" onClick={handleSave} disabled={saving || !hasChanges}>
                                    {saving ? t('catSaving') : t('catSave')}
                                </button>
                                <button className="action-button" onClick={handleCancel}>{t('catCancelBtn')}</button>
                            </>
                        )}
                    </div>
                </div>

                {/* Table */}
                <div className="cat-settings__table-wrap">
                    <table className="cat-settings__table">
                        <thead>
                            <tr>
                                <th>{t('catColLabel')}</th>
                                <th>{t('catColDesc')}</th>
                                {isEditing && <th className="cat-settings__th--action"></th>}
                            </tr>
                        </thead>
                        <tbody>
                            {localCats.map((cat, idx) => (
                                <tr key={`${cat.key}-${idx}`}>
                                    <td>
                                        {isEditing ? (
                                            <input
                                                className="cat-settings__input"
                                                value={cat.labels[langKey] || ''}
                                                onChange={e => handleLabelChange(idx, e.target.value)}
                                                placeholder={cat.labels.en || t('catLabelPlaceholder')}
                                            />
                                        ) : (
                                            <span className="cat-settings__label">{cat.labels[langKey] || cat.labels.en || cat.key}</span>
                                        )}
                                    </td>
                                    <td>
                                        {isEditing ? (
                                            <input
                                                className="cat-settings__input"
                                                value={cat.description}
                                                onChange={e => handleDescChange(idx, e.target.value)}
                                                placeholder={t('catDescPlaceholder')}
                                            />
                                        ) : (
                                            <span className="cat-settings__desc">{cat.description || '—'}</span>
                                        )}
                                    </td>
                                    {isEditing && (
                                        <td className="cat-settings__td--action">
                                            <button className="cat-settings__delete-btn" onClick={() => handleDelete(idx)} title={t('catDelete')}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                                </svg>
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Edit-mode actions */}
                {isEditing && (
                    <div className="cat-settings__actions">
                        <button className="cat-settings__action-btn" onClick={handleAddRow}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            {t('catAddRow')}
                        </button>
                        <button className="cat-settings__action-btn" onClick={() => setShowImport(true)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                            {t('catImport')}
                        </button>
                    </div>
                )}

                {/* Message */}
                {msg && <div className={`settings__message settings__message--${msg.type}`} style={{ marginTop: 16 }}>{msg.text}</div>}
            </div>

            {/* Unsaved changes navigation guard */}
            <ConfirmModal
                isOpen={isBlocked}
                title={t('unsavedTitle')}
                message={t('unsavedMessage')}
                confirmLabel={t('unsavedLeave')}
                cancelLabel={t('unsavedStay')}
                variant="danger"
                onConfirm={confirmLeave}
                onCancel={cancelLeave}
            />

            {/* Import modal */}
            {showImport && (
                <div className="cat-settings__modal-overlay" onClick={() => setShowImport(false)}>
                    <div className="cat-settings__modal" onClick={e => e.stopPropagation()}>
                        <button className="cat-settings__modal-close" onClick={() => setShowImport(false)}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                        <h3 className="cat-settings__modal-title">{t('catImportTitle')}</h3>
                        <p className="cat-settings__modal-desc">{t('catImportDesc')}</p>
                        <textarea
                            className="cat-settings__modal-textarea"
                            value={importText}
                            onChange={e => setImportText(e.target.value)}
                            placeholder={t('catImportPlaceholder')}
                            rows={8}
                            autoFocus
                        />
                        <div className="cat-settings__modal-actions">
                            <button className="cat-settings__modal-btn-primary" onClick={handleImportAdd} disabled={!importText.trim()}>
                                {t('catImportBtn')}
                            </button>
                            <button className="cat-settings__modal-btn" onClick={() => setShowImport(false)}>
                                {t('catCancelBtn')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CategorySettings;
