/**
 * Income List Page - B2C
 * ======================
 * Thin wrapper around InvoiceList with docType='income'.
 */

import React from 'react';
import InvoiceList from '../InvoiceList';

const IncomeList: React.FC = () => <InvoiceList docType="income" />;

export default IncomeList;
