'use client'

import { useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { CompanyDiscovery } from '@/components/company-discovery'

const SCORE_BREAKDOWN = [
  { label: 'Has funding',          points: '+30' },
  { label: 'LinkedIn present',     points: '+15' },
  { label: 'Real website',         points: '+15' },
  { label: 'Technical founder',    points: '+15' },
  { label: 'GitHub activity',      points: '+10' },
  { label: 'News mentions',        points: '+10' },
  { label: 'Team size 3+',         points: '+10' },
  { label: 'Government grant',     points: '+5'  },
]

export default function DiscoverPage() {
  const [scanState, setScanState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [legendOpen, setLegendOpen] = useState(false)

  async function handleScan() {
    setScanState('loading')
    try {
      const res = await fetch('/api/discover/scan', { method: 'POST' })
      setScanState(res.ok ? 'success' : 'error')
    } catch {
      setScanState('error')
    }
    setTimeout(() => setScanState('idle'), 8000)
  }

  return (
    <AppShell title="🔭 Company Discovery" subtitle="Hidden AI/ML companies in Ahmedabad, Gandhinagar & GIFT City">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* Info banner */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '0.75rem', padding: '0.75rem 1rem',
          fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5,
        }}>
          <strong style={{ color: 'var(--text-primary)' }}>📡 About this page</strong><br />
          Companies here are discovered from Startup India, GIFT City directory, and Google News — not job boards.
          These companies may not have posted jobs yet. Reach out proactively before they post.
        </div>

        {/* Scan section */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '0.75rem', padding: '0.75rem 1rem',
          display: 'flex', flexWrap: 'wrap', alignItems: 'center',
          justifyContent: 'space-between', gap: '0.75rem',
        }}>
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              ⚡ Run Discovery Scan
            </p>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Runs automatically every Sunday at 6 AM IST
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
            <button
              onClick={() => void handleScan()}
              disabled={scanState === 'loading'}
              style={{
                background: scanState === 'success' ? '#16a34a'
                  : scanState === 'error'   ? '#dc2626'
                  : 'var(--accent)',
                color: '#fff', border: 'none', borderRadius: '9999px',
                padding: '0.4rem 1rem', fontSize: '0.78rem', fontWeight: 600,
                cursor: scanState === 'loading' ? 'not-allowed' : 'pointer',
                opacity: scanState === 'loading' ? 0.7 : 1,
              }}
            >
              {scanState === 'idle'    && '⚡ Run Now'}
              {scanState === 'loading' && 'Starting…'}
              {scanState === 'success' && '✓ Triggered!'}
              {scanState === 'error'   && '✗ Failed'}
            </button>
            {scanState === 'success' && (
              <p style={{ margin: 0, fontSize: '0.7rem', color: '#16a34a' }}>
                Scanner running in background. Check back in 5-10 minutes.
              </p>
            )}
          </div>
        </div>

        {/* Potential Score Legend */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '0.75rem', overflow: 'hidden',
        }}>
          <button
            onClick={() => setLegendOpen((v) => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.65rem 1rem', background: 'none', border: 'none',
              cursor: 'pointer', color: 'var(--text-primary)', fontSize: '0.82rem', fontWeight: 600,
            }}
          >
            <span>ℹ️ How is Potential Score calculated?</span>
            <span style={{ color: 'var(--text-muted)' }}>{legendOpen ? '▲' : '▼'}</span>
          </button>
          {legendOpen && (
            <div style={{ padding: '0 1rem 0.75rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: '0.35rem' }}>Signal</th>
                    <th style={{ textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: '0.35rem' }}>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {SCORE_BREAKDOWN.map((row) => (
                    <tr key={row.label}>
                      <td style={{ padding: '0.2rem 0', color: 'var(--text-secondary)' }}>{row.label}</td>
                      <td style={{ textAlign: 'right', color: 'var(--accent)', fontWeight: 700 }}>{row.points}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={2} style={{ borderTop: '1px solid var(--border)', paddingTop: '0.4rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Max score: 100 · High ≥ 70 · Monitor ≥ 40 · Too Early &lt; 40
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Main company list */}
        <CompanyDiscovery />
      </div>
    </AppShell>
  )
}
