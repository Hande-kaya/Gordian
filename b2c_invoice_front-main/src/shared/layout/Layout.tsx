/**
 * Layout Component - Configurable layout for all modules
 * ========================================================
 * Provides header and optional sidebar navigation.
 *
 * Two modes:
 * 1. With Sidebar: Pass all props (logo, navItems, etc.)
 * 2. Without Sidebar: Only pass pageTitle, pageDescription, headerActions
 *
 * Usage with Sidebar:
 * <Layout
 *   logo="Invoice Management"
 *   navItems={navItems}
 *   currentRoute={location.pathname}
 *   onNavigate={(r) => navigate(r)}
 *   user={{ name: 'User', email: 'user@email.com' }}
 *   onLogout={logout}
 *   pageTitle="Dashboard"
 * >
 *   {children}
 * </Layout>
 *
 * Usage without Sidebar (e.g., inside DataDashboard):
 * <Layout pageTitle="Dashboard">
 *   {children}
 * </Layout>
 */

import React from 'react';
import { Sidebar } from '../components';
import type { NavItem } from '../components';
import './Layout.scss';

interface LayoutProps {
    children: React.ReactNode;
    /** Page title shown in header */
    pageTitle: string;
    /** Page description (optional) */
    pageDescription?: string;
    /** Header action buttons (optional) */
    headerActions?: React.ReactNode;
    /** Application logo/name shown in sidebar (optional - if provided, sidebar is shown) */
    logo?: React.ReactNode;
    /** Navigation items (optional) */
    navItems?: NavItem[];
    /** Current route path (optional) */
    currentRoute?: string;
    /** Callback when navigation item clicked (optional) */
    onNavigate?: (route: string) => void;
    /** Current user info (optional) */
    user?: { name: string; email: string };
    /** Logout callback (optional) */
    onLogout?: () => void;
}

const Layout: React.FC<LayoutProps> = ({
    children,
    pageTitle,
    pageDescription,
    headerActions,
    logo,
    navItems,
    currentRoute,
    onNavigate,
    user,
    onLogout
}) => {
    // Determine if we should show sidebar
    const showSidebar = logo && navItems && navItems.length > 0 && onNavigate && user && onLogout;

    return (
        <div className={`layout ${showSidebar ? '' : 'layout--no-sidebar'}`}>
            {showSidebar && (
                <Sidebar
                    logo={logo}
                    navItems={navItems}
                    currentRoute={currentRoute || '/'}
                    onNavigate={onNavigate}
                    user={user}
                    onLogout={onLogout}
                />
            )}

            <main className="layout__main">
                {/* Header */}
                <header className="layout__header">
                    <div className="layout__header-left">
                        <h1 className="layout__page-title">{pageTitle}</h1>
                        {pageDescription && (
                            <p className="layout__page-description">{pageDescription}</p>
                        )}
                    </div>
                    {headerActions && (
                        <div className="layout__header-actions">
                            {headerActions}
                        </div>
                    )}
                </header>

                {/* Content */}
                <div className="layout__content">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default Layout;
