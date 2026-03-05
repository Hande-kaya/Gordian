/**
 * SampleExpense - Mock invoice detail overlay for tutorial.
 * Shows a realistic Turkish grocery receipt with OCR data.
 */

import React from 'react';
import { useLang } from '../../shared/i18n';
import './SampleExpense.scss';

const MOCK_ITEMS = [
    { name: 'Süt 1L', qty: 2, price: 34.90, amount: 69.80 },
    { name: 'Ekmek', qty: 1, price: 12.50, amount: 12.50 },
    { name: 'Beyaz Peynir 400g', qty: 1, price: 89.90, amount: 89.90 },
    { name: 'Domates 1kg', qty: 1, price: 42.90, amount: 42.90 },
    { name: 'Makarna 500g', qty: 2, price: 16.20, amount: 32.40 },
];

const SampleExpense: React.FC = () => {
    const { lang } = useLang();

    return (
        <div className="sample-expense" data-tutorial="sample-expense">
            <div className="sample-expense__card">
                <div className="sample-expense__header">
                    <div className="sample-expense__badge">
                        {lang === 'tr' ? 'Örnek Fatura' : 'Sample Invoice'}
                    </div>
                </div>

                <div className="sample-expense__section">
                    <h4 className="sample-expense__section-title">
                        {lang === 'tr' ? 'Tedarikçi' : 'Supplier'}
                    </h4>
                    <div className="sample-expense__fields">
                        <div className="sample-expense__field">
                            <span className="sample-expense__label">
                                {lang === 'tr' ? 'Ad' : 'Name'}
                            </span>
                            <span className="sample-expense__value">Migros T.A.Ş.</span>
                        </div>
                        <div className="sample-expense__field">
                            <span className="sample-expense__label">
                                {lang === 'tr' ? 'Tarih' : 'Date'}
                            </span>
                            <span className="sample-expense__value">15.02.2026</span>
                        </div>
                        <div className="sample-expense__field">
                            <span className="sample-expense__label">
                                {lang === 'tr' ? 'Fatura No' : 'Invoice No'}
                            </span>
                            <span className="sample-expense__value">MGS-2026-004821</span>
                        </div>
                    </div>
                </div>

                <div className="sample-expense__section">
                    <h4 className="sample-expense__section-title">
                        {lang === 'tr' ? 'Kalemler' : 'Line Items'}
                    </h4>
                    <table className="sample-expense__table">
                        <thead>
                            <tr>
                                <th>{lang === 'tr' ? 'Ürün' : 'Item'}</th>
                                <th>{lang === 'tr' ? 'Adet' : 'Qty'}</th>
                                <th>{lang === 'tr' ? 'Fiyat' : 'Price'}</th>
                                <th>{lang === 'tr' ? 'Tutar' : 'Amount'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {MOCK_ITEMS.map((item, i) => (
                                <tr key={i}>
                                    <td>{item.name}</td>
                                    <td>{item.qty}</td>
                                    <td>₺{item.price.toFixed(2)}</td>
                                    <td>₺{item.amount.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="sample-expense__totals">
                    <div className="sample-expense__total-row">
                        <span>{lang === 'tr' ? 'Ara Toplam' : 'Subtotal'}</span>
                        <span>₺247.50</span>
                    </div>
                    <div className="sample-expense__total-row">
                        <span>KDV (%10)</span>
                        <span>₺24.75</span>
                    </div>
                    <div className="sample-expense__total-row sample-expense__total-row--grand">
                        <span>{lang === 'tr' ? 'Toplam' : 'Total'}</span>
                        <span>₺272.25</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SampleExpense;
