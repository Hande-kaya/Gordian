/**
 * Sidebar Component
 * =================
 * Generic sidebar navigation for Invoice Checker.
 * Clean implementation following RFQ patterns.
 * Supports expandable parent items with children.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useLang } from '../../i18n';
import './Sidebar.scss';

const MOBILE_BREAKPOINT = 768;

export interface NavItem {
    id: string;
    label: string;
    icon: React.ReactNode;
    route?: string;
    badge?: number;
    isSeparator?: boolean;
    children?: NavItem[];  // Sub-items for expandable menus
    dataTutorial?: string; // data-tutorial attribute for onboarding spotlight
}

interface SidebarProps {
    logo: React.ReactNode;
    navItems: NavItem[];
    currentRoute: string;
    onNavigate: (route: string) => void;
    user: {
        name: string;
        email: string;
        avatar?: string;
    };
    onLogout: () => void;
}

// Chevron icon for expandable items
const ChevronIcon: React.FC<{ isExpanded: boolean }> = ({ isExpanded }) => (
    <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        style={{
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease'
        }}
    >
        <polyline points="9 18 15 12 9 6" />
    </svg>
);

// Sidebar panel toggle icon (like Claude.ai)
const PanelToggleIcon: React.FC = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
);

const Sidebar: React.FC<SidebarProps> = ({
    logo,
    navItems,
    currentRoute,
    onNavigate,
    user,
    onLogout
}) => {
    const { t } = useLang();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);
    const [mobileOpen, setMobileOpen] = useState(false);

    // Listen for resize to toggle mobile mode
    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < MOBILE_BREAKPOINT;
            setIsMobile(mobile);
            if (!mobile) setMobileOpen(false);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Listen for tutorial requesting sidebar open/close on mobile
    useEffect(() => {
        const handleTutorialOpen = () => {
            if (window.innerWidth < MOBILE_BREAKPOINT) setMobileOpen(true);
        };
        const handleTutorialClose = () => {
            if (window.innerWidth < MOBILE_BREAKPOINT) setMobileOpen(false);
        };
        window.addEventListener('tutorial-open-sidebar', handleTutorialOpen);
        window.addEventListener('tutorial-close-sidebar', handleTutorialClose);
        return () => {
            window.removeEventListener('tutorial-open-sidebar', handleTutorialOpen);
            window.removeEventListener('tutorial-close-sidebar', handleTutorialClose);
        };
    }, []);

    // Close sidebar on mobile when navigating
    const handleMobileClose = useCallback(() => {
        if (isMobile) setMobileOpen(false);
    }, [isMobile]);

    // Get user initials for avatar
    const getUserInitials = () => {
        if (user.name) {
            const parts = user.name.split(' ');
            if (parts.length >= 2) {
                return parts[0][0] + parts[1][0];
            }
            return user.name.charAt(0);
        }
        return 'U';
    };

    // Check if route is active (handles query params)
    const isRouteActive = (route: string | undefined): boolean => {
        if (!route) return false;
        // Full match including query params for child items
        if (currentRoute === route) return true;

        const currentPath = currentRoute.split('?')[0];
        const routePath = route.split('?')[0];

        // Exact path match (without query) only for items without children
        return currentPath === routePath;
    };

    // Check if route is active - for child items, require exact match including query params
    const isChildRouteActive = (route: string | undefined): boolean => {
        if (!route) return false;
        // For child items: exact match including query params
        return currentRoute === route;
    };

    // Check if any child is active (to highlight parent)
    const hasActiveChild = (item: NavItem): boolean => {
        if (!item.children) return false;
        return item.children.some(child => isChildRouteActive(child.route));
    };

    // Toggle expandable item
    const toggleExpand = (id: string) => {
        setExpandedItems(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Render a single nav item
    const renderNavItem = (item: NavItem, isChild: boolean = false) => {
        if (item.isSeparator) {
            return <div key={item.id} className="sidebar__separator" />;
        }

        const hasChildren = item.children && item.children.length > 0;
        const isExpanded = expandedItems.has(item.id);
        // Use exact match for child items, path match for parents
        const isActive = isChild ? isChildRouteActive(item.route) : isRouteActive(item.route);
        const isParentActive = hasActiveChild(item);

        // Auto-expand parent if child is active
        if (isParentActive && !expandedItems.has(item.id)) {
            setExpandedItems(prev => new Set(prev).add(item.id));
        }

        return (
            <div key={item.id} className="sidebar__nav-group">
                <button
                    className={`sidebar__nav-item ${isActive ? 'sidebar__nav-item--active' : ''} ${isParentActive ? 'sidebar__nav-item--parent-active' : ''} ${isChild ? 'sidebar__nav-item--child' : ''} ${hasChildren ? 'sidebar__nav-item--parent' : ''}`}
                    onClick={() => {
                        if (hasChildren) {
                            toggleExpand(item.id);
                        } else if (item.route) {
                            onNavigate(item.route);
                            handleMobileClose();
                        }
                    }}
                    title={isCollapsed ? item.label : undefined}
                    {...(item.dataTutorial ? { 'data-tutorial': item.dataTutorial } : {})}
                >
                    <span className="sidebar__nav-icon">{item.icon}</span>
                    {!isCollapsed && (
                        <>
                            <span className="sidebar__nav-label">{item.label}</span>
                            {item.badge !== undefined && item.badge > 0 && (
                                <span className="sidebar__nav-badge">{item.badge}</span>
                            )}
                            {hasChildren && (
                                <span className="sidebar__nav-chevron">
                                    <ChevronIcon isExpanded={isExpanded} />
                                </span>
                            )}
                        </>
                    )}
                </button>

                {/* Children */}
                {hasChildren && isExpanded && !isCollapsed && (
                    <div className="sidebar__nav-children">
                        {item.children!.map(child => renderNavItem(child, true))}
                    </div>
                )}
            </div>
        );
    };

    const sidebarClasses = [
        'sidebar',
        isCollapsed && !isMobile ? 'sidebar--collapsed' : '',
        isMobile ? 'sidebar--mobile' : '',
        isMobile && mobileOpen ? 'sidebar--mobile-open' : '',
    ].filter(Boolean).join(' ');

    return (
        <>
            {/* Mobile toggle button (visible when sidebar is closed) */}
            {isMobile && !mobileOpen && (
                <button
                    className="sidebar__toggle"
                    onClick={() => setMobileOpen(true)}
                    aria-label="Open menu"
                >
                    <PanelToggleIcon />
                </button>
            )}

            {/* Mobile backdrop */}
            {isMobile && mobileOpen && (
                <div className="sidebar__backdrop" onClick={() => setMobileOpen(false)} />
            )}

            <aside className={sidebarClasses} data-tutorial="sidebar">
                {/* Header */}
                <div className="sidebar__header">
                    <div className="sidebar__logo">
                        {!isCollapsed || isMobile
                            ? logo
                            : <span className="sidebar__logo-icon">{typeof logo === 'string' ? logo.charAt(0) : 'M'}</span>}
                    </div>
                    {/* Toggle inside sidebar header on mobile */}
                    {isMobile && mobileOpen && (
                        <button
                            className="sidebar__toggle sidebar__toggle--inside"
                            onClick={() => setMobileOpen(false)}
                            aria-label="Close menu"
                        >
                            <PanelToggleIcon />
                        </button>
                    )}
                </div>

                {/* Navigation */}
                <nav className="sidebar__nav">
                    {navItems.map(item => renderNavItem(item))}
                </nav>

                {/* Footer */}
                <div className="sidebar__footer">
                    <div className="sidebar__user">
                        <div className="sidebar__user-avatar">
                            {user.avatar
                                ? <img src={user.avatar} alt="" className="sidebar__user-avatar-img" />
                                : <span>{getUserInitials()}</span>
                            }
                        </div>
                        {(!isCollapsed || isMobile) && (
                            <div className="sidebar__user-info">
                                <div className="sidebar__user-name">{user.name}</div>
                                <div className="sidebar__user-email" onClick={() => onNavigate('/settings')} style={{ cursor: 'pointer' }}>
                                    {user.email}
                                </div>
                            </div>
                        )}
                    </div>
                    <button className="sidebar__logout" onClick={onLogout} title={t('logout')}>
                        {isCollapsed && !isMobile ? '\uD83D\uDEAA' : t('logout')}
                    </button>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
