'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

/* ── ThemeToggle ─────────────────────────────────────────── */
function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('hiresense-theme', next ? 'dark' : 'light'); } catch {}
  }

  if (!mounted) return null;

  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      style={{
        background: 'none',
        border: '1px solid var(--border)',
        borderRadius: '9999px',
        padding: '0.2rem 0.55rem',
        fontSize: '1rem',
        cursor: 'pointer',
        color: 'var(--text-secondary)',
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {dark ? '☀️' : '🌙'}
    </button>
  );
}

/* ── Page title map ──────────────────────────────────────── */
const PAGE_TITLES: Record<string, string> = {
  '/opportunities': '💼 All Opportunities',
  '/companies':     '🏢 Company Watch List',
  '/proactive':     '🎯 Proactive Outreach',
  '/tracker':       '📋 Application Tracker',
  '/interview':     '🎯 Interview Intelligence',
  '/discover':      '🔭 Company Discovery',
};

/* ── Mobile nav config ───────────────────────────────────── */
const MOB_NAV = [
  { href: '/',               icon: '🏠', label: 'Home'      },
  { href: '/opportunities',  icon: '💼', label: 'Jobs'      },
  { href: '/companies',      icon: '🏢', label: 'Companies' },
  { href: '/tracker',        icon: '📋', label: 'Tracker'   },
  { href: '/interview',      icon: '🎯', label: 'Interview' },
  { href: '/discover',      icon: '🔭', label: 'Discover' },
];

/* ── AppShell ────────────────────────────────────────────── */
export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const pageTitle = PAGE_TITLES[pathname] ?? title;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>

      {/* ── Sticky header ── */}
      <header className="sticky-header">
        <div style={{ maxWidth: '72rem', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>

          {/* Left: back link */}
          <a
            href="/"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)',
              textDecoration: 'none', flexShrink: 0,
              border: '1px solid var(--border)', borderRadius: '9999px',
              padding: '0.25rem 0.65rem',
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseOver={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent)';
              (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--accent)';
            }}
            onMouseOut={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)';
              (e.currentTarget as HTMLAnchorElement).style.borderColor = 'var(--border)';
            }}
          >
            ← Home
          </a>

          {/* Center: page title */}
          <h1 style={{
            margin: 0, flex: 1, textAlign: 'center',
            fontSize: 'clamp(0.9rem, 3vw, 1.1rem)', fontWeight: 700,
            color: 'var(--text-primary)', lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {pageTitle}
          </h1>

          {/* Right: dark mode toggle */}
          <ThemeToggle />
        </div>

        {/* Subtitle (optional) */}
        {subtitle && (
          <div style={{ maxWidth: '72rem', margin: '0.2rem auto 0', paddingLeft: 0 }}>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              {subtitle}
            </p>
          </div>
        )}
      </header>

      {/* ── Page content ── */}
      <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '1rem 1rem 2.5rem' }}>
        <main className="page-content">
          {children}
        </main>
      </div>

      {/* ── Mobile bottom nav (active page highlighted) ── */}
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {MOB_NAV.map((item) => {
          const isActive = pathname === item.href;
          return (
            <a
              key={item.href}
              href={item.href}
              className={`mobile-nav-item${isActive ? ' active' : ''}`}
            >
              <span className="mobile-nav-icon">{item.icon}</span>
              {item.label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
