/**
 * Landing Page - Invoice Manager B2C
 * ====================================
 * Modern SaaS landing page with dark green theme.
 * Sections: Navbar, Hero, Features, How It Works, CTA, Footer
 * Supports TR/EN via translations.ts
 */

import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLang } from '../../shared/i18n';
import './LandingPage.scss';
import './LandingEffects.scss';
import {
    UploadExpensesIll, UploadBankIll, MatchingIll, Ci,
    EuHostingIll, GdprIll, EncryptionIll, AccessControlIll, TransparencyIll,
} from './LandingIllustrations';

/* ── Animated Section Wrapper ──────────────────────── */

const FadeInSection: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) setVisible(true); },
            { threshold: 0.15 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return (
        <div ref={ref} className={`fade-section ${visible ? 'visible' : ''} ${className || ''}`}>
            {children}
        </div>
    );
};

/* ── Main Component ────────────────────────────────── */

const LandingPage: React.FC = () => {
    const [scrolled, setScrolled] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const { t, lang, setLang } = useLang();
    const [zoom, setZoom] = useState<{ cx: number; cy: number; bg: string } | null>(null);
    const navigate = useNavigate();

    const toggleLang = () => {
        setLang(lang === 'tr' ? 'en' : 'tr');
    };

    const handleZoomNavigate = (e: React.MouseEvent, to: string, bg = '#fff') => {
        const r = e.currentTarget.getBoundingClientRect();
        setZoom({ cx: r.left + r.width / 2, cy: r.top + r.height / 2, bg });
        sessionStorage.setItem('zoom_transition', bg === '#fff' ? 'white' : 'green');
        setTimeout(() => navigate(to), 1100);
    };

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const scrollTo = (id: string) => {
        setMenuOpen(false);
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    };

    const cmpRows = [
        [t('cmp1'), 'y','n','n'], [t('cmp2'), 'y','n','y'], [t('cmp3'), 'y','y','n'], [t('cmp4'), 'y','n','p'],
        [t('cmp5'), 'y','n','n'], [t('cmp6'), 'y','p','n'], [t('cmp7'), 'y','y','n'], [t('cmp8'), 'y','y','n'],
    ];

    return (
        <div className="landing">
            {/* ── Navbar ── */}
            <nav className={`landing-nav ${scrolled ? 'scrolled' : ''}`}>
                <div className="landing-nav__inner">
                    <span className="landing-nav__logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                        Invoice<span className="logo-accent">Manager</span>
                    </span>

                    <button className="landing-nav__hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
                        <span /><span /><span />
                    </button>

                    <div className={`landing-nav__links ${menuOpen ? 'open' : ''}`}>
                        <button onClick={() => scrollTo('features')}>{t('navFeatures')}</button>
                        <button onClick={() => scrollTo('how-it-works')}>{t('navHowItWorks')}</button>
                        <button className="lang-toggle" onClick={toggleLang}>
                            {lang === 'tr' ? 'EN' : 'TR'}
                        </button>
                        <Link to="/login" className="landing-nav__link-text">{t('navLogin')}</Link>
                        <button className="landing-nav__cta-btn" onClick={(e) => handleZoomNavigate(e, '/register', 'linear-gradient(135deg, #065f46 0%, #047857 100%)')}>{t('navCta')}</button>
                    </div>
                </div>
            </nav>

            {/* ── Hero ── */}
            <section className="landing-hero">
                <div className="landing-hero__inner">
                    <div className="landing-hero__text">
                        <h1>
                            {t('heroTitlePre')}{' '}
                            <span className="text-highlight">{t('heroTitleHL')}</span>
                            {t('heroTitlePost') && ` ${t('heroTitlePost')}`}
                        </h1>
                        <p className="hero-tagline">
                            {t('heroTagPre')}{' '}
                            <span className="text-marker">{t('heroTagHL')}</span>
                        </p>
                        <p>{t('heroSubtitle')}</p>
                        <div className="landing-hero__buttons">
                            <button className="btn-primary" onClick={(e) => handleZoomNavigate(e, '/register')}>{t('heroCta')}</button>
                            <button className="btn-outline" onClick={() => scrollTo('how-it-works')}>
                                {t('heroHow')}
                            </button>
                        </div>
                    </div>

                    <div className="landing-hero__visual">
                        {/* Mockup first for CSS ~ sibling hover */}
                        <div className="dashboard-mockup">
                            <div className="mockup-bar">
                                <span /><span /><span />
                                <span className="mockup-title">Invoice Manager</span>
                            </div>
                            <div className="mockup-body">
                                <div className="mockup-sidebar">
                                    <div className="mockup-nav-item active" />
                                    <div className="mockup-nav-item" />
                                    <div className="mockup-nav-item" />
                                    <div className="mockup-sidebar-spacer" />
                                    <div className="mockup-nav-item" />
                                </div>
                                <div className="mockup-main">
                                    {/* Mini stat cards */}
                                    <div className="m-stats">
                                        <div className="m-stat-card">
                                            <div className="m-stat-value">24</div>
                                            <div className="m-stat-bar"><div className="m-stat-fill" style={{width: '75%'}} /></div>
                                        </div>
                                        <div className="m-stat-card">
                                            <div className="m-stat-value m-stat-green">18</div>
                                            <div className="m-stat-bar"><div className="m-stat-fill m-fill-green" style={{width: '90%'}} /></div>
                                        </div>
                                        <div className="m-stat-card">
                                            <div className="m-stat-value m-stat-blue">{lang === 'tr' ? '₺12.4K' : '$12.4K'}</div>
                                            <svg className="m-mini-chart" viewBox="0 0 60 20"><polyline points="0,18 10,14 20,16 30,8 40,10 50,4 60,6" fill="none" stroke="#10b981" strokeWidth="1.5" /></svg>
                                        </div>
                                    </div>
                                    {/* Toolbar */}
                                    <div className="m-toolbar">
                                        <div className="m-search" />
                                        <div className="m-btn m-upload">Upload</div>
                                        <div className="m-btn m-export">Excel</div>
                                    </div>
                                    {/* Table */}
                                    <div className="m-table">
                                        <div className="m-row m-thead">
                                            <span>Supplier</span><span>Date</span>
                                            <span>Total</span><span>Cat.</span><span>Status</span>
                                        </div>
                                        <div className="m-row">
                                            <span /><span /><span />
                                            <span className="m-cat-dot m-cat-food" />
                                            <span className="m-badge m-ai">AI</span>
                                        </div>
                                        <div className="m-row">
                                            <span /><span /><span />
                                            <span className="m-cat-dot m-cat-fuel" />
                                            <span className="m-badge m-ok" />
                                        </div>
                                        <div className="m-row">
                                            <span /><span /><span />
                                            <span className="m-cat-dot m-cat-office" />
                                            <span className="m-badge m-ai">AI</span>
                                        </div>
                                        <div className="m-row">
                                            <span /><span /><span />
                                            <span className="m-cat-dot m-cat-food" />
                                            <span className="m-badge m-ok" />
                                        </div>
                                        <div className="m-row">
                                            <span /><span /><span />
                                            <span className="m-cat-dot m-cat-transport" />
                                            <span className="m-badge m-warn">!</span>
                                        </div>
                                        <div className="m-row">
                                            <span /><span /><span />
                                            <span className="m-cat-dot m-cat-fuel" />
                                            <span className="m-badge m-ok" />
                                        </div>
                                        <div className="m-row">
                                            <span /><span /><span />
                                            <span className="m-cat-dot m-cat-office" />
                                            <span className="m-badge m-ai">AI</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        {/* Floating docs: scatter on mockup hover via ~ selector */}
                        <div className="floating-doc fd-1">
                            <span className="fd-type">PDF</span>
                            <span className="fd-line" /><span className="fd-line w60" />
                            <span className="fd-amt">{lang === 'tr' ? '₺1,245' : '$1,245'}</span>
                        </div>
                        <div className="floating-doc fd-2">
                            <span className="fd-type fd-inv">INV</span>
                            <span className="fd-line" /><span className="fd-line w80" />
                            <span className="fd-amt">{lang === 'tr' ? '₺890' : '$890'}</span>
                        </div>
                        <div className="floating-doc fd-3">
                            <span className="fd-type fd-xls">XLS</span>
                            <span className="fd-line" /><span className="fd-line w50" />
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Features ── */}
            <section className="landing-features" id="features">
                <FadeInSection>
                    <h2 className="fancy-heading">
                        {t('featuresTitlePre')}{' '}
                        <span className="text-circle">{t('featuresTitleHL')}{t('featuresTitlePost')}</span>
                    </h2>
                    <div className="landing-features__grid">
                        <div className="feature-card fc-ocr">
                            <UploadExpensesIll />
                            <h3>{t('feature1Title')}</h3>
                            <p>{t('feature1Desc')}</p>
                        </div>
                        <div className="feature-card fc-cat">
                            <UploadBankIll />
                            <h3>{t('feature2Title')}</h3>
                            <p>{t('feature2Desc')}</p>
                        </div>
                        <div className="feature-card fc-exp">
                            <MatchingIll />
                            <h3>{t('feature3Title')}</h3>
                            <p>{t('feature3Desc')}</p>
                        </div>
                    </div>
                </FadeInSection>
            </section>

            {/* ── Story ── */}
            <section className="landing-story">
                <FadeInSection>
                    <div className="story-inner">
                        <div className="story-left">
                            <span className="story-badge">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                                </svg>
                                {t('storyTitle')}
                            </span>
                            <p className="story-lead">{t('storyP1')}</p>
                        </div>
                        <div className="story-right">
                            <div className="story-card story-card--warn">
                                <p>{t('storyHighlight')}</p>
                            </div>
                            <p className="story-text">{t('storyP2')}</p>
                            <div className="story-card story-card--solution">
                                <p>{t('storyP3')}</p>
                            </div>
                            <p className="story-text">{t('storyP4')}</p>
                            <p className="story-cta">{t('storyP5')}</p>
                        </div>
                    </div>
                </FadeInSection>
            </section>

            {/* ── Security ── */}
            <section className="landing-security">
                <div className="sec-bg" />
                <FadeInSection>
                    <h2 className="sec-title">{t('secTitle')}</h2>
                    <div className="sec-grid">
                        <div className="sec-card">
                            <EuHostingIll />
                            <h3>{t('sec1Title')}</h3>
                            <p>{t('sec1Desc')}</p>
                        </div>
                        <div className="sec-card">
                            <GdprIll />
                            <h3>{t('sec2Title')}</h3>
                            <p>{t('sec2Desc')}</p>
                        </div>
                        <div className="sec-card">
                            <EncryptionIll />
                            <h3>{t('sec3Title')}</h3>
                            <p>{t('sec3Desc')}</p>
                        </div>
                        <div className="sec-card">
                            <AccessControlIll />
                            <h3>{t('sec4Title')}</h3>
                            <p>{t('sec4Desc')}</p>
                        </div>
                        <div className="sec-card">
                            <TransparencyIll />
                            <h3>{t('sec5Title')}</h3>
                            <p>{t('sec5Desc')}</p>
                        </div>
                    </div>
                </FadeInSection>
            </section>

            {/* ── Comparison ── */}
            <section className="landing-compare">
                <FadeInSection>
                    <h2 className="fancy-heading">
                        {t('cmpTitlePre')}{' '}
                        <span className="text-underline">{t('cmpTitleHL')}</span>
                    </h2>
                    {/* Floating stat pills */}
                    <div className="cmp-pill fp-1"><strong>{'>'}%90</strong> {t('cmpS1')}</div>
                    <div className="cmp-pill fp-2"><strong>3x</strong> {t('cmpS2')}</div>
                    <div className="cmp-pill fp-3"><strong>{'<'}5sn</strong> {t('cmpS3')}</div>
                    <div className="cmp-pill fp-4"><strong>2+</strong> {t('cmpS4')}</div>
                    <div className="cmp-intro">
                        <p className="cmp-subtitle">{t('cmpSubtitle')}</p>
                        <div className="cmp-accuracy">
                            {([['Invoice Manager', 97, true], ['Google Document AI', 80, false], ['Gemini Pro', 75, false], ['ChatGPT Vision', 72, false]] as [string, number, boolean][]).map(([name, pct, ours], i) => (
                                <div className={`cmp-bar ${ours ? 'ours' : ''}`} key={i}>
                                    <span className="cmp-bar-name">{name}</span>
                                    <div className="cmp-bar-track"><div className="cmp-bar-fill" style={{width: `${pct}%`}} /></div>
                                    <span className="cmp-bar-pct">{pct}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="compare-grid">
                        <div className="cg-corner" />
                        <div className="cg-head cg-us">Invoice Manager</div>
                        <div className="cg-head">Wave</div>
                        <div className="cg-head">Hubdoc</div>
                        {cmpRows.map(([label, us, w, h], i) => (
                            <React.Fragment key={i}>
                                <div className="cg-label">{label}</div>
                                <div className="cg-cell cg-us"><Ci v={us} /></div>
                                <div className="cg-cell"><Ci v={w} /></div>
                                <div className="cg-cell"><Ci v={h} /></div>
                            </React.Fragment>
                        ))}
                        <div className="cg-label cg-total" />
                        <div className="cg-cell cg-us cg-total"><strong>8</strong>/8</div>
                        <div className="cg-cell cg-total">3/8</div>
                        <div className="cg-cell cg-total">1/8</div>
                    </div>
                </FadeInSection>
            </section>

            {/* ── How It Works ── */}
            <section className="landing-steps" id="how-it-works">
                <FadeInSection>
                    <h2 className="fancy-heading">
                        <span className="text-underline">{t('stepsTitleHL')}</span>
                        {' '}{t('stepsTitlePost')}
                    </h2>
                    <div className="landing-steps__grid">
                        <div className="step-card">
                            <svg className="step-visual" viewBox="0 0 100 80">
                                <rect x="18" y="5" width="64" height="70" rx="6" fill="#f0fdf4" stroke="#d1fae5" strokeWidth="1.5" />
                                <circle cx="50" cy="20" r="9" fill="#d1fae5" />
                                <rect x="28" y="36" width="44" height="7" rx="3" fill="#e5e7eb" />
                                <rect x="28" y="48" width="44" height="7" rx="3" fill="#e5e7eb" />
                                <rect x="32" y="60" width="36" height="9" rx="4" fill="#059669" />
                            </svg>
                            <div className="step-number">1</div>
                            <h3>{t('step1Title')}</h3>
                            <p>{t('step1Desc')}</p>
                        </div>
                        <div className="step-card">
                            <svg className="step-visual sv-upload" viewBox="0 0 100 80">
                                <rect x="20" y="15" width="60" height="50" rx="8" fill="none" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4,3" />
                                <g className="upload-file">
                                    <rect x="38" y="6" width="24" height="28" rx="2" fill="#fff" stroke="#9ca3af" />
                                    <path d="M52 6 L62 16 L52 16Z" fill="#e5e7eb" />
                                    <path d="M50 42 L50 54 M45 50 L50 55 L55 50" stroke="#10b981" strokeWidth="2" strokeLinecap="round" fill="none" />
                                </g>
                                <circle className="upload-done" cx="50" cy="40" r="15" fill="#059669" />
                                <path className="upload-done" d="M42 40 L47 45 L58 34" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            </svg>
                            <div className="step-number">2</div>
                            <h3>{t('step2Title')}</h3>
                            <p>{t('step2Desc')}</p>
                        </div>
                        <div className="step-card">
                            <svg className="step-visual sv-manage" viewBox="0 0 100 80">
                                <rect x="22" y="30" width="50" height="20" rx="6" fill="#059669" />
                                <text x="47" y="43" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700">Edit</text>
                                <path d="M56 42 L56 56 L60 52 L64 58 L66 57 L62 51 L67 49Z" fill="#fff" stroke="#111827" strokeWidth="0.8" />
                                <g className="manage-sparks">
                                    <line x1="47" y1="24" x2="47" y2="16" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
                                    <line x1="32" y1="28" x2="26" y2="22" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
                                    <line x1="62" y1="28" x2="68" y2="22" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
                                    <line x1="16" y1="40" x2="8" y2="40" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
                                    <line x1="78" y1="40" x2="86" y2="40" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
                                </g>
                            </svg>
                            <div className="step-number">3</div>
                            <h3>{t('step3Title')}</h3>
                            <p>{t('step3Desc')}</p>
                        </div>
                        {/* Animated arrows drawn between steps */}
                        <svg className="step-arrow arrow-1" viewBox="0 0 120 60" fill="none">
                            <path className="arrow-path" d="M8 52 Q60 0 112 20" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
                            <polygon className="arrow-head" points="112,20 101,13 104,24" fill="#10b981" />
                        </svg>
                        <svg className="step-arrow arrow-2" viewBox="0 0 120 60" fill="none">
                            <path className="arrow-path" d="M8 48 Q60 -2 112 18" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
                            <polygon className="arrow-head" points="112,18 101,11 104,22" fill="#10b981" />
                        </svg>
                    </div>
                </FadeInSection>
            </section>

            {/* ── CTA Banner ── */}
            <section className="landing-cta">
                <FadeInSection>
                    <h2 className="fancy-heading">
                        {t('ctaTitlePre')}{' '}
                        <span className="text-marker">{t('ctaTitleHL')}</span>
                    </h2>
                    <p>{t('ctaSubtitle')}</p>
                    <Link to="/register" className="btn-primary btn-lg">{t('ctaButton')}</Link>
                </FadeInSection>
            </section>

            {/* ── Footer ── */}
            <footer className="landing-footer">
                <div className="landing-footer__inner">
                    <span className="landing-footer__brand">
                        Invoice Manager &nbsp;&middot;&nbsp; &copy; 2026 Gordian Analytics
                    </span>
                    <div className="landing-footer__links">
                        <button onClick={() => scrollTo('features')}>{t('footerFeatures')}</button>
                        <Link to="/login">{t('footerLogin')}</Link>
                        <Link to="/register">{t('footerRegister')}</Link>
                    </div>
                </div>
            </footer>

            {/* Zoom-in page transition overlay */}
            {zoom && (
                <div
                    className="zoom-transition"
                    style={{ '--zx': `${zoom.cx}px`, '--zy': `${zoom.cy}px`, background: zoom.bg } as React.CSSProperties}
                />
            )}
        </div>
    );
};

export default LandingPage;
