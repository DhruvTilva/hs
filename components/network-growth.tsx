'use client'

import { useEffect, useState } from 'react'

/* ── Types ──────────────────────────────────────────────────── */
interface RecruiterProfile {
  id: string
  name: string
  linkedin_url: string
  company: string | null
  headline: string | null
  location: string | null
  category: string | null
  discovered_at: string
}

interface NetworkData {
  profiles: RecruiterProfile[]
  today_count: number
  all_time_count: number
  by_category: Record<string, number>
  by_location: Record<string, number>
}

/* ── Helpers ─────────────────────────────────────────────────── */
const categoryLabels: Record<string, { label: string; emoji: string; color: string }> = {
  ai_ml_recruiter:  { label: 'AI/ML Recruiter', emoji: '🎯', color: '#6366f1' },
  hiring_manager:   { label: 'Hiring Manager',  emoji: '👔', color: '#0891b2' },
  founder:          { label: 'Founder / CTO',   emoji: '🚀', color: '#dc2626' },
}

function getCategoryInfo(cat: string | null) {
  return categoryLabels[cat ?? ''] ?? { label: cat ?? 'Unknown', emoji: '👤', color: 'var(--text-muted)' }
}

const locationOrder = ['Ahmedabad', 'Gandhinagar', 'GIFT City', 'Gujarat', 'Remote']

function locationPriority(loc: string | null): number {
  const idx = locationOrder.findIndex((l) => (loc ?? '').toLowerCase().includes(l.toLowerCase()))
  return idx >= 0 ? idx : 99
}

/* ── Skeleton ────────────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: '1rem', padding: '1rem',
      display: 'flex', flexDirection: 'column', gap: '0.5rem',
    }}>
      {[100, 60, 80].map((w) => (
        <div key={w} style={{
          height: '0.85rem', width: `${w}%`,
          background: 'var(--border)', borderRadius: '9999px',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
    </div>
  )
}

/* ── Main Component ──────────────────────────────────────────── */
export function NetworkGrowth() {
  const [data, setData] = useState<NetworkData | null>(null)
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [copyState, setCopyState] = useState<Record<string, boolean>>({})

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/network')
        if (!res.ok) throw new Error('fetch failed')
        const json = (await res.json()) as NetworkData
        // Sort by location priority
        json.profiles.sort((a, b) => locationPriority(a.location) - locationPriority(b.location))
        setData(json)
      } catch {
        setData(null)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  async function handleCopyMessage(profile: RecruiterProfile) {
    const msg = `Hi ${profile.name.split(' ')[0]}, I noticed you're actively involved in AI/ML hiring${profile.company ? ` at ${profile.company}` : ''}. I'm an AI/ML engineer based in Ahmedabad with experience in LLMs, NLP, and production ML systems. Would love to connect and be on your radar for any relevant roles!`
    await navigator.clipboard.writeText(msg)
    setCopyState((prev) => ({ ...prev, [profile.id]: true }))
    setTimeout(() => setCopyState((prev) => ({ ...prev, [profile.id]: false })), 2000)
  }

  const profiles = data?.profiles ?? []
  const filtered = categoryFilter === 'all'
    ? profiles
    : profiles.filter((p) => p.category === categoryFilter)

  /* ── Render ─────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* ── Stats Bar ── */}
      {data && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
          gap: '0.5rem',
        }}>
          {[
            { label: "Today's Batch", value: data.today_count, color: 'var(--accent)' },
            { label: '🎯 Recruiters', value: data.by_category['ai_ml_recruiter'] ?? 0, color: '#6366f1' },
            { label: '👔 Managers', value: data.by_category['hiring_manager'] ?? 0, color: '#0891b2' },
            { label: '🚀 Founders', value: data.by_category['founder'] ?? 0, color: '#dc2626' },
            { label: '📈 All-Time', value: data.all_time_count, color: '#16a34a' },
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

      {/* ── Filter Bar ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
        {[
          { val: 'all', label: 'All' },
          { val: 'ai_ml_recruiter', label: '🎯 Recruiters' },
          { val: 'hiring_manager', label: '👔 Managers' },
          { val: 'founder', label: '🚀 Founders' },
        ].map((f) => (
          <button key={f.val} onClick={() => setCategoryFilter(f.val)} style={{
            padding: '0.25rem 0.7rem', fontSize: '0.75rem', borderRadius: '9999px', cursor: 'pointer',
            border: categoryFilter === f.val ? 'none' : '1px solid var(--border)',
            background: categoryFilter === f.val ? 'var(--accent)' : 'var(--bg-card)',
            color: categoryFilter === f.val ? '#fff' : 'var(--text-secondary)',
            fontWeight: categoryFilter === f.val ? 700 : 400,
          }}>{f.label}</button>
        ))}

        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Showing {filtered.length} profiles
        </span>
      </div>

      {/* ── Profile Cards ── */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '1rem', padding: '2.5rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔗</div>
          <p style={{ margin: '0 0 0.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            No profiles discovered yet
          </p>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Run the Network Growth scraper to discover AI/ML recruiters and hiring managers.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {filtered.map((profile) => {
            const catInfo = getCategoryInfo(profile.category)
            const isCopied = copyState[profile.id]

            return (
              <div key={profile.id} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: '1rem', padding: '0.85rem 1rem',
                transition: 'border-color 0.15s',
              }}>
                {/* Row 1: Name + Category Badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.2rem' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                    👤 {profile.name}
                  </span>
                  <span style={{
                    background: `${catInfo.color}18`, color: catInfo.color,
                    border: `1px solid ${catInfo.color}30`,
                    borderRadius: '9999px', padding: '0.1rem 0.55rem',
                    fontSize: '0.68rem', fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap',
                  }}>
                    {catInfo.emoji} {catInfo.label}
                  </span>
                </div>

                {/* Row 2: Company + Location */}
                <p style={{ margin: '0 0 0.2rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {profile.company && <><span style={{ fontWeight: 500 }}>🏢 {profile.company}</span> · </>}
                  📍 {profile.location ?? 'Gujarat'}
                </p>

                {/* Row 3: Headline */}
                {profile.headline && (
                  <p style={{ margin: '0 0 0.45rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    📝 {profile.headline}
                  </p>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <a
                    href={profile.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                      background: '#0a66c2', color: '#fff', border: 'none',
                      borderRadius: '9999px', padding: '0.3rem 0.75rem',
                      fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    🔗 Connect on LinkedIn
                  </a>
                  <button
                    onClick={() => void handleCopyMessage(profile)}
                    style={{
                      background: isCopied ? '#16a34a' : 'var(--bg-secondary)',
                      color: isCopied ? '#fff' : 'var(--text-primary)',
                      border: isCopied ? 'none' : '1px solid var(--border)',
                      borderRadius: '9999px', padding: '0.3rem 0.75rem',
                      fontSize: '0.75rem', cursor: 'pointer', fontWeight: 500,
                    }}
                  >
                    {isCopied ? '✓ Copied!' : '📋 Copy Message'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Footer ── */}
      {data && data.all_time_count > 0 && (
        <div style={{
          textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)',
          padding: '0.5rem 0', borderTop: '1px solid var(--border)',
        }}>
          📈 {data.all_time_count} total profiles discovered all-time
        </div>
      )}
    </div>
  )
}
