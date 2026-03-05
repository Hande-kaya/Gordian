/**
 * Config Template - Her modül kendi config.ts'ini bu template'den oluşturur
 *
 * Kullanım:
 * 1. Bu dosyayı src/utils/config.ts olarak kopyala
 * 2. MODULE_API_URL'i modülün portuna göre değiştir
 * 3. MODULE_NAME'i değiştir
 */

const isProduction = process.env.NODE_ENV === 'production';

export const config = {
    // Portal API (Auth) - Tüm modüller aynı
    PORTAL_API_URL: process.env.REACT_APP_PORTAL_API_URL || 'http://localhost:5002',

    // Portal Frontend (SSO redirect) - Tüm modüller aynı
    PORTAL_URL: process.env.REACT_APP_PORTAL_URL || 'http://localhost:3001',

    // Module API - HER MODÜL DEĞİŞTİRMELİ
    // Invoice Checker: 5003
    // Invoice Management: 5004
    MODULE_API_URL: process.env.REACT_APP_API_URL || 'http://localhost:5003',

    // Module Name - HER MODÜL DEĞİŞTİRMELİ
    MODULE_NAME: 'module-template',
};

export default config;
