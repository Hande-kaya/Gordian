/**
 * RematchModal — shows existing matches with checkboxes.
 * User selects which to keep; unselected are deleted & re-matched.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { useLang } from '../../shared/i18n';
import { UnifiedTransaction, ReconciliationMatch } from '../../services/reconciliationApi';
import './RematchModal.scss';

interface RematchModalProps {
    transactions: UnifiedTransaction[];
    matching: boolean;
    onRematch: (preserveMatchIds: string[]) => void;
    onClose: () => void;
}

interface FlatMatch {
    matchId: string;
    txDate: string;
    txDesc: string;
    txAmount: number;
    txCurrency: string;
    docFilename: string;
    score: number;
    source: string;
}

function flattenMatches(transactions: UnifiedTransaction[]): FlatMatch[] {
    const result: FlatMatch[] = [];
    for (const tx of transactions) {
        for (const m of tx.matches || []) {
            result.push({
                matchId: m._id,
                txDate: tx.date || m.transaction_ref?.date || '',
                txDesc: tx.description || m.transaction_ref?.description || '',
                txAmount: tx.amount,
                txCurrency: tx.currency || 'TRY',
                docFilename: m.document_ref?.filename || '—',
                score: m.score?.final_score ?? m.score?.total_score ?? 0,
                source: m.source || (m.status === 'auto' ? 'auto' : 'manual'),
            });
        }
    }
    return result;
}

function formatAmount(amount: number, currency: string): string {
    try {
        return new Intl.NumberFormat('tr-TR', {
            style: 'currency', currency, minimumFractionDigits: 2,
        }).format(Math.abs(amount));
    } catch {
        return `${Math.abs(amount).toFixed(2)} ${currency}`;
    }
}

const RematchModal: React.FC<RematchModalProps> = ({
    transactions, matching, onRematch, onClose,
}) => {
    const { t } = useLang();

    const flatMatches = useMemo(() => flattenMatches(transactions), [transactions]);
    const allIds = useMemo(() => flatMatches.map(m => m.matchId), [flatMatches]);

    const [selected, setSelected] = useState<Set<string>>(() => new Set(allIds));

    const allSelected = selected.size === allIds.length;
    const selectedCount = selected.size;

    const handleToggle = useCallback((id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const handleToggleAll = useCallback(() => {
        setSelected(allSelected ? new Set() : new Set(allIds));
    }, [allSelected, allIds]);

    const handleRematch = useCallback(() => {
        onRematch(Array.from(selected));
    }, [onRematch, selected]);

    const scoreColor = (s: number) => {
        if (s >= 0.7) return '#16a34a';
        if (s >= 0.4) return '#d97706';
        return '#dc2626';
    };

    return (
        <div className="rematch-modal-overlay" onClick={onClose}>
            <div className="rematch-modal" onClick={e => e.stopPropagation()}>
                <div className="rematch-modal__header">
                    <h3>{t('rematchModalTitle')}</h3>
                    <button className="rematch-modal__close" onClick={onClose}>&times;</button>
                </div>

                <p className="rematch-modal__desc">{t('rematchModalDesc')}</p>

                {flatMatches.length > 0 && (
                    <div className="rematch-modal__toolbar">
                        <button
                            className="rematch-modal__toggle-btn"
                            onClick={handleToggleAll}
                        >
                            {allSelected ? t('rematchDeselectAll') : t('rematchSelectAll')}
                        </button>
                        <span className="rematch-modal__count">
                            <strong>{selectedCount}</strong> / {flatMatches.length} {t('rematchRunCount')}
                        </span>
                    </div>
                )}

                <div className="rematch-modal__list">
                    {flatMatches.length === 0 ? (
                        <div className="rematch-modal__empty">{t('rematchNoMatches')}</div>
                    ) : (
                        flatMatches.map(m => {
                            const checked = selected.has(m.matchId);
                            return (
                                <label
                                    key={m.matchId}
                                    className={`rematch-modal__item${checked ? '' : ' rematch-modal__item--unchecked'}`}
                                >
                                    <input
                                        type="checkbox"
                                        className="rematch-modal__checkbox"
                                        checked={checked}
                                        onChange={() => handleToggle(m.matchId)}
                                    />
                                    <div className="rematch-modal__item-content">
                                        <span className="rematch-modal__item-date">{m.txDate}</span>
                                        <span className="rematch-modal__item-desc" title={m.txDesc}>
                                            {m.txDesc}
                                        </span>
                                        <span className="rematch-modal__item-amount">
                                            {formatAmount(m.txAmount, m.txCurrency)}
                                        </span>
                                        <span className="rematch-modal__item-arrow">&rarr;</span>
                                        <span className="rematch-modal__item-doc" title={m.docFilename}>
                                            {m.docFilename}
                                        </span>
                                        <span
                                            className="rematch-modal__item-score"
                                            style={{ color: scoreColor(m.score) }}
                                        >
                                            {Math.round(m.score * 100)}%
                                        </span>
                                    </div>
                                    <span className={`rematch-modal__item-source rematch-modal__item-source--${m.source}`}>
                                        {m.source === 'manual' ? t('statusManual') : t('statusAuto')}
                                    </span>
                                </label>
                            );
                        })
                    )}
                </div>

                <div className="rematch-modal__footer">
                    <button className="rematch-modal__cancel-btn" onClick={onClose}>
                        {t('closeButton')}
                    </button>
                    <button
                        className="rematch-modal__run-btn"
                        onClick={handleRematch}
                        disabled={matching}
                    >
                        {matching ? (
                            <>
                                <span className="matching-panel__btn-spinner" />
                                {t('matchingInProgress')}
                            </>
                        ) : (
                            `${t('rematchRunButton')} (${selectedCount})`
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RematchModal;
