/**
 * Layout Component - B2C
 * =======================
 * Simplified layout with Expenses + Bank Statements navigation.
 * No Portal/module navigation.
 */

import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sidebar } from '../../../shared/components';
import type { NavItem } from '../../../shared/components';
import { useLang } from '../../../shared/i18n';
import { useAuth } from '../../../context/AuthContext';
import { guardNavigation } from '../../../shared/hooks/useUnsavedChanges';
import { DashboardIcon, ExpenseIcon, IncomeIcon, BankIcon, ReconciliationIcon, TrashIcon, FilesIcon, SettingsIcon } from '../../../shared/icons/NavIcons';
import './Layout.scss';

interface LayoutProps {
    children: React.ReactNode;
    pageTitle: string;
    pageDescription?: string;
    headerActions?: React.ReactNode;
}

const B2CLogo = () => (
    <span className="b2c-logo">Invoice<span>Manager</span></span>
);

const Layout: React.FC<LayoutProps> = ({ children, pageTitle, pageDescription, headerActions }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useLang();
    const { user, logout } = useAuth();

    const navItems: NavItem[] = [
        { id: 'dashboard', label: t('navDashboard'), icon: <DashboardIcon />, route: '/dashboard' },
        { id: 'expenses', label: t('navExpenses'), icon: <ExpenseIcon />, route: '/invoices', dataTutorial: 'expenses-nav' },
        { id: 'income', label: t('navIncome'), icon: <IncomeIcon />, route: '/income' },
        { id: 'files', label: t('navFiles'), icon: <FilesIcon />, route: '/files' },
        { id: 'bank-statements', label: t('navBankStatements'), icon: <BankIcon />, route: '/bank-statements' },
        { id: 'reconciliation', label: t('navReconciliation'), icon: <ReconciliationIcon />, route: '/reconciliation' },
        { id: 'trash', label: t('navTrash'), icon: <TrashIcon />, route: '/trash' },
        { id: 'sep', label: '', icon: null, isSeparator: true },
        { id: 'settings', label: t('navSettings'), icon: <SettingsIcon />, route: '/settings', dataTutorial: 'settings-nav' },
    ];

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="layout">
            <Sidebar
                logo={<B2CLogo />}
                navItems={navItems}
                currentRoute={location.pathname + location.search}
                onNavigate={(route: string) => {
                    if (!guardNavigation(() => navigate(route))) navigate(route);
                }}
                user={{ name: user?.name || 'User', email: user?.email || '', avatar: user?.profile_photo }}
                onLogout={handleLogout}
            />
            <main className="layout__main">
                <header className="layout__header">
                    <div className="layout__header-left">
                        <h1 className="layout__page-title">{pageTitle}</h1>
                        {pageDescription && (
                            <p className="layout__page-description">{pageDescription}</p>
                        )}
                    </div>
                    {headerActions && (
                        <div className="layout__header-actions">{headerActions}</div>
                    )}
                </header>
                <div className="layout__content">{children}</div>
            </main>
        </div>
    );
};

export default Layout;
