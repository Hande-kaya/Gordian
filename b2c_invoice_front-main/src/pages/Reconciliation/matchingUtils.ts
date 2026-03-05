/**
 * Matching Utilities — type definitions only.
 * All scoring/matching logic moved to backend.
 */

import { Transaction } from '../BankStatementDetail/TransactionsTable';

export interface EnrichedTransaction extends Transaction {
    statementId: string;
    bankName: string;
}
