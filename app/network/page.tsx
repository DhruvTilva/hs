import { NetworkGrowth } from '@/components/network-growth'

export const metadata = {
  title: 'Network Growth — HireSense',
  description: 'Discover AI/ML recruiters, HR managers, and hiring decision makers to grow your LinkedIn network.',
}

export default function NetworkPage() {
  return (
    <div style={{ backgroundColor: 'var(--bg-secondary)', minHeight: '100vh', color: 'var(--text-primary)' }}>
      <header className="sticky-header">
        <div style={{ maxWidth: '48rem', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <a href="/" style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)', textDecoration: 'none' }}>
                🎯 HireSense
              </a>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>/ Network Growth</span>
            </div>
            <a href="/" style={{ fontSize: '0.78rem', color: 'var(--accent)', textDecoration: 'none' }}>
              ← Home
            </a>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '48rem', margin: '0 auto', padding: '1rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.3rem', fontWeight: 800 }}>
            🔗 Network Growth
          </h1>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            AI/ML recruiters, hiring managers, and decision makers discovered today. Connect with them to grow your LinkedIn network.
          </p>
        </div>
        <NetworkGrowth />
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <a href="/" className="mobile-nav-item"><span className="mobile-nav-icon">🏠</span>Home</a>
        <a href="/opportunities" className="mobile-nav-item"><span className="mobile-nav-icon">💼</span>Jobs</a>
        <a href="/companies" className="mobile-nav-item"><span className="mobile-nav-icon">🏢</span>Companies</a>
        <a href="/network" className="mobile-nav-item" style={{ color: 'var(--accent)' }}><span className="mobile-nav-icon">🔗</span>Network</a>
        <a href="/tracker" className="mobile-nav-item"><span className="mobile-nav-icon">📋</span>Tracker</a>
        <a href="/discover" className="mobile-nav-item"><span className="mobile-nav-icon">🔭</span>Discover</a>
      </nav>
    </div>
  )
}
