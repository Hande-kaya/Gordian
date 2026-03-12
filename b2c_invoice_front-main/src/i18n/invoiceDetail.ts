/**
 * Invoice Detail Translations
 * ============================
 * Field labels, section titles, action buttons
 */

import { Translations } from '../shared/i18n';

export const invoiceDetailTranslations: Translations = {
    tr: {
        // Page
        invoiceDetailTitle: 'Fatura Detay',
        invoiceNotFound: 'Fatura bulunamadı',
        serverError: 'Sunucu bağlantı hatası',

        // Sections
        sectionInvoiceInfo: 'Fatura Bilgileri',
        sectionSupplier: 'Tedarikçi',
        sectionReceiver: 'Alıcı',
        sectionFinancial: 'Finansal',

        // Invoice fields
        fieldInvoiceNumber: 'Fatura No',
        fieldInvoiceType: 'Fatura Tipi',
        fieldInvoiceDate: 'Fatura Tarihi',
        fieldDueDate: 'Vade Tarihi',

        // Supplier fields
        fieldSupplierName: 'Firma Adı',
        fieldTaxId: 'Vergi No',
        fieldAddress: 'Adres',
        fieldEmail: 'E-posta',
        fieldPhone: 'Telefon',
        fieldWebsite: 'Website',
        fieldIban: 'IBAN',

        // Receiver fields
        fieldReceiverName: 'Alıcı Adı',
        fieldReceiverAddress: 'Alıcı Adres',

        // Financial fields
        fieldTotalAmount: 'Toplam Tutar',
        fieldNetAmount: 'Net Tutar',
        fieldTaxAmount: 'KDV Tutarı',
        fieldCurrency: 'Para Birimi',
        fieldCategory: 'Kategori',

        // Line items
        lineItemsTitle: 'Kalemler',
        lineItemDesc: 'Açıklama',
        lineItemQty: 'Adet',
        lineItemUnit: 'Birim',
        lineItemUnitPrice: 'B. Fiyat',
        lineItemAmount: 'Tutar',
        lineItemRemove: 'Kalemi sil',
        lineItemAdd: '+ Kalem Ekle',

        // PDF viewer
        pdfPreview: 'PDF Önizleme',
        pdfLoading: 'PDF yükleniyor...',
        pdfLoadError: 'PDF yüklenemedi',
        imageLoadError: 'Görsel yüklenemedi',
        zoomIn: 'Büyüt',
        zoomOut: 'Küçült',
        zoomFit: 'Sığdır',

        // Actions
        backToList: 'Listeye Dön',
        highlightLabel: 'Highlight',
        saveError: 'Kaydetme hatası oluştu.',
        deleteError: 'Silme hatası oluştu.',

        // Delete modal
        deleteTitle: 'Faturayı Sil',
        deleteMessage: 'Bu fatura çöp kutusuna taşınacak. 30 gün içinde geri yükleyebilirsiniz.',
        deleteConfirmLabel: 'Sil',
        deleteCancelLabel: 'Vazgeç',

        // Date swap
        swapDates: 'GG/AA \u21C4 AA/GG',
        swapDatesTitle: 'Gün/Ay yerini değiştir',

        // Nav
        navExpenses: 'Harcamalar',
        navBankStatements: 'Banka Ekstreleri',
    },
    en: {
        // Page
        invoiceDetailTitle: 'Invoice Detail',
        invoiceNotFound: 'Invoice not found',
        serverError: 'Server connection error',

        // Sections
        sectionInvoiceInfo: 'Invoice Information',
        sectionSupplier: 'Supplier',
        sectionReceiver: 'Receiver',
        sectionFinancial: 'Financial',

        // Invoice fields
        fieldInvoiceNumber: 'Invoice No',
        fieldInvoiceType: 'Invoice Type',
        fieldInvoiceDate: 'Invoice Date',
        fieldDueDate: 'Due Date',

        // Supplier fields
        fieldSupplierName: 'Company Name',
        fieldTaxId: 'Tax ID',
        fieldAddress: 'Address',
        fieldEmail: 'Email',
        fieldPhone: 'Phone',
        fieldWebsite: 'Website',
        fieldIban: 'IBAN',

        // Receiver fields
        fieldReceiverName: 'Receiver Name',
        fieldReceiverAddress: 'Receiver Address',

        // Financial fields
        fieldTotalAmount: 'Total Amount',
        fieldNetAmount: 'Net Amount',
        fieldTaxAmount: 'VAT Amount',
        fieldCurrency: 'Currency',
        fieldCategory: 'Category',

        // Line items
        lineItemsTitle: 'Line Items',
        lineItemDesc: 'Description',
        lineItemQty: 'Qty',
        lineItemUnit: 'Unit',
        lineItemUnitPrice: 'Unit Price',
        lineItemAmount: 'Amount',
        lineItemRemove: 'Remove item',
        lineItemAdd: '+ Add Item',

        // PDF viewer
        pdfPreview: 'PDF Preview',
        pdfLoading: 'Loading PDF...',
        pdfLoadError: 'Failed to load PDF',
        imageLoadError: 'Failed to load image',
        zoomIn: 'Zoom in',
        zoomOut: 'Zoom out',
        zoomFit: 'Fit',

        // Actions
        backToList: 'Back to List',
        highlightLabel: 'Highlight',
        saveError: 'Failed to save changes.',
        deleteError: 'Failed to delete invoice.',

        // Delete modal
        deleteTitle: 'Delete Invoice',
        deleteMessage: 'This invoice will be moved to trash. You can restore it within 30 days.',
        deleteConfirmLabel: 'Delete',
        deleteCancelLabel: 'Cancel',

        // Date swap
        swapDates: 'DD/MM \u21C4 MM/DD',
        swapDatesTitle: 'Swap day/month',

        // Nav
        navExpenses: 'Expenses',
        navBankStatements: 'Bank Statements',
    },
    de: {
        // Page
        invoiceDetailTitle: 'Rechnungsdetail',
        invoiceNotFound: 'Rechnung nicht gefunden',
        serverError: 'Serververbindungsfehler',

        // Sections
        sectionInvoiceInfo: 'Rechnungsinformationen',
        sectionSupplier: 'Lieferant',
        sectionReceiver: 'Empfänger',
        sectionFinancial: 'Finanzen',

        // Invoice fields
        fieldInvoiceNumber: 'Rechnungs-Nr.',
        fieldInvoiceType: 'Rechnungsart',
        fieldInvoiceDate: 'Rechnungsdatum',
        fieldDueDate: 'Fälligkeitsdatum',

        // Supplier fields
        fieldSupplierName: 'Firmenname',
        fieldTaxId: 'Steuer-Nr.',
        fieldAddress: 'Adresse',
        fieldEmail: 'E-Mail',
        fieldPhone: 'Telefon',
        fieldWebsite: 'Website',
        fieldIban: 'IBAN',

        // Receiver fields
        fieldReceiverName: 'Empfängername',
        fieldReceiverAddress: 'Empfängeradresse',

        // Financial fields
        fieldTotalAmount: 'Gesamtbetrag',
        fieldNetAmount: 'Nettobetrag',
        fieldTaxAmount: 'MwSt-Betrag',
        fieldCurrency: 'Währung',
        fieldCategory: 'Kategorie',

        // Line items
        lineItemsTitle: 'Positionen',
        lineItemDesc: 'Beschreibung',
        lineItemQty: 'Menge',
        lineItemUnit: 'Einheit',
        lineItemUnitPrice: 'Stückpreis',
        lineItemAmount: 'Betrag',
        lineItemRemove: 'Position entfernen',
        lineItemAdd: '+ Position hinzufügen',

        // PDF viewer
        pdfPreview: 'PDF-Vorschau',
        pdfLoading: 'PDF wird geladen...',
        pdfLoadError: 'PDF konnte nicht geladen werden',
        imageLoadError: 'Bild konnte nicht geladen werden',
        zoomIn: 'Vergrößern',
        zoomOut: 'Verkleinern',
        zoomFit: 'Einpassen',

        // Actions
        backToList: 'Zurück zur Liste',
        highlightLabel: 'Highlight',
        saveError: 'Fehler beim Speichern.',
        deleteError: 'Fehler beim Löschen.',

        // Delete modal
        deleteTitle: 'Rechnung löschen',
        deleteMessage: 'Diese Rechnung wird in den Papierkorb verschoben. Sie können sie innerhalb von 30 Tagen wiederherstellen.',
        deleteConfirmLabel: 'Löschen',
        deleteCancelLabel: 'Abbrechen',

        // Date swap
        swapDates: 'TT/MM \u21C4 MM/TT',
        swapDatesTitle: 'Tag/Monat tauschen',

        // Nav
        navExpenses: 'Ausgaben',
        navBankStatements: 'Kontoauszüge',
    },
};
