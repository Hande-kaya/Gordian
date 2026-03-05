/**
 * Reconciliation Page
 * ====================
 * 4-panel layout: 3 upload panels (Expense, Bank Statement, Income)
 * + full-width matching panel below.
 * All data fetched via existing document API, matching is backend-driven.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Layout from '../../components/layout/Layout';
import { useLang } from '../../shared/i18n';
import documentApi, { DocumentItem } from '../../services/documentApi';
import { Transaction } from '../BankStatementDetail/TransactionsTable';
import BulkUploadModal from '../InvoiceList/BulkUploadModal';
import UploadPanel from './UploadPanel';
import MatchingPanel from './MatchingPanel';
import { EnrichedTransaction } from './matchingUtils';
import { ExpenseIcon, IncomeIcon, BankIcon } from '../../shared/icons/NavIcons';
import './Reconciliation.scss';

type UploadDocType = 'invoice' | 'bank-statement' | 'income';

const Reconciliation: React.FC = () => {
    const { t } = useLang();

    const [expenses, setExpenses] = useState<DocumentItem[]>([]);
    const [bankStatements, setBankStatements] = useState<DocumentItem[]>([]);
    const [incomes, setIncomes] = useState<DocumentItem[]>([]);
    const [loading, setLoading] = useState(true);

    // Upload modal
    const [uploadModalOpen, setUploadModalOpen] = useState(false);
    const [uploadDocType, setUploadDocType] = useState<UploadDocType>('invoice');
    const [droppedFiles, setDroppedFiles] = useState<File[] | undefined>(undefined);

    // Polling
    const pollingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mountedRef = useRef(true);

    const fetchAll = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [expRes, bsRes, incRes] = await Promise.all([
                documentApi.getDocuments(1, 100, 'invoice'),
                documentApi.getDocuments(1, 100, 'bank-statement'),
                documentApi.getDocuments(1, 100, 'income'),
            ]);
            if (expRes.success && expRes.data) setExpenses(expRes.data.documents);
            if (bsRes.success && bsRes.data) setBankStatements(bsRes.data.documents);
            if (incRes.success && incRes.data) setIncomes(incRes.data.documents);

            // Poll if any doc is still processing
            const allDocs = [
                ...(expRes.data?.documents || []),
                ...(bsRes.data?.documents || []),
                ...(incRes.data?.documents || []),
            ];
            const hasPending = allDocs.some(
                d => d.ocr_status === 'pending' || d.ocr_status === 'processing',
            );
            if (hasPending) {
                if (pollingTimer.current) clearTimeout(pollingTimer.current);
                pollingTimer.current = setTimeout(() => {
                    if (mountedRef.current) fetchAll(true);
                }, 4000);
            }
        } catch {
            // silent fail — panels show empty
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        fetchAll();
        return () => {
            mountedRef.current = false;
            if (pollingTimer.current) clearTimeout(pollingTimer.current);
        };
    }, [fetchAll]);

    // Extract bank transactions from all bank statements
    const bankTransactions: EnrichedTransaction[] = useMemo(() => {
        const txs: EnrichedTransaction[] = [];
        for (const bs of bankStatements) {
            if (bs.ocr_status !== 'completed') continue;
            const rawTxs: Transaction[] = bs.extracted_data?.transactions || [];
            const bankName = bs.extracted_data?.bank_name || bs.filename;
            for (const tx of rawTxs) {
                txs.push({ ...tx, statementId: bs.id, bankName });
            }
        }
        return txs;
    }, [bankStatements]);

    // Upload handlers
    const openUpload = useCallback((docType: UploadDocType, files?: File[]) => {
        setUploadDocType(docType);
        setDroppedFiles(files);
        setUploadModalOpen(true);
    }, []);

    const handleCancelProcessing = useCallback(async (docId: string) => {
        await documentApi.cancelProcessing(docId);
        fetchAll(true);
    }, [fetchAll]);

    const handleUploadComplete = useCallback(() => {
        setUploadModalOpen(false);
        setDroppedFiles(undefined);
        fetchAll();
    }, [fetchAll]);

    return (
        <Layout
            pageTitle={t('reconciliationTitle')}
            pageDescription={t('reconciliationDescription')}
        >
            <div className="reconciliation-page">
                {loading ? (
                    <div className="reconciliation-page__loading">
                        <div className="reconciliation-page__spinner" />
                    </div>
                ) : (
                    <>
                        {/* Top: Upload panels — bank (left) | expense+income (right) */}
                        <div className="upload-panels">
                            <UploadPanel
                                title={t('uploadStatements')}
                                icon={<BankIcon />}
                                docType="bank-statement"
                                documents={bankStatements}
                                onUploadClick={() => openUpload('bank-statement')}
                                onDrop={(files) => openUpload('bank-statement', files)}
                                onCancel={handleCancelProcessing}
                                compact
                            />
                            <div className="upload-panels__right">
                                <UploadPanel
                                    title={t('uploadExpenses')}
                                    icon={<ExpenseIcon />}
                                    docType="invoice"
                                    documents={expenses}
                                    onUploadClick={() => openUpload('invoice')}
                                    onDrop={(files) => openUpload('invoice', files)}
                                    onCancel={handleCancelProcessing}
                                    compact
                                />
                                <UploadPanel
                                    title={t('uploadIncome')}
                                    icon={<IncomeIcon />}
                                    docType="income"
                                    documents={incomes}
                                    onUploadClick={() => openUpload('income')}
                                    onDrop={(files) => openUpload('income', files)}
                                    onCancel={handleCancelProcessing}
                                    compact
                                />
                            </div>
                        </div>

                        {/* Bottom: Matching panel */}
                        <MatchingPanel
                            hasBankTransactions={bankTransactions.length > 0}
                            expenses={expenses.filter(d => d.ocr_status === 'completed')}
                            incomes={incomes.filter(d => d.ocr_status === 'completed')}
                            onMatchingComplete={() => fetchAll()}
                        />
                    </>
                )}
            </div>

            <BulkUploadModal
                isOpen={uploadModalOpen}
                onClose={() => { setUploadModalOpen(false); setDroppedFiles(undefined); }}
                onUploadComplete={handleUploadComplete}
                initialFiles={droppedFiles}
                docType={uploadDocType}
            />
        </Layout>
    );
};

export default Reconciliation;
