'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Spinner } from '@/components/spinner';
import {
  fetchFollowUps,
  fetchProactive,
  fetchScraperStatus,
  fetchTrackerSummary,
  fetchWeeklyStats,
  triggerScraper,
} from '@/lib/api';
import { timeAgo } from '@/lib/time';
import type { Opportunity, ScraperLog, TrackerSummary, WeeklyStats } from '@/lib/types';

/* ── helpers ─────────────────────────────────────────────── */
async function patchOpp(id: string, updates: Record<string, unknown>) {
  await fetch('/api/opportunities', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...updates }),
  });
}

async function fetchUrgent(): Promise<Opportunity[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const res = await fetch(`/api/opportunities?score=70%2B&status=new&date=today`);
  if (!res.ok) return [];
  const json = (await res.json()) as { data: Opportunity[] };
  return json.data.filter(
    (o) => (o.priority_score ?? 0) >= 70 && o.status === 'new' && o.found_at >= since,
  );
}

async function fetchWatching(): Promise<Opportunity[]> {
  const res = await fetch('/api/opportunities?score=40-69&status=new');
  if (!res.ok) return [];
  const json = (await res.json()) as { data: Opportunity[] };
  return json.data.filter((o) => {
    const s = o.priority_score ?? 0;
    return s >= 40 && s < 70 && o.status === 'new';
  });
}

function tierClass(tier: number | null): string {
  const map: Record<number, string> = {
    1: 'tier-gift-city', 2: 'tier-ai-product', 3: 'tier-it-services',
    4: 'tier-fintech', 5: 'tier-healthtech', 6: 'tier-startup',
    7: 'tier-mnc', 8: 'tier-recruiter',
  };
  return map[tier ?? 0] ?? 'tier-it-services';
}

function tierLabel(tier: number | null): string {
  const map: Record<number, string> = {
    1: 'GIFT City', 2: 'AI Product', 3: 'IT Services',
    4: 'Fintech', 5: 'Healthtech', 6: 'Startup',
    7: 'MNC', 8: 'Recruiter',
  };
  return map[tier ?? 0] ?? 'Other';
}

function linkQuality(url: string | null): { icon: string; label: string } {
  if (!url) return { icon: '❌', label: 'No link' };
  const u = url.toLowerCase();
  if (u.includes('naukri') || u.includes('linkedin') || u.includes('indeed') || u.includes('wellfound'))
    return { icon: '⚠️', label: 'Job board' };
  return { icon: '✅', label: 'Direct' };
}

function sourceIcon(source: string | null): string {
  const map: Record<string, string> = {
    career_page: '🏢', naukri: '📋', linkedin_email: '💼',
    google_search: '🔍', google_alert: '🔍', indeed: '📌', wellfound: '🚀',
  };
  return map[source ?? ''] ?? '📡';
}

/* ── ThemeToggle ─────────────────────────────────────────── */
function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); setDark(document.documentElement.classList.contains('dark')); }, []);
  if (!mounted) return null;
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('hiresense-theme', next ? 'dark' : 'light'); } catch {}
  }
  return (
    <button onClick={toggle} aria-label="Toggle dark mode" style={{
      background: 'none', border: '1px solid var(--border)', borderRadius: '9999px',
      padding: '0.2rem 0.55rem', fontSize: '1rem', cursor: 'pointer', color: 'var(--text-secondary)',
    }}>
      {dark ? '☀️' : '🌙'}
    </button>
  );
}

/* ── UrgentCard ──────────────────────────────────────────── */
function UrgentCard({ opp, onApplied, onSkip }: {
  opp: Opportunity;
  onApplied: (id: string) => void;
  onSkip: (id: string) => void;
}) {
  const [applyState, setApplyState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'done'>('idle');
  const score = opp.priority_score ?? 0;
  const lq = linkQuality(opp.apply_url);

  async function handleApply() {
    if (!opp.apply_url) return;
    setApplyState('loading');
    window.open(opp.apply_url, '_blank', 'noopener,noreferrer');
    await patchOpp(opp.id, { status: 'applied', applied_at: new Date().toISOString() });
    setApplyState('done');
    setTimeout(() => { setApplyState('idle'); onApplied(opp.id); }, 2000);
  }

  async function copyEmail() {
    if (!opp.contact_email) return;
    await navigator.clipboard.writeText(opp.contact_email);
    setCopyState('done');
    setTimeout(() => setCopyState('idle'), 2000);
  }

  // Rough breakdown from score bands (approximate, since raw sub-scores aren't stored)
  const freshness = opp.freshness_score ?? 25;
  const signal = opp.signal_type === 'early' ? 25 : opp.signal_type === 'proactive' ? 20 : 15;
  const role = score - freshness - signal - 4; // remainder approximate

  return (
    <div className={`opp-card opp-card-urgent`}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <span className={`tier-badge ${tierClass(null)}`} style={{ opacity: 0.8 }}>
            {/* tier from raw_data if available */}
            Other
          </span>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{opp.company_name}</span>
        </div>
        <button
          onClick={() => setShowBreakdown((v) => !v)}
          style={{
            background: 'var(--badge-urgent-bg)', color: 'var(--badge-urgent-text)',
            border: 'none', borderRadius: '9999px', padding: '0.15rem 0.55rem',
            fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0,
          }}
          title="Tap to see score breakdown"
        >
          {score} 🔴
        </button>
      </div>

      {/* Role */}
      <p style={{ margin: '0 0 0.3rem', fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
        {opp.role_title ?? 'Open Role'}
      </p>

      {/* Meta row */}
      <p style={{ margin: '0 0 0.3rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        {opp.location ? `📍 ${opp.location} · ` : ''}
        ⏰ {timeAgo(opp.found_at)} · {sourceIcon(opp.source)} {opp.source}
      </p>

      {/* Score breakdown */}
      <div className={`score-breakdown${showBreakdown ? ' visible' : ''}`}>
        Freshness:{freshness} | Signal:{signal} | Role+Loc:{Math.max(0, role)} | Total:{score}
      </div>

      {/* Contact row */}
      {(opp.contact_name || opp.contact_email) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', margin: '0.35rem 0', fontSize: '0.75rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
          <span>👤 {[opp.contact_name, opp.contact_email].filter(Boolean).join(' · ')}</span>
          {opp.contact_email && (
            <button onClick={() => void copyEmail()} style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: '9999px',
              padding: '0.1rem 0.5rem', fontSize: '0.7rem', cursor: 'pointer', color: 'var(--text-secondary)',
            }}>
              {copyState === 'done' ? '✓ Copied' : 'Copy Email'}
            </button>
          )}
        </div>
      )}

      {/* Link quality */}
      <p style={{ margin: '0.2rem 0 0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        🔗 Apply link: {lq.icon} {lq.label}
      </p>

      {/* Actions */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
        <button
          disabled={applyState === 'loading' || !opp.apply_url}
          onClick={() => void handleApply()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
            background: applyState === 'done' ? 'var(--normal)' : 'var(--urgent)',
            color: '#fff', border: 'none', borderRadius: '9999px',
            padding: '0.4rem 0.9rem', fontSize: '0.8rem', fontWeight: 600,
            cursor: applyState === 'loading' ? 'not-allowed' : 'pointer',
            opacity: applyState === 'loading' ? 0.7 : 1,
          }}
        >
          {applyState === 'loading' && <Spinner />}
          {applyState === 'done' ? '✓ Applied' : 'Apply Now'}
        </button>
        <button onClick={() => onSkip(opp.id)} style={{
          background: 'var(--bg-secondary)', color: 'var(--text-muted)',
          border: '1px solid var(--border)', borderRadius: '9999px',
          padding: '0.4rem 0.75rem', fontSize: '0.8rem', cursor: 'pointer',
        }}>
          Skip
        </button>
      </div>
    </div>
  );
}

/* ── Main home page ──────────────────────────────────────── */
export default function HomePage() {
  // Data state
  const [scraperStatus, setScraperStatus] = useState<{ last_run: string | null; hours_ago: number | null; next_run: string; logs: ScraperLog[] } | null>(null);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats | null>(null);
  const [followUps, setFollowUps] = useState<Opportunity[]>([]);
  const [urgentOpps, setUrgentOpps] = useState<Opportunity[]>([]);
  const [watchingOpps, setWatchingOpps] = useState<Opportunity[]>([]);
  const [proactive, setProactive] = useState<Opportunity[]>([]);
  const [pipeline, setPipeline] = useState<TrackerSummary | null>(null);

  // UI state
  const [triggerState, setTriggerState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [watchExpanded, setWatchExpanded] = useState(false);
  const [doneFollowup, setDoneFollowup] = useState<Set<string>>(new Set());
  const [doneReachout, setDoneReachout] = useState<Set<string>>(new Set());
  const [copyMsg, setCopyMsg] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void Promise.all([
      fetchScraperStatus().then(setScraperStatus).catch(() => {}),
      fetchWeeklyStats().then(setWeeklyStats).catch(() => {}),
      fetchFollowUps().then((r) => setFollowUps(r.data)).catch(() => {}),
      fetchUrgent().then(setUrgentOpps).catch(() => {}),
      fetchWatching().then(setWatchingOpps).catch(() => {}),
      fetchProactive().then((r) => setProactive(r.data)).catch(() => {}),
      fetchTrackerSummary().then(setPipeline).catch(() => {}),
    ]);
  }, []);

  async function handleRunNow() {
    setTriggerState('loading');
    try {
      const res = await triggerScraper();
      setTriggerState(res.success ? 'success' : 'error');
    } catch {
      setTriggerState('error');
    }
    setTimeout(() => setTriggerState('idle'), 5000);
  }

  async function clearFollowup(id: string) {
    await patchOpp(id, { follow_up_date: null });
    setDoneFollowup((s) => new Set([...s, id]));
  }

  async function markReachout(id: string) {
    await patchOpp(id, { status: 'followed_up' });
    setDoneReachout((s) => new Set([...s, id]));
  }

  async function handleCopyMessage(id: string, company: string) {
    const msg = `Hi [Name], I noticed ${company} is expanding its AI/digital capabilities. I am an AI/ML engineer based in Ahmedabad with experience in relevant areas. Would love to connect and explore if there is a fit as you build the team.`;
    await navigator.clipboard.writeText(msg);
    setCopyMsg((m) => ({ ...m, [id]: true }));
    setTimeout(() => setCopyMsg((m) => ({ ...m, [id]: false })), 2000);
  }

  const visibleUrgent = urgentOpps.filter((o) => !skipped.has(o.id));
  const visibleWatching = watchingOpps.filter((o) => !skipped.has(o.id));
  const visibleFollowups = followUps.filter((o) => !doneFollowup.has(o.id));
  const visibleProactive = proactive.filter((o) => !doneReachout.has(o.id));
  const watchShow = watchExpanded ? visibleWatching : visibleWatching.slice(0, 5);

  const scraperText = scraperStatus === null
    ? 'Checking…'
    : scraperStatus.last_run === null
      ? 'Scrapers not yet run'
      : `Last scraped: ${scraperStatus.hours_ago === 0 ? 'just now' : `${scraperStatus.hours_ago}h ago`} · Next: ~${scraperStatus.next_run}`;

  /* ─── Render ─────────────────────────────────────────── */
  return (
    <div style={{ backgroundColor: 'var(--bg-secondary)', minHeight: '100vh', color: 'var(--text-primary)' }}>

      {/* ── SECTION A: Sticky Header ── */}
      <header className="sticky-header">
        <div style={{ maxWidth: '48rem', margin: '0 auto' }}>
          {/* Row 1: brand + desktop scraper info + buttons */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>🎯 HireSense</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{scraperText}</span>
              <button
                disabled={triggerState === 'loading'}
                onClick={() => void handleRunNow()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                  background: triggerState === 'success' ? 'var(--normal)' : triggerState === 'error' ? 'var(--urgent)' : 'var(--accent)',
                  color: '#fff', border: 'none', borderRadius: '9999px',
                  padding: '0.25rem 0.65rem', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                  opacity: triggerState === 'loading' ? 0.7 : 1, whiteSpace: 'nowrap',
                }}
              >
                {triggerState === 'loading' && <Spinner />}
                {triggerState === 'idle' && '⚡ Run Now'}
                {triggerState === 'loading' && 'Running…'}
                {triggerState === 'success' && '✓ Triggered!'}
                {triggerState === 'error' && '✗ Failed'}
              </button>
              <ThemeToggle />
            </div>
          </div>

          {/* Desktop nav */}
          <nav className="desktop-nav-links" style={{ gap: '0.25rem', marginTop: '0.4rem' }}>
            {[
              { href: '/opportunities', label: 'Opportunities' },
              { href: '/companies',    label: 'Companies'     },
              { href: '/proactive',    label: 'Proactive'     },
              { href: '/tracker',      label: 'Tracker'       },
              { href: '/interview',    label: '🎯 Interview'  },
            ].map((l) => (
              <a key={l.href} href={l.href} style={{
                fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0.25rem 0.6rem',
                borderRadius: '9999px', transition: 'color 0.15s',
                textDecoration: 'none',
              }}
                onMouseOver={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent)'; }}
                onMouseOut={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)'; }}
              >
                {l.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      {/* ── Main content ── */}
      <main style={{ maxWidth: '48rem', margin: '0 auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* ── SECTION B: Weekly Stats ── */}
        <div className="home-section">
          <div className="weekly-stats">
            {[
              { icon: '📋', label: 'Found this week', value: weeklyStats?.found_this_week ?? '…' },
              { icon: '✅', label: 'Applied',          value: weeklyStats?.applied ?? '…'         },
              { icon: '🎯', label: 'Interviews',        value: weeklyStats?.interviews ?? '…'      },
              { icon: '⏰', label: 'Follow-ups due',    value: weeklyStats?.followups_due ?? '…'   },
            ].map((s) => (
              <div key={s.label} className="weekly-stat-card">
                <div className="weekly-stat-value">{s.icon} {s.value}</div>
                <div className="weekly-stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION C: Follow Up Today ── */}
        {(visibleFollowups.length > 0 || weeklyStats === null) && (
          <div className="home-section">
            <h2 className="home-section-title">⏰ Follow Up Today ({visibleFollowups.length})</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {visibleFollowups.length === 0
                ? <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>Loading…</p>
                : visibleFollowups.map((opp) => (
                    <div key={opp.id} className="followup-row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{opp.company_name}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> · {opp.role_title ?? 'Open role'}</span>
                        {opp.applied_at && (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}> · Applied {timeAgo(opp.applied_at)}</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, flexWrap: 'wrap' }}>
                        <a
                          href={`mailto:?subject=${encodeURIComponent(`Following up on my application — ${opp.role_title ?? 'Role'} at ${opp.company_name}`)}`}
                          style={{
                            display: 'inline-flex', alignItems: 'center',
                            background: 'var(--accent)', color: '#fff', border: 'none',
                            borderRadius: '9999px', padding: '0.3rem 0.65rem',
                            fontSize: '0.72rem', fontWeight: 600, textDecoration: 'none',
                          }}
                        >
                          Send Follow-up
                        </a>
                        <button onClick={() => void clearFollowup(opp.id)} style={{
                          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                          borderRadius: '9999px', padding: '0.3rem 0.65rem',
                          fontSize: '0.72rem', cursor: 'pointer', color: 'var(--text-secondary)',
                        }}>Done ✓</button>
                      </div>
                    </div>
                  ))
              }
            </div>
          </div>
        )}

        {/* ── SECTION D: Apply Now (Urgent 70+) ── */}
        <div className="home-section">
          <h2 className="home-section-title">🔴 Apply Now ({visibleUrgent.length})</h2>
          {visibleUrgent.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--normal)', margin: 0 }}>
              ✓ No urgent items right now. Check back after next scraper run.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {visibleUrgent.map((opp) => (
                <UrgentCard
                  key={opp.id}
                  opp={opp}
                  onApplied={(id) => setUrgentOpps((prev) => prev.filter((o) => o.id !== id))}
                  onSkip={(id) => setSkipped((s) => new Set([...s, id]))}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── SECTION E: Watching (40-69) ── */}
        <div className="home-section">
          <h2 className="home-section-title" style={{ justifyContent: 'space-between' }}>
            <span>👁 Watching ({visibleWatching.length})</span>
            <Link href="/opportunities" style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 500 }}>
              Show All →
            </Link>
          </h2>
          {visibleWatching.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>Nothing in the 40–69 range right now.</p>
          ) : (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '0 0.75rem' }}>
              {watchShow.map((opp) => (
                <div key={opp.id} className="compact-row">
                  <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '0 1 auto', maxWidth: '9rem' }}>
                    {opp.company_name}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {opp.role_title ?? 'Open role'}
                  </span>
                  <span style={{ background: 'var(--badge-watching-bg)', color: 'var(--badge-watching-text)', borderRadius: '9999px', padding: '0.1rem 0.45rem', fontSize: '0.68rem', fontWeight: 700, flexShrink: 0 }}>
                    {opp.priority_score}
                  </span>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', flexShrink: 0 }}>{timeAgo(opp.found_at)}</span>
                  {opp.apply_url && (
                    <a href={opp.apply_url} target="_blank" rel="noopener noreferrer" style={{
                      fontSize: '0.7rem', color: 'var(--accent)', flexShrink: 0,
                      border: '1px solid var(--accent)', borderRadius: '9999px',
                      padding: '0.1rem 0.5rem', textDecoration: 'none',
                    }}>
                      Apply
                    </a>
                  )}
                  <button onClick={() => setSkipped((s) => new Set([...s, opp.id]))} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)', fontSize: '0.75rem', flexShrink: 0, padding: '0.1rem 0.3rem',
                  }}>
                    Skip
                  </button>
                </div>
              ))}
              {visibleWatching.length > 5 && (
                <div style={{ padding: '0.5rem 0', textAlign: 'center' }}>
                  <button onClick={() => setWatchExpanded((v) => !v)} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--accent)', fontSize: '0.78rem', fontWeight: 600,
                  }}>
                    {watchExpanded ? 'Show less ▲' : `Show ${visibleWatching.length - 5} more ▼`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── SECTION F: Reach Out Today ── */}
        {visibleProactive.length > 0 && (
          <div className="home-section">
            <h2 className="home-section-title">🏢 Reach Out Today ({visibleProactive.length})</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {visibleProactive.map((opp) => {
                const fundingSignal = (opp.raw_data as Record<string, unknown> | null)?.funding_stage
                  ? `Recent funding` : null;
                const signalReason = fundingSignal ?? (opp.source === 'career_page' ? 'Page updated' : opp.source === 'google_search' ? 'AI leader hired' : 'Signal detected');

                return (
                  <div key={opp.id} className="opp-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{opp.company_name}</span>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: '9999px', padding: '0.1rem 0.5rem', flexShrink: 0 }}>
                        {opp.signal_type ?? 'proactive'}
                      </span>
                    </div>
                    <p style={{ margin: '0.2rem 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      Signal: {signalReason} · {timeAgo(opp.found_at)}
                    </p>
                    <p style={{ margin: '0.2rem 0 0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Suggested contact: CTO / HR Manager
                    </p>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => void handleCopyMessage(opp.id, opp.company_name)}
                        style={{
                          background: copyMsg[opp.id] ? 'var(--normal)' : 'var(--bg-secondary)',
                          color: copyMsg[opp.id] ? '#fff' : 'var(--text-primary)',
                          border: '1px solid var(--border)', borderRadius: '9999px',
                          padding: '0.3rem 0.7rem', fontSize: '0.75rem', cursor: 'pointer',
                        }}
                      >
                        {copyMsg[opp.id] ? '✓ Copied' : 'Copy Message'}
                      </button>
                      <a
                        href={`https://www.linkedin.com/search/results/people/?keywords=HR+${encodeURIComponent(opp.company_name)}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex', alignItems: 'center',
                          background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                          border: '1px solid var(--border)', borderRadius: '9999px',
                          padding: '0.3rem 0.7rem', fontSize: '0.75rem', textDecoration: 'none',
                        }}
                      >
                        Find on LinkedIn
                      </a>
                      <button
                        onClick={() => void markReachout(opp.id)}
                        style={{
                          background: 'var(--normal)', color: '#fff', border: 'none',
                          borderRadius: '9999px', padding: '0.3rem 0.7rem',
                          fontSize: '0.75rem', cursor: 'pointer',
                        }}
                      >
                        Mark Reached Out ✓
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── SECTION G: My Pipeline ── */}
        <div className="home-section">
          <h2 className="home-section-title">📋 My Pipeline</h2>
          {pipeline === null ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Spinner /><span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Loading…</span></div>
          ) : (
            <div className="pipeline-strip">
              {([
                { key: 'new',         label: 'New',          color: 'var(--text-muted)' },
                { key: 'applied',     label: 'Applied',      color: 'var(--accent)'     },
                { key: 'followed_up', label: 'Follow-up',    color: 'var(--watching)'   },
                { key: 'interview',   label: 'Interview',    color: 'var(--normal)'     },
                { key: 'offer',       label: 'Offer',        color: 'var(--normal)'     },
                { key: 'rejected',    label: 'Rejected',     color: 'var(--text-muted)' },
              ] as { key: keyof TrackerSummary; label: string; color: string }[]).map((item) => (
                <a key={item.key} href={`/tracker?filter=${item.key}`} className="pipeline-item">
                  <span className="pipeline-count" style={{ color: pipeline[item.key] > 0 ? item.color : 'var(--text-muted)' }}>
                    {pipeline[item.key]}
                  </span>
                  <span className="pipeline-label">{item.label}</span>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* ── SECTION H: Recent Alerts ── */}
        <div className="home-section">
          <h2 className="home-section-title">🔔 Recent Signals (last 5)</h2>
          {scraperStatus === null ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Spinner /><span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Loading…</span></div>
          ) : scraperStatus.logs.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>No scraper runs yet.</p>
          ) : (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', padding: '0 0.75rem' }}>
              {scraperStatus.logs.map((log) => {
                const statusIcon = log.status === 'success' || log.status === 'partial_success'
                  ? <span style={{ color: 'var(--normal)', fontWeight: 700 }}>✓</span>
                  : log.new_found === 0
                    ? <span style={{ color: 'var(--text-muted)' }}>—</span>
                    : <span style={{ color: 'var(--urgent)', fontWeight: 700 }}>✗</span>;
                return (
                  <div key={log.id} className="compact-row">
                    <span style={{ flexShrink: 0 }}>{sourceIcon(log.source)}</span>
                    <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 500 }}>{log.source ?? 'unknown'}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{log.new_found} new</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{timeAgo(log.run_at)}</span>
                    {statusIcon}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
