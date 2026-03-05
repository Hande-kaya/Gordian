# Invoice B2C Frontend - Project Status

## Overview
React frontend (Port 3003) for B2C invoice management. Individual users upload invoices, view extracted data, manage expenses.

## Pages & Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing | Marketing landing page |
| `/login` | Login | Email/password + SSO login |
| `/register` | Register | Email/password registration |
| `/forgot-password` | ForgotPassword | Password reset flow |
| `/auth/sso-callback` | SsoCallback | Handles SSO redirect |
| `/dashboard` | Dashboard | Summary cards, recent activity |
| `/invoices` | InvoiceList | Expenses table with filters, bulk upload, export |
| `/invoices/:id` | InvoiceDetail | PDF viewer + editable fields |
| `/bank-statements` | BankStatements | Placeholder page |
| `/trash` | Trash | Soft-deleted documents (30-day window) |
| `/settings` | Settings | Profile, Security, Theme, Language, Categories, Subscription, Usage, Account tabs |

## Architecture

```
components/
  layout/Layout/    → B2C layout with built-in sidebar nav
  common/           → ConfirmModal, shared UI components
shared/
  components/       → DataDashboard, Sidebar, HeaderActions (from shared-lib)
  layout/Layout.tsx → Generic layout (sidebar via props)
  i18n/             → Translation files (TR/EN)
pages/              → Route-level page components
services/           → API clients (documentApi, authApi)
context/            → AuthContext, ThemeContext, OnboardingContext
```

## Sidebar Navigation
```
Dashboard → Expenses → Bank Statements → [separator] → Trash → [separator] → Settings
```
NavItems defined in 3 places (must stay in sync):
1. `components/layout/Layout/index.tsx`
2. `pages/InvoiceList/index.tsx`
3. `pages/InvoiceDetail/index.tsx`

## Key Features

### Settings Page (sidebar tabs)
- **Profile**: Name, email, profile photo upload (deferred save)
- **Security**: Change password
- **Theme**: Light/Dark/System theme picker cards
- **Language**: TR/EN toggle cards
- **Subscription**: Plan comparison (placeholder)
- **Usage**: Documents uploaded, storage used, API calls (placeholder)
- **Account**: Account type, member ID

### Onboarding (New Users)
- **Wizard**: 4-step modal (Welcome → Theme → Language → Ready)
- **Tutorial**: 9-step guided tour with spotlight overlay, avatar character, tooltip
- Triggered when `user.preferences.onboarding_completed === false`
- On completion, persists to DB via `PATCH /api/auth/preferences`
- Components: `OnboardingWizard`, `TutorialOverlay`, `TutorialTooltip`, `SampleExpense`

### Dark Mode
- CSS custom properties defined in `styles/_theme-variables.scss`
- `[data-theme="dark"]` applied to `<html>` by ThemeContext
- All authenticated pages migrated: b2c-theme, Dashboard, InvoiceList, InvoiceDetail, Settings, Layout
- Sidebar always uses green-dark bg (theme-independent)
- Theme persisted to localStorage (`app_theme`) + DB

### Profile Photo
- Client-side resize to 200x200 JPEG via Canvas API
- Stored as base64 in user document (~20-40KB)
- Displayed in sidebar avatar (bottom-left)
- Google SSO: auto-captured from Google profile on login/register

### Soft Delete & Trash
- Delete moves to trash (soft delete with `deleted_at` timestamp)
- Trash page shows items deleted in last 30 days
- Restore button returns items to active list
- ConfirmModal used for delete confirmation

### Bulk Upload & Export
- Styled modals matching B2C design system
- SCSS variables used throughout (no hardcoded colors)

## i18n
- All UI text uses `useLang()` hook with `t('key')` pattern
- Translation files in `shared/i18n/` (per-page modules merged in index.ts)
- Supported languages: Turkish (TR), English (EN)

## Known Issues
- None currently

## Architectural Decisions

### 19 Feb 2026 - Rename Invoices → Expenses
- **Change**: Sidebar label changed from "Faturalar/Invoices" to "Harcamalar/Expenses"
- **Routes unchanged**: URL paths remain `/invoices` for backwards compatibility
- **Impact**: Only display names changed, no route or API changes

### 19 Feb 2026 - Profile Photo Deferred Save
- **Decision**: Photo selection only shows preview; actual upload happens on "Save Changes"
- **Reason**: User expected Save button to control all changes including photo
- **Pattern**: `pendingPhoto` state tracks unsaved photo, `'__remove__'` sentinel for removal

### 26 Feb 2026 - Multi-Link Reconciliation + Detail Modal + Document Picker UX
- **Feature**: MatchDetailModal redesigned for multi-document support. DocumentPickerModal enhanced with confirmation flow, proximity scores, and smart filtering.
- **New Components**: `matchingPanelUtils.ts` (shared helpers), `TransactionRow.tsx` (extracted row with "+N" multi-link badge)
- **MatchingPanel.tsx**: Refactored from 397→314 lines. Uses TransactionRow, handles `onLink` flow from detail modal. `handleManualLink` returns `Promise<boolean>` (modal stays open after link).
- **MatchDetailModal.tsx**: Left panel: tx info + clickable document cards. Right panel: selected doc preview. "Belge Ekle" button opens DocumentPickerModal.
- **DocumentPickerModal.tsx**: (1) Confirmation step before linking ("Bu belgeyi bağlamak istiyor musunuz?"), (2) Stays open after link — user can add more, (3) "Eklendi" badge on linked docs, (4) Proximity score 0-100 per doc (amount 0-60 + date 0-40), (5) Hides docs with date >1 month from transaction.
- **DocPreview.tsx**: HTTP 404 shows friendly "file not found" icon instead of raw error string.
- **i18n**: 9 new keys in TR/EN/DE (linkedDocuments, fileNotFound, documentAlreadyLinked, linkMore, confirmLinkTitle, confirmLinkYes, confirmLinkCancel, docAdded, proximityScore).

### 23 Feb 2026 - Per-User Customizable Expense Categories (Frontend)
- **Feature**: New "Categories" tab in Settings for managing per-user expense categories
- **CategoryContext**: `CategoryProvider` wraps app, provides `useCategories()` hook with `categories`, `getLabelByKey()`, `refresh()`
- **CategorySettings component**: Add/edit/delete categories, expandable rows, reorder buttons, reset to defaults with confirmation
- **Dynamic columns**: InvoiceList expense_category dropdown built from user's categories dynamically
- **Dashboard integration**: CategoryChart and CategoryChartsGrid use `getLabelByKey()` instead of hardcoded map
- **InvoiceDetail**: Select options for expense_category fetched from CategoryContext
- **Lazy migration**: Old category keys (food, fuel, etc.) display as raw key; new categories from LLM prompt
- **i18n**: 22 new keys across TR/EN/DE for category management UI
- **Files**: `context/CategoryContext.tsx` (new), `pages/Settings/CategorySettings.tsx` (new), `pages/Settings/CategorySettings.scss` (new), `pages/Settings/index.tsx` (+categories tab), `services/documentApi.ts` (+3 API functions), `pages/InvoiceList/columns.tsx` (dynamic), `pages/InvoiceList/index.tsx` (useCategories), `pages/InvoiceDetail/index.tsx` (dynamic select), `pages/Dashboard/components/CategoryChart.tsx` (useCategories), `pages/Dashboard/components/CategoryChartsGrid.tsx` (useCategories), `i18n/settings.ts` (+i18n keys), `i18n/invoiceList.ts` (-hardcoded category keys), `App.tsx` (CategoryProvider)

### 20 Feb 2026 - Onboarding + Dark Mode + Theme System
- **Decision**: Full onboarding wizard (4 steps) + guided tutorial (9 steps) for new users
- **Architecture**: ThemeContext manages light/dark/system via `data-theme` on `<html>`, CSS custom properties
- **Tutorial**: Spotlight overlay using `box-shadow: 0 0 0 9999px` cutout technique, avatar SVG mascot
- **data-tutorial attributes**: Added to Sidebar, nav items, Dashboard charts, InvoiceList upload/export buttons
- **i18n format**: `{ tr: { key: value }, en: { key: value } }` (not nested `{ key: { tr, en } }`)
- **Wizard flow**: Welcome → Theme → Language → Ready → optional Tutorial → markComplete to DB
