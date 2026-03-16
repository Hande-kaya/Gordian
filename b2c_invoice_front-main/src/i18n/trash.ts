/**
 * Trash (Deleted Items) Translations
 */

import { Translations } from '../shared/i18n';

export const trashTranslations: Translations = {
    tr: {
        navTrash: 'Silinenler',
        trashTitle: 'Silinenler',
        trashDescription: 'Silinen belgeler 30 gün boyunca burada saklanır.',

        trashEmptyTitle: 'Çöp kutusu boş',
        trashEmptyText: 'Silinen belgeler burada görüntülenecektir.',
        trashRestore: 'Geri Yükle',
        trashRestoreSuccess: 'Belge başarıyla geri yüklendi.',
        trashRestoreError: 'Geri yükleme sırasında hata oluştu.',
        trashDeletedAt: 'Silinme Tarihi',
        trashDaysLeft: '{days} gün kaldı',
        trashExpired: 'Süresi doldu',
        trashRestoreConfirm: 'Bu belgeyi geri yüklemek istiyor musunuz?',

        trashAutoDelete: 'Belgeler 30 gün sonra kalıcı olarak silinir.',
        trashItemCount: '{count} belge',
        trashDayUnit: 'gün',

        trashSelectAll: 'Tümünü Seç',
        trashSelected: '{count} seçili',
        trashPermanentDelete: 'Kalıcı Olarak Sil',
        trashPermanentDeleteConfirm: '{count} belge kalıcı olarak silinecek. Bu işlem geri alınamaz.',
        trashPermanentDeleteSuccess: '{count} belge kalıcı olarak silindi.',
        trashPermanentDeleteError: 'Silme sırasında hata oluştu.',

        trashTabExpenses: 'Harcamalar',
        trashTabRevenue: 'Gelirler',
        trashTabBankStatements: 'Banka Ekstreleri',

    },
    en: {
        navTrash: 'Trash',
        trashTitle: 'Trash',
        trashDescription: 'Deleted documents are kept here for 30 days.',

        trashEmptyTitle: 'Trash is empty',
        trashEmptyText: 'Deleted documents will appear here.',
        trashRestore: 'Restore',
        trashRestoreSuccess: 'Document restored successfully.',
        trashRestoreError: 'Error restoring document.',
        trashDeletedAt: 'Deleted',
        trashDaysLeft: '{days} days left',
        trashExpired: 'Expired',
        trashRestoreConfirm: 'Do you want to restore this document?',

        trashAutoDelete: 'Documents are permanently deleted after 30 days.',
        trashItemCount: '{count} documents',
        trashDayUnit: 'days',

        trashSelectAll: 'Select All',
        trashSelected: '{count} selected',
        trashPermanentDelete: 'Delete Permanently',
        trashPermanentDeleteConfirm: '{count} document(s) will be permanently deleted. This action cannot be undone.',
        trashPermanentDeleteSuccess: '{count} document(s) permanently deleted.',
        trashPermanentDeleteError: 'Error during deletion.',

        trashTabExpenses: 'Expenses',
        trashTabRevenue: 'Revenue',
        trashTabBankStatements: 'Bank Statements',

    },
    de: {
        navTrash: 'Papierkorb',
        trashTitle: 'Papierkorb',
        trashDescription: 'Gelöschte Dokumente werden hier 30 Tage lang aufbewahrt.',

        trashEmptyTitle: 'Papierkorb ist leer',
        trashEmptyText: 'Gelöschte Dokumente werden hier angezeigt.',
        trashRestore: 'Wiederherstellen',
        trashRestoreSuccess: 'Dokument erfolgreich wiederhergestellt.',
        trashRestoreError: 'Fehler beim Wiederherstellen des Dokuments.',
        trashDeletedAt: 'Gelöscht am',
        trashDaysLeft: 'Noch {days} Tage',
        trashExpired: 'Abgelaufen',
        trashRestoreConfirm: 'Möchten Sie dieses Dokument wiederherstellen?',

        trashAutoDelete: 'Dokumente werden nach 30 Tagen endgültig gelöscht.',
        trashItemCount: '{count} Dokumente',
        trashDayUnit: 'Tage',

        trashSelectAll: 'Alle auswählen',
        trashSelected: '{count} ausgewählt',
        trashPermanentDelete: 'Endgültig löschen',
        trashPermanentDeleteConfirm: '{count} Dokument(e) werden endgültig gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.',
        trashPermanentDeleteSuccess: '{count} Dokument(e) endgültig gelöscht.',
        trashPermanentDeleteError: 'Fehler beim Löschen.',

        trashTabExpenses: 'Ausgaben',
        trashTabRevenue: 'Einnahmen',
        trashTabBankStatements: 'Kontoauszüge',

    },
};
