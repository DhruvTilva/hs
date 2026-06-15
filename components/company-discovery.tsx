'use client'

import { useEffect, useState } from 'react'
import {
  buildLinkedInSearchUrl,
  buildOutreachMessage,
  getRedFlags,
  getPotentialLabel,
} from '@/lib/discovery'
import type { DiscoveredCompany, DiscoveryStats } from '@/lib/types'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

function ScoreBadge({ score, tier }: { score: number; tier: string | null }) {
  const colors: Record<string, { bg: string; color: string }> = {
    high:   { bg: '#fef2f2', color: '#dc2626' },
    medium: { bg: '#fefce8', color: '#ca8a04' },
    low:    { bg: '#f0fdf4', color: '#16a34a' },
  }
  const style = colors[tier ?? 'low'] ?? colors.low
  return (
    <span style={{
      background: style.bg, color: style.color,
      border: `1px solid ${style.color}30`,
      borderRadius: '9999px', padding: '0.15rem 0.6rem',
      fontSize: '0.72rem', fontWeight: 700, flexShrink: 0,
    }}>
      {score} · {getPotentialLabel(tier ?? 'low')}
    </span>
  )
}

function SkeletonCard() {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: '1rem', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem',
    }}>
      {[100, 60, 80, 40].map((w) => (
        <div key={w} style={{
          height: '0.85rem', width: `${w}%`,
          background: 'var(--border)', borderRadius: '9999px',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
    </div>
  )
}

export function CompanyDiscovery() {
  const [companies, setCompanies] = useState<DiscoveredCompany[]>([])
  const [stats, setStats] = useState<DiscoveryStats | null>(null)
  const [loading, setLoading] = useState(true)

  // Filters
  const [tierFilter, setTierFilter]   = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all') // all | added | reached | not-added
  const [sortBy, setSortBy]           = useState<string>('score')

  // Per-card state
  const [localState, setLocalState] = useState<Record<string, {
    added?: boolean; reached?: boolean; skipped?: boolean; notes?: string; copying?: boolean; saving?: boolean;
  }>>({})

  const [scanState, setScanState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ sort: sortBy })
      if (tierFilter !== 'all') params.set('tier', tierFilter)
      if (statusFilter === 'added')     params.set('added', 'true')
      if (statusFilter === 'not-added') params.set('added', 'false')
      const res = await fetch(`/api/discover?${params}`)
      if (!res.ok) throw new Error('fetch failed')
      const json = await res.json() as {
        companies: DiscoveredCompany[]
        total: number; high: number; medium: number; low: number
        added: number; reached_out: number
      }
      setCompanies(json.companies)
      setStats({ total: json.total, high: json.high, medium: json.medium, low: json.low, added: json.added, reached_out: json.reached_out })
    } catch {
      setCompanies([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [tierFilter, statusFilter, sortBy]) // eslint-disable-line react-hooks/exhaustive-deps

  async function patch(id: string, updates: Record<string, unknown>) {
    await fetch('/api/discover/company', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })
  }

  function setState(id: string, partial: Record<string, unknown>) {
    setLocalState((prev) => ({ ...prev, [id]: { ...prev[id], ...partial } }))
  }

  async function handleAddToWatchlist(c: DiscoveredCompany) {
    setState(c.id, { saving: true })
    await patch(c.id, { added_to_watchlist: true })
    setState(c.id, { added: true, saving: false })
  }

  async function handleSkip(c: DiscoveredCompany) {
    await patch(c.id, { skip: true })
    setState(c.id, { skipped: true })
  }

  async function handleReachedOut(c: DiscoveredCompany) {
    await patch(c.id, { reached_out: true })
    setState(c.id, { reached: true })
  }

  async function handleCopyOutreach(c: DiscoveredCompany) {
    const msg = buildOutreachMessage(c.name)
    await navigator.clipboard.writeText(msg)
    setState(c.id, { copying: true })
    setTimeout(() => setState(c.id, { copying: false }), 2000)
  }

  async function handleSaveNotes(c: DiscoveredCompany, notes: string) {
    await patch(c.id, { notes })
  }

  async function handleRunScan() {
    setScanState('loading')
    try {
      const res = await fetch('/api/discover/scan', { method: 'POST' })
      setScanState(res.ok ? 'success' : 'error')
    } catch {
      setScanState('error')
    }
    setTimeout(() => setScanState('idle'), 6000)
  }

  const visibleCompanies = companies.filter((c) => {
    const ls = localState[c.id] ?? {}
    if (ls.skipped) return false
    if (statusFilter === 'reached') return c.reached_out || ls.reached
    return true
  })

  /* ── RENDER ─────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Stats bar */}
      {stats && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
          gap: '0.5rem',
        }}>
          {[
            { label: 'Total Found', value: stats.total, color: 'var(--accent)' },
            { label: '🔴 High',      value: stats.high,  color: '#dc2626' },
            { label: '🟡 Monitor',   value: stats.medium, color: '#ca8a04' },
            { label: '✅ Added',     value: stats.added,  color: '#16a34a' },
            { label: '📤 Reached',   value: stats.reached_out, color: 'var(--accent)' },
          ].map((s) => (
            <div key={s.label} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '0.75rem', padding: '0.6rem 0.75rem', textAlign: 'center',
            }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
        {/* Tier filters */}
        {[
          { val: 'all',    label: 'All' },
          { val: 'high',   label: '🔴 High' },
          { val: 'medium', label: '🟡 Monitor' },
          { val: 'low',    label: '🟢 Early' },
        ].map((f) => (
          <button key={f.val} onClick={() => setTierFilter(f.val)} style={{
            padding: '0.25rem 0.7rem', fontSize: '0.75rem', borderRadius: '9999px', cursor: 'pointer',
            border: tierFilter === f.val ? 'none' : '1px solid var(--border)',
            background: tierFilter === f.val ? 'var(--accent)' : 'var(--bg-card)',
            color: tierFilter === f.val ? '#fff' : 'var(--text-secondary)',
            fontWeight: tierFilter === f.val ? 700 : 400,
          }}>{f.label}</button>
        ))}

        <div style={{ width: '1px', height: '1.2rem', background: 'var(--border)', flexShrink: 0 }} />

        {/* Status filters */}
        {[
          { val: 'all',       label: 'All Status' },
          { val: 'not-added', label: 'Not Added' },
          { val: 'added',     label: 'Added ✅' },
          { val: 'reached',   label: 'Reached Out 📤' },
        ].map((f) => (
          <button key={f.val} onClick={() => setStatusFilter(f.val)} style={{
            padding: '0.25rem 0.7rem', fontSize: '0.75rem', borderRadius: '9999px', cursor: 'pointer',
            border: statusFilter === f.val ? 'none' : '1px solid var(--border)',
            background: statusFilter === f.val ? 'var(--text-secondary)' : 'var(--bg-card)',
            color: statusFilter === f.val ? '#fff' : 'var(--text-secondary)',
            fontWeight: statusFilter === f.val ? 700 : 400,
          }}>{f.label}</button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '0.5rem',
              border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            <option value="score">Score ↓</option>
            <option value="date">Date Found ↓</option>
          </select>
        </div>
      </div>

      {/* Cards */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      ) : visibleCompanies.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '1rem', padding: '2.5rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔭</div>
          <p style={{ margin: '0 0 0.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            No companies discovered yet.
          </p>
          <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Run the discovery scanner to find hidden AI/ML companies in Ahmedabad.
          </p>
          <button
            onClick={() => void handleRunScan()}
            disabled={scanState === 'loading'}
            style={{
              background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: '9999px', padding: '0.5rem 1.2rem',
              fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
            }}
          >
            {scanState === 'loading' ? 'Starting scan…' : '⚡ Run Discovery Scan'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {visibleCompanies.map((c) => {
            const ls = localState[c.id] ?? {}
            const isAdded    = ls.added    ?? c.added_to_watchlist
            const isReached  = ls.reached  ?? c.reached_out
            const redFlags   = getRedFlags(c as unknown as Record<string, unknown>)

            return (
              <div key={c.id} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: '1rem', overflow: 'hidden',
              }}>
                {/* Status banner */}
                {isAdded && (
                  <div style={{ background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', padding: '0.35rem 1rem', fontSize: '0.75rem', color: '#16a34a', fontWeight: 600 }}>
                    ✅ Added to Watch List
                  </div>
                )}
                {isReached && (
                  <div style={{ background: '#eff6ff', borderBottom: '1px solid #bfdbfe', padding: '0.35rem 1rem', fontSize: '0.75rem', color: '#2563eb', fontWeight: 600 }}>
                    📤 Reached Out {c.reached_out_date ? `· ${c.reached_out_date}` : ''}
                  </div>
                )}

                <div style={{ padding: '1rem' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{c.name}</span>
                    <ScoreBadge score={c.potential_score} tier={c.potential_tier} />
                  </div>

                  {/* Meta */}
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {c.location && `📍 ${c.location} · `}
                    📅 {timeAgo(c.discovered_at)}
                    {c.source && ` · via ${c.source}`}
                  </p>

                  {/* Signals */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', marginBottom: '0.5rem' }}>
                    {[
                      { ok: c.has_funding,           label: 'Has funding' },
                      { ok: c.has_technical_founder,  label: 'Technical founder detected' },
                      { ok: c.has_linkedin,           label: 'Active LinkedIn page' },
                      { ok: c.has_github,             label: 'GitHub activity found' },
                      { ok: c.news_mentions > 0,      label: `News mentions: ${c.news_mentions}` },
                      { ok: c.has_website,            label: 'Website found' },
                    ].map((s) => (
                      <span key={s.label} style={{ fontSize: '0.75rem', color: s.ok ? 'var(--text-secondary)' : '#dc2626' }}>
                        {s.ok ? '✅' : '❌'} {s.label}{!s.ok && redFlags.includes(`No ${s.label.toLowerCase()}`) ? ' (red flag)' : ''}
                      </span>
                    ))}
                  </div>

                  {/* AI/ML signals */}
                  {c.ai_ml_signals && (
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      🤖 Signals: {c.ai_ml_signals}
                    </p>
                  )}

                  {/* External links */}
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                    {c.website && (
                      <a href={c.website} target="_blank" rel="noopener noreferrer" style={linkBtnStyle}>
                        🌐 Website
                      </a>
                    )}
                    {c.linkedin_url && (
                      <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" style={linkBtnStyle}>
                        💼 LinkedIn
                      </a>
                    )}
                    {c.github_url && (
                      <a href={c.github_url} target="_blank" rel="noopener noreferrer" style={linkBtnStyle}>
                        💻 GitHub
                      </a>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                    <button
                      onClick={() => void handleAddToWatchlist(c)}
                      disabled={isAdded || ls.saving}
                      style={{
                        ...actionBtnStyle,
                        background: isAdded ? '#16a34a' : 'var(--accent)',
                        color: '#fff', border: 'none',
                        opacity: ls.saving ? 0.7 : 1,
                      }}
                    >
                      {isAdded ? '✓ Watching' : ls.saving ? 'Adding…' : '➕ Add to Watch List'}
                    </button>

                    <button
                      onClick={() => void handleCopyOutreach(c)}
                      style={{ ...actionBtnStyle, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    >
                      {ls.copying ? '✓ Copied!' : '📋 Copy Outreach'}
                    </button>

                    <a
                      href={buildLinkedInSearchUrl(c.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ ...actionBtnStyle, textDecoration: 'none', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center' }}
                    >
                      🔍 Find Contacts
                    </a>
                  </div>

                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                    {!isReached && (
                      <button
                        onClick={() => void handleReachedOut(c)}
                        style={{ ...actionBtnStyle, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb' }}
                      >
                        ✓ Mark Reached Out
                      </button>
                    )}
                    <button
                      onClick={() => void handleSkip(c)}
                      style={{ ...actionBtnStyle, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
                    >
                      ✗ Skip
                    </button>
                  </div>

                  {/* Notes */}
                  <textarea
                    placeholder="Add notes…"
                    defaultValue={c.notes ?? ''}
                    onBlur={(e) => void handleSaveNotes(c, e.target.value)}
                    rows={2}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      fontSize: '0.75rem', padding: '0.4rem 0.6rem',
                      border: '1px solid var(--border)', borderRadius: '0.5rem',
                      background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                      resize: 'vertical', fontFamily: 'inherit',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const linkBtnStyle: React.CSSProperties = {
  fontSize: '0.72rem', padding: '0.2rem 0.55rem',
  borderRadius: '9999px', border: '1px solid var(--border)',
  color: 'var(--text-secondary)', textDecoration: 'none',
  background: 'var(--bg-secondary)',
}

const actionBtnStyle: React.CSSProperties = {
  fontSize: '0.75rem', padding: '0.3rem 0.75rem',
  borderRadius: '9999px', cursor: 'pointer', fontWeight: 500,
}
