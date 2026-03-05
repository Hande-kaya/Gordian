/**
 * Tutorial step definitions.
 * Each step spotlights a UI element and shows a tooltip with avatar.
 */

export interface TutorialStep {
    id: string;
    targetSelector: string;
    title: { tr: string; en: string; de: string };
    description: { tr: string; en: string; de: string };
    avatarMood: 'happy' | 'pointing' | 'thinking' | 'celebrate';
    position: 'top' | 'bottom' | 'left' | 'right';
    route?: string;
    pulseTarget?: boolean;
    interactive?: boolean;   // Allow click-through in spotlight area
    noBackdrop?: boolean;    // Don't show dark backdrop (for modal steps)
}

export const tutorialSteps: TutorialStep[] = [
    {
        id: 'sidebar',
        targetSelector: '[data-tutorial="sidebar"]',
        title: { tr: 'Menü Gezintisi', en: 'Navigation Menu', de: 'Navigationsmenü' },
        description: {
            tr: 'Sol menüden tüm sayfalara kolayca erişebilirsiniz.',
            en: 'Use the sidebar to easily navigate between all pages.',
            de: 'Nutzen Sie die Seitenleiste, um einfach zwischen allen Seiten zu navigieren.',
        },
        avatarMood: 'happy',
        position: 'right',
        route: '/dashboard',
        pulseTarget: true,
    },
    {
        id: 'dashboard-charts',
        targetSelector: '[data-tutorial="charts"]',
        title: { tr: 'Özet Paneli', en: 'Dashboard Overview', de: 'Dashboard-Übersicht' },
        description: {
            tr: 'Grafikler ve istatistiklerle harcamalarınızı genel olarak görüntüleyin.',
            en: 'View your expenses at a glance with charts and statistics.',
            de: 'Sehen Sie Ihre Ausgaben auf einen Blick mit Diagrammen und Statistiken.',
        },
        avatarMood: 'pointing',
        position: 'right',
        route: '/dashboard',
    },
    {
        id: 'expenses-nav',
        targetSelector: '[data-tutorial="expenses-nav"]',
        title: { tr: 'Harcamalar Listesi', en: 'Expenses List', de: 'Ausgabenliste' },
        description: {
            tr: 'Tüm faturalarınızı burada arayabilir, filtreleyebilir ve yönetebilirsiniz.',
            en: 'Search, filter, and manage all your invoices here.',
            de: 'Suchen, filtern und verwalten Sie hier alle Ihre Rechnungen.',
        },
        avatarMood: 'pointing',
        position: 'right',
        route: '/dashboard',
    },
    {
        id: 'upload-btn',
        targetSelector: '[data-tutorial="upload-btn"]',
        title: { tr: 'Fatura Yükle', en: 'Upload Invoice', de: 'Rechnung hochladen' },
        description: {
            tr: 'PDF veya fotoğraf yükleyin — otomatik olarak taranır ve verileri çıkarılır.',
            en: 'Upload a PDF or photo — it will be automatically scanned and data extracted.',
            de: 'Laden Sie ein PDF oder Foto hoch — es wird automatisch gescannt und die Daten extrahiert.',
        },
        avatarMood: 'pointing',
        position: 'bottom',
        route: '/invoices',
        pulseTarget: true,
    },
    {
        id: 'expense-row',
        targetSelector: '[data-tutorial="expense-row"]',
        title: { tr: 'Harcama Satırı', en: 'Expense Row', de: 'Ausgabenzeile' },
        description: {
            tr: 'Yüklediğiniz faturalar burada listelenir. Detayını görmek için satıra tıklayın.',
            en: 'Your uploaded invoices appear here. Click a row to view its details.',
            de: 'Ihre hochgeladenen Rechnungen erscheinen hier. Klicken Sie auf eine Zeile, um Details anzuzeigen.',
        },
        avatarMood: 'pointing',
        position: 'bottom',
        route: '/invoices',
        pulseTarget: true,
    },
    {
        id: 'expense-detail-pdf',
        targetSelector: '[data-tutorial="detail-pdf"]',
        title: { tr: 'PDF Görüntüleyici', en: 'PDF Viewer', de: 'PDF-Betrachter' },
        description: {
            tr: 'Yüklediğiniz faturanın PDF\'i burada görüntülenir. Yakınlaştırma ve sayfa geçişi yapabilirsiniz.',
            en: 'The uploaded invoice PDF is displayed here. You can zoom in and navigate pages.',
            de: 'Das hochgeladene Rechnungs-PDF wird hier angezeigt. Sie können zoomen und zwischen Seiten wechseln.',
        },
        avatarMood: 'thinking',
        position: 'right',
        route: '/invoices/sample-001',
    },
    {
        id: 'expense-detail-fields',
        targetSelector: '[data-tutorial="detail-fields"]',
        title: { tr: 'Çıkarılan Veriler', en: 'Extracted Data', de: 'Extrahierte Daten' },
        description: {
            tr: 'OCR ile otomatik çıkarılan fatura bilgileri burada gösterilir: tedarikçi, tarih, tutar ve kalemler.',
            en: 'OCR-extracted invoice data is shown here: supplier, date, amounts, and line items.',
            de: 'Per OCR extrahierte Rechnungsdaten werden hier angezeigt: Lieferant, Datum, Beträge und Positionen.',
        },
        avatarMood: 'pointing',
        position: 'left',
        route: '/invoices/sample-001',
    },
    {
        id: 'edit-fields',
        targetSelector: '[data-tutorial="detail-fields"]',
        title: { tr: 'Düzenleme Modu', en: 'Edit Mode', de: 'Bearbeitungsmodus' },
        description: {
            tr: 'Düzenleme modu açıldı! Herhangi bir alanı tıklayıp değiştirin. Örneğin tedarikçi adını düzenleyin, sonra İleri\'ye basın.',
            en: 'Edit mode is on! Click any field to change it. Try editing the supplier name, then press Next.',
            de: 'Der Bearbeitungsmodus ist aktiv! Klicken Sie auf ein Feld, um es zu ändern. Bearbeiten Sie z. B. den Lieferantennamen und drücken Sie dann Weiter.',
        },
        avatarMood: 'pointing',
        position: 'left',
        route: '/invoices/sample-001',
        interactive: true,
    },
    {
        id: 'export-modal',
        targetSelector: '[data-tutorial="export-modal"]',
        title: { tr: 'Excel\'e Aktar', en: 'Export to Excel', de: 'Nach Excel exportieren' },
        description: {
            tr: 'Tarih aralığı ve sayfa gruplaması seçerek harcamalarınızı Excel dosyası olarak indirin.',
            en: 'Choose a date range and sheet grouping to download your expenses as an Excel file.',
            de: 'Wählen Sie einen Zeitraum und eine Blattgruppierung, um Ihre Ausgaben als Excel-Datei herunterzuladen.',
        },
        avatarMood: 'pointing',
        position: 'left',
        route: '/invoices',
        noBackdrop: true,
    },
    {
        id: 'settings',
        targetSelector: '[data-tutorial="settings-nav"]',
        title: { tr: 'Ayarlar', en: 'Settings', de: 'Einstellungen' },
        description: {
            tr: 'Profil, tema, dil ve hesap ayarlarınızı buradan yönetin.',
            en: 'Manage your profile, theme, language, and account settings here.',
            de: 'Verwalten Sie hier Ihr Profil, Design, Sprache und Kontoeinstellungen.',
        },
        avatarMood: 'pointing',
        position: 'right',
        route: '/dashboard',
    },
    {
        id: 'done',
        targetSelector: 'body',
        title: { tr: 'Tur Tamamlandı!', en: 'Tour Complete!', de: 'Tour abgeschlossen!' },
        description: {
            tr: 'Harika! Artık uygulamayı kullanmaya hazırsınız. İyi harcama takipleri!',
            en: "Great! You're all set to use the app. Happy expense tracking!",
            de: 'Großartig! Sie sind bereit, die App zu nutzen. Viel Erfolg bei der Ausgabenverfolgung!',
        },
        avatarMood: 'celebrate',
        position: 'bottom',
    },
];
