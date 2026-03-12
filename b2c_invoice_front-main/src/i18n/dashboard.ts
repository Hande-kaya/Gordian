/**
 * Dashboard Translations
 * ======================
 * Stats, charts, period selector, quick actions
 */

import { Translations } from '../shared/i18n';

export const dashboardTranslations: Translations = {
    tr: {
        // Page
        dashboardTitle: 'Dashboard',
        dashboardDescription: 'Gider ve Gelir Analitikleri',

        // Stats
        totalExpenses: 'Toplam Harcama',
        matched: 'Eşleşen',
        discrepancies: 'Uyuşmazlık',
        pendingReview: 'İnceleme Bekleyen',

        // Period selector
        periodAll: 'Tümü',
        period1W: '1H',
        period1M: '1A',
        period3M: '3A',
        period1Y: '1Y',
        periodFrom: 'Başlangıç',
        periodTo: 'Bitiş',

        // Charts
        totalSpending: 'Toplam Harcama',
        spendingByCategory: 'Kategoriye Göre Harcama',
        loadingData: 'Yükleniyor...',
        noCategoryData: 'Bu dönem için kategori verisi yok',
        pieAmountCol: 'Tutar',
        pieShareCol: 'Pay',
        pieTotal: 'Toplam',

        // Quick actions
        quickActions: 'Hızlı İşlemler',
        expensesAction: 'Harcamalar',
        expensesActionDesc: 'Harcama listesini görüntüle ve yönet',

        // Chart filters
        showValuesIn: 'Gösterilen para birimi:',
        transactionCurrency: 'İşlem para birimi:',
        dateRanges: 'Tarih aralığı:',
        chartFilters: 'Filtrele',
        filterCurrency: 'Para Birimi',
        filterCategory: 'Kategori',
        selectAll: 'Hepsini Sec',
        deselectAll: 'Temizle',

        // Nav
        navDashboard: 'Dashboard',
        navExpenses: 'Harcamalar',
        navBankStatements: 'Banka Ekstreleri',

        dashboardExpenses: 'Giderler',
        dashboardIncome: 'Gelirler',
        dashboardInvoices: 'Faturalar',
        totalIncome: 'Toplam Gelir',

        // Bank dashboard
        bankTotalDebits: 'Toplam Çıkış (Borç)',
        bankTotalCredits: 'Toplam Giriş (Alacak)',
        bankByBank: 'Banka Bazlı Dağılım',
        bankMatchStatus: 'Eşleşme Durumu',
        bankMatched: 'Eşleşen',
        bankUnmatched: 'Eşleşmeyen',
        bankTotalTransactions: 'Toplam İşlem',
        bankMatchRate: 'Eşleşme Oranı',
        bankNoData: 'Bu dönem için banka işlemi bulunamadı',
    },
    en: {
        // Page
        dashboardTitle: 'Dashboard',
        dashboardDescription: 'Expense and Income Analytics',

        // Stats
        totalExpenses: 'Total Expenses',
        matched: 'Matched',
        discrepancies: 'Discrepancies',
        pendingReview: 'Pending Review',

        // Period selector
        periodAll: 'All',
        period1W: '1W',
        period1M: '1M',
        period3M: '3M',
        period1Y: '1Y',
        periodFrom: 'From',
        periodTo: 'To',

        // Charts
        totalSpending: 'Total Expenses',
        spendingByCategory: 'Expenses by Category',
        loadingData: 'Loading...',
        noCategoryData: 'No category data for this period',
        pieAmountCol: 'Amount',
        pieShareCol: 'Share',
        pieTotal: 'Total',

        // Quick actions
        quickActions: 'Quick Actions',
        expensesAction: 'Expenses',
        expensesActionDesc: 'View and manage expense list',

        // Chart filters
        showValuesIn: 'Show values in:',
        transactionCurrency: 'Transaction currency:',
        dateRanges: 'Date ranges:',
        chartFilters: 'Filter',
        filterCurrency: 'Currency',
        filterCategory: 'Category',
        selectAll: 'Select All',
        deselectAll: 'Clear',

        // Nav
        navDashboard: 'Dashboard',
        navExpenses: 'Expenses',
        navBankStatements: 'Bank Statements',

        dashboardExpenses: 'Expenses',
        dashboardIncome: 'Income',
        dashboardInvoices: 'Invoices',
        totalIncome: 'Total Income',

        // Bank dashboard
        bankTotalDebits: 'Total Outgoing (Debits)',
        bankTotalCredits: 'Total Incoming (Credits)',
        bankByBank: 'By Bank',
        bankMatchStatus: 'Match Status',
        bankMatched: 'Matched',
        bankUnmatched: 'Unmatched',
        bankTotalTransactions: 'Total Transactions',
        bankMatchRate: 'Match Rate',
        bankNoData: 'No bank transactions found for this period',
    },
    de: {
        // Page
        dashboardTitle: 'Dashboard',
        dashboardDescription: 'Ausgaben- und Einnahmenanalyse',

        // Stats
        totalExpenses: 'Gesamtausgaben',
        matched: 'Zugeordnet',
        discrepancies: 'Abweichungen',
        pendingReview: 'Zur Prüfung',

        // Period selector
        periodAll: 'Alle',
        period1W: '1W',
        period1M: '1M',
        period3M: '3M',
        period1Y: '1J',
        periodFrom: 'Von',
        periodTo: 'Bis',

        // Charts
        totalSpending: 'Gesamtausgaben',
        spendingByCategory: 'Ausgaben nach Kategorie',
        loadingData: 'Wird geladen...',
        noCategoryData: 'Keine Kategoriedaten für diesen Zeitraum',
        pieAmountCol: 'Betrag',
        pieShareCol: 'Anteil',
        pieTotal: 'Gesamt',

        // Quick actions
        quickActions: 'Schnellzugriff',
        expensesAction: 'Ausgaben',
        expensesActionDesc: 'Ausgabenliste anzeigen und verwalten',

        // Chart filters
        showValuesIn: 'Werte anzeigen in:',
        transactionCurrency: 'Transaktionswährung:',
        dateRanges: 'Datumsbereiche:',
        chartFilters: 'Filter',
        filterCurrency: 'Wahrung',
        filterCategory: 'Kategorie',
        selectAll: 'Alle',
        deselectAll: 'Loschen',

        // Nav
        navDashboard: 'Dashboard',
        navExpenses: 'Ausgaben',
        navBankStatements: 'Kontoauszüge',

        dashboardExpenses: 'Ausgaben',
        dashboardIncome: 'Einnahmen',
        dashboardInvoices: 'Rechnungen',
        totalIncome: 'Gesamteinnahmen',

        // Bank dashboard
        bankTotalDebits: 'Gesamte Ausgänge (Soll)',
        bankTotalCredits: 'Gesamte Eingänge (Haben)',
        bankByBank: 'Nach Bank',
        bankMatchStatus: 'Zuordnungsstatus',
        bankMatched: 'Zugeordnet',
        bankUnmatched: 'Nicht zugeordnet',
        bankTotalTransactions: 'Gesamttransaktionen',
        bankMatchRate: 'Zuordnungsrate',
        bankNoData: 'Keine Banktransaktionen für diesen Zeitraum',
    },
};