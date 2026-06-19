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

const PAGE_TITLES: Record<string, string> = {
  '/companies':     '🏢 Company Intelligence',
  '/network':       '🔗 Network Intelligence',
  '/interview':     '🧠 Interview Prep',
  '/guide':         '📖 Success Guide',
};

/* ── Mobile nav config ───────────────────────────────────── */
const MOB_NAV = [
  { href: '/',               icon: '🏠', label: 'Home'      },
  { href: '/companies',      icon: '🏢', label: 'Companies' },
  { href: '/network',        icon: '🔗', label: 'Network'   },
  { href: '/interview',      icon: '🧠', label: 'Interview' },
  { href: '/guide',          icon: '📖', label: 'Guide'     },
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

          {/* Left: Home / Logo */}
          <a
            href="/"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)',
              textDecoration: 'none', flexShrink: 0,
            }}
          >
            🎯 HireSense
          </a>

          {/* Center: Desktop Nav */}
          <nav className="desktop-nav-links" style={{ gap: '1.5rem', alignItems: 'center' }}>
            {MOB_NAV.map((item) => {
              if (item.href === '/') return null; // Skip Home in desktop nav
              const isActive = pathname === item.href;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  style={{
                    textDecoration: 'none',
                    fontSize: '0.85rem',
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    borderBottom: isActive ? '2px solid var(--text-primary)' : '2px solid transparent',
                    paddingBottom: '0.2rem',
                    transition: 'all 0.2s',
                  }}
                >
                  {item.icon} {item.label}
                </a>
              );
            })}
          </nav>

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
