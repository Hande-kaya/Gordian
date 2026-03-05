/**
 * Invoice B2C - Main App
 * =======================
 * Standalone B2C frontend with local auth (no Portal SSO).
 * Pages are lazy-loaded for smaller initial bundle.
 */

import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { LanguageProvider } from './shared/i18n';
import { allTranslations } from './i18n';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { OnboardingProvider } from './context/OnboardingContext';
import { CategoryProvider } from './context/CategoryContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import OnboardingWizard from './components/onboarding/OnboardingWizard';
import TutorialOverlay from './components/tutorial/TutorialOverlay';

// Global styles
import './App.scss';

// Lazy-loaded pages — each becomes a separate chunk
const LoginPage = React.lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = React.lazy(() => import('./pages/auth/RegisterPage'));
const VerifyEmailPage = React.lazy(() => import('./pages/auth/VerifyEmailPage'));
const ForgotPasswordPage = React.lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = React.lazy(() => import('./pages/auth/ResetPasswordPage'));
const SsoCallbackPage = React.lazy(() => import('./pages/auth/SsoCallbackPage'));
const LandingPage = React.lazy(() => import('./pages/Landing/LandingPage'));
const InvoiceList = React.lazy(() => import('./pages/InvoiceList'));
const IncomeList = React.lazy(() => import('./pages/IncomeList'));
const InvoiceDetail = React.lazy(() => import('./pages/InvoiceDetail'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Settings = React.lazy(() => import('./pages/Settings'));
const BankStatements = React.lazy(() => import('./pages/BankStatements'));
const BankStatementDetail = React.lazy(() => import('./pages/BankStatementDetail'));
const Trash = React.lazy(() => import('./pages/Trash'));
const Reconciliation = React.lazy(() => import('./pages/Reconciliation'));
const Files = React.lazy(() => import('./pages/Files'));

const PageLoader = () => (
    <div className="loading-container">
        <div className="spinner" />
    </div>
);

function App() {
    return (
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <LanguageProvider translations={allTranslations}>
            <AuthProvider>
            <ThemeProvider>
            <CategoryProvider>
            <OnboardingProvider>
                <Suspense fallback={<PageLoader />}>
                <Routes>
                    {/* Public routes */}
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/verify" element={<VerifyEmailPage />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="/reset-password" element={<ResetPasswordPage />} />
                    <Route path="/auth/sso-callback" element={<SsoCallbackPage />} />

                    {/* Protected routes */}
                    <Route path="/dashboard" element={
                        <ProtectedRoute><Dashboard /></ProtectedRoute>
                    } />
                    <Route path="/invoices" element={
                        <ProtectedRoute><InvoiceList /></ProtectedRoute>
                    } />
                    <Route path="/invoices/:id" element={
                        <ProtectedRoute><InvoiceDetail /></ProtectedRoute>
                    } />
                    <Route path="/income" element={
                        <ProtectedRoute><IncomeList /></ProtectedRoute>
                    } />
                    <Route path="/income/:id" element={
                        <ProtectedRoute><InvoiceDetail /></ProtectedRoute>
                    } />
                    <Route path="/bank-statements" element={
                        <ProtectedRoute><BankStatements /></ProtectedRoute>
                    } />
                    <Route path="/bank-statements/:id" element={
                        <ProtectedRoute><BankStatementDetail /></ProtectedRoute>
                    } />
                    <Route path="/reconciliation" element={
                        <ProtectedRoute><Reconciliation /></ProtectedRoute>
                    } />
                    <Route path="/trash" element={
                        <ProtectedRoute><Trash /></ProtectedRoute>
                    } />
                    <Route path="/files" element={
                        <ProtectedRoute><Files /></ProtectedRoute>
                    } />
                    <Route path="/settings" element={
                        <ProtectedRoute><Settings /></ProtectedRoute>
                    } />

                    {/* Catch-all */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
                </Suspense>
                <OnboardingWizard />
                <TutorialOverlay />
            </OnboardingProvider>
            </CategoryProvider>
            </ThemeProvider>
            </AuthProvider>
            </LanguageProvider>
        </Router>
    );
}

export default App;
