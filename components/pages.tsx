"use client";

import { useEffect, useMemo, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { CopyButton } from '@/components/copy-button';
import { OpportunityCard } from '@/components/opportunity-card';
import { Spinner } from '@/components/spinner';
import {
  Button,
  EmptyState,
  GhostLink,
  Metric,
  Panel,
  ScoreBadge,
  SectionTitle,
  Select,
  SkeletonCard,
  SkeletonRows,
  SuccessButton,
  Textarea,
} from '@/components/ui';
import {
  companyHasDirectJobSignal,
  companyHasProactiveSignal,
  fetchCompanies,
  fetchOpportunities,
  fetchTracker,
  filterOpportunities,
} from '@/lib/api';
import { timeAgo } from '@/lib/time';
import type { ApiListResponse, Company, Opportunity } from '@/lib/types';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

async function patchJson(url: string, body: Record<string, unknown>) {
  return fetchJson(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/* ────────────────────────────────────────────────────────────
   Shared table header style
──────────────────────────────────────────────────────────── */
const TH_STYLE: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  fontSize: '0.65rem',
  textTransform: 'uppercase',
  letterSpacing: '0.18em',
  color: 'var(--text-muted)',
  backgroundColor: 'var(--bg-secondary)',
  borderBottom: '1px solid var(--border)',
  fontWeight: 600,
  textAlign: 'left',
};

const TD_STYLE: React.CSSProperties = {
  padding: '0.65rem 0.75rem',
  fontSize: '0.82rem',
  color: 'var(--text-secondary)',
  verticalAlign: 'top',
  borderBottom: '1px solid var(--border)',
};

/* ────────────────────────────────────────────────────────────
   TODAY'S RADAR
──────────────────────────────────────────────────────────── */
type ScraperStatus = { last_run: string | null; status: string | null; hours_ago: number | null; next_run: string };

export function TodayRadarPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [scraperStatus, setScraperStatus] = useState<ScraperStatus | null>(null);
  const [triggerState, setTriggerState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  async function load() {
    setLoading(true);
    try {
      const [oppsRes, statusRes] = await Promise.all([
        fetchJson<ApiListResponse<Opportunity>>('/api/opportunities?filter=today'),
        fetchJson<ScraperStatus>('/api/scraper-status'),
      ]);
      setOpportunities(oppsRes.data);
      setScraperStatus(statusRes);
    } catch {
      setOpportunities([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const urgent   = opportunities.filter((item) => (item.priority_score ?? 0) >= 70);
  const watching = opportunities.filter((item) => { const s = item.priority_score ?? 0; return s >= 40 && s < 70; });
  const normal   = opportunities.filter((item) => (item.priority_score ?? 0) < 40);
  const appliedCount = opportunities.filter((item) => item.status === 'applied').length;

  async function markApplied(opportunity: Opportunity) {
    await patchJson('/api/opportunities', { id: opportunity.id, status: 'applied', applied_at: new Date().toISOString() });
    await load();
  }

  async function handleRunNow() {
    setTriggerState('loading');
    try {
      const res = await fetchJson<{ success: boolean; error?: string }>('/api/trigger-scraper', { method: 'POST' });
      setTriggerState(res.success ? 'success' : 'error');
    } catch {
      setTriggerState('error');
    } finally {
      setTimeout(() => setTriggerState('idle'), 5000);
    }
  }

  return (
    <AppShell title="Today's Radar" subtitle="Daily signal board for Ahmedabad, Gandhinagar, and GIFT City">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* Stats row */}
        <Panel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }} className="sm-grid-4">
            <Metric
              label="Total Today"
              value={loading ? '…' : opportunities.length}
              accentClass="metric-total"
              labelColor="var(--accent)"
            />
            <Metric
              label="Urgent"
              value={loading ? '…' : urgent.length}
              accentClass="metric-urgent"
              labelColor="var(--urgent)"
              valueColor={!loading && urgent.length > 0 ? 'var(--urgent)' : undefined}
            />
            <Metric
              label="Watching"
              value={loading ? '…' : watching.length}
              accentClass="metric-watching"
              labelColor="var(--watching)"
              valueColor={!loading && watching.length > 0 ? 'var(--watching)' : undefined}
            />
            <Metric
              label="Applied"
              value={loading ? '…' : appliedCount}
              accentClass="metric-applied"
              labelColor="var(--normal)"
              valueColor={!loading && appliedCount > 0 ? 'var(--normal)' : undefined}
            />
          </div>
        </Panel>

        {/* Scraper status bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '0.5rem',
          padding: '0.5rem 0.25rem',
        }}>
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {scraperStatus === null
              ? 'Checking scraper status…'
              : scraperStatus.last_run === null
                ? 'Scrapers not yet run. Trigger manually from GitHub Actions.'
                : `Last scraped: ${scraperStatus.hours_ago === 0 ? 'just now' : `${scraperStatus.hours_ago}h ago`} · Next run: ~${scraperStatus.next_run}`
            }
          </p>
          <button
            disabled={triggerState === 'loading'}
            onClick={() => void handleRunNow()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              borderRadius: '9999px',
              border: 'none',
              backgroundColor: triggerState === 'success' ? 'var(--normal)' : triggerState === 'error' ? 'var(--urgent)' : 'var(--accent)',
              color: '#ffffff',
              padding: '0.3rem 0.75rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: triggerState === 'loading' ? 'not-allowed' : 'pointer',
              opacity: triggerState === 'loading' ? 0.7 : 1,
              transition: 'background-color 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            {triggerState === 'loading' && <Spinner />}
            {triggerState === 'idle'    && '⚡ Run Now'}
            {triggerState === 'loading' && 'Running…'}
            {triggerState === 'success' && '✓ Triggered! Check back in 2–3 min.'}
            {triggerState === 'error'   && '✗ Failed. Try GitHub Actions.'}
          </button>
        </div>

        {/* Urgent */}
        <Panel>
          <SectionTitle eyebrow="Urgent" title="Score 70+" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {loading
              ? [1, 2].map((k) => <SkeletonCard key={k} />)
              : urgent.length
                ? urgent.map((opp) => <OpportunityCard key={opp.id} opportunity={opp} onMarkApplied={markApplied} />)
                : <EmptyState icon="🔍" message="No urgent opportunities today. Scrapers will populate this automatically." />
            }
          </div>
        </Panel>

        {/* Watching */}
        <Panel>
          <SectionTitle eyebrow="Watching" title="Score 40–69" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {loading
              ? [1, 2, 3].map((k) => <SkeletonCard key={k} />)
              : watching.length
                ? watching.map((opp) => <OpportunityCard key={opp.id} opportunity={opp} onMarkApplied={markApplied} />)
                : <EmptyState icon="🔍" message="Nothing in the watching range right now." />
            }
          </div>
        </Panel>

        {/* Normal */}
        <Panel>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <SectionTitle eyebrow="Normal" title="Score under 40" />
            <Button onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Hide' : `Show ${normal.length}`}
            </Button>
          </div>
          {expanded
            ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {normal.length
                  ? normal.map((opp) => <OpportunityCard key={opp.id} opportunity={opp} onMarkApplied={markApplied} />)
                  : <EmptyState icon="🔍" message="No low-priority items." />
                }
              </div>
            )
            : <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>Collapsed — tap Show to expand.</p>
          }
        </Panel>
      </div>

      <style>{`
        @media (min-width: 640px) { .sm-grid-4 { grid-template-columns: repeat(4,1fr) !important; } }
      `}</style>
    </AppShell>
  );
}

/* ────────────────────────────────────────────────────────────
   ALL OPPORTUNITIES
──────────────────────────────────────────────────────────── */
export function OpportunitiesPage() {
  const [rows, setRows]       = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtering, setFiltering] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [source, setSource]   = useState('all');
  const [score, setScore]     = useState('all');
  const [status, setStatus]   = useState('all');
  const [date, setDate]       = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]   = useState('');
  
  const [location, setLocation] = useState('');
  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');

  const [sortCol, setSortCol] = useState<'Date'|'Company'|'Role'|'Location'|'Source'|'Score'|'Status'>('Score');
  const [sortDesc, setSortDesc] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const response = await fetchOpportunities();
      setRows(response.data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  /* Show brief "filtering" overlay when any filter changes */
  function handleFilterChange(setter: (v: string) => void, value: string) {
    setFiltering(true);
    setter(value);
    setTimeout(() => setFiltering(false), 200);
  }

  const visible = useMemo(() => {
    let filtered = filterOpportunities(rows, { source, score, status, date, date_from: dateFrom, date_to: dateTo, location, role, company });
    
    filtered.sort((a, b) => {
      let valA: any = '';
      let valB: any = '';
      if (sortCol === 'Date') { valA = new Date(a.found_at).getTime(); valB = new Date(b.found_at).getTime(); }
      else if (sortCol === 'Company') { valA = a.company_name.toLowerCase(); valB = b.company_name.toLowerCase(); }
      else if (sortCol === 'Role') { valA = (a.role_title || '').toLowerCase(); valB = (b.role_title || '').toLowerCase(); }
      else if (sortCol === 'Location') { valA = (a.location || '').toLowerCase(); valB = (b.location || '').toLowerCase(); }
      else if (sortCol === 'Source') { valA = a.source; valB = b.source; }
      else if (sortCol === 'Score') { valA = a.priority_score || 0; valB = b.priority_score || 0; }
      else if (sortCol === 'Status') { valA = a.status; valB = b.status; }

      if (valA < valB) return sortDesc ? 1 : -1;
      if (valA > valB) return sortDesc ? -1 : 1;
      return 0;
    });

    return filtered;
  }, [rows, source, score, status, date, dateFrom, dateTo, location, role, company, sortCol, sortDesc]);

  async function markApplied(id: string) {
    await patchJson('/api/opportunities', { id, status: 'applied', applied_at: new Date().toISOString() });
    await load();
  }

  async function handleExport() {
    setExporting(true);
    const params = new URLSearchParams({ format: 'csv', source, score, status, date, date_from: dateFrom, date_to: dateTo });
    window.location.href = `/api/opportunities?${params.toString()}`;
    await new Promise((r) => setTimeout(r, 1500));
    setExporting(false);
  }

  return (
    <AppShell title="All Opportunities" subtitle="Filterable action list from all scraper sources">
      {/* Filters */}
      <Panel>
        {/* Row 1: 4 dropdowns */}
        <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(2, 1fr)' }} className="opp-filter-row1">
          <Select value={source} onChange={(e) => handleFilterChange(setSource, e.target.value)}>
            <option value="all">All sources</option>
            <option value="career_page">Career Page</option>
            <option value="linkedin_email">LinkedIn Email</option>
            <option value="naukri">Naukri</option>
            <option value="wellfound">Wellfound</option>
            <option value="google_alert">Google Alert</option>
            <option value="indeed">Indeed</option>
            <option value="google_search">Google Search</option>
          </Select>
          <Select value={score} onChange={(e) => handleFilterChange(setScore, e.target.value)}>
            <option value="all">All scores</option>
            <option value="70+">70+</option>
            <option value="40-69">40–69</option>
            <option value="<40">&lt;40</option>
          </Select>
          <Select value={status} onChange={(e) => handleFilterChange(setStatus, e.target.value)}>
            <option value="all">All statuses</option>
            <option value="new">New</option>
            <option value="applied">Applied</option>
            <option value="followed_up">Followed Up</option>
            <option value="interview">Interview</option>
            <option value="rejected">Rejected</option>
            <option value="offer">Offer</option>
          </Select>
          <Select value={date} onChange={(e) => handleFilterChange(setDate, e.target.value)}>
            <option value="all">All dates</option>
            <option value="3h">Last 3 Hours</option>
            <option value="today">Today</option>
            <option value="30h">Last 30 Hours</option>
            <option value="3d">Last 3 Days</option>
            <option value="7d">Last 7 Days</option>
          </Select>
        </div>

        {/* Row 2: Text Filters */}
        <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(3, 1fr)', marginTop: '0.5rem' }}>
          <input
            type="text"
            value={location}
            onChange={(e) => handleFilterChange(setLocation, e.target.value)}
            className="hs-input"
            style={{ height: '2.375rem' }}
            placeholder="Location (e.g. Ahmedabad)"
          />
          <input
            type="text"
            value={role}
            onChange={(e) => handleFilterChange(setRole, e.target.value)}
            className="hs-input"
            style={{ height: '2.375rem' }}
            placeholder="Role (e.g. AI Engineer)"
          />
          <input
            type="text"
            value={company}
            onChange={(e) => handleFilterChange(setCompany, e.target.value)}
            className="hs-input"
            style={{ height: '2.375rem' }}
            placeholder="Company name"
          />
        </div>

        {/* Row 3: date range inputs */}
        <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: '1fr 1fr', marginTop: '0.5rem' }}>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => handleFilterChange(setDateFrom, e.target.value)}
            className="hs-input"
            style={{ height: '2.375rem' }}
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => handleFilterChange(setDateTo, e.target.value)}
            className="hs-input"
            style={{ height: '2.375rem' }}
          />
        </div>

        {/* Row 4: actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button
            onClick={() => void handleExport()}
            disabled={exporting}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              borderRadius: '9999px',
              border: '1px solid var(--accent)',
              backgroundColor: 'var(--accent)',
              color: '#ffffff',
              padding: '0.4rem 0.85rem',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: exporting ? 'not-allowed' : 'pointer',
              opacity: exporting ? 0.7 : 1,
            }}
          >
            {exporting && <Spinner />}
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          <Button onClick={() => { 
            setSource('all'); setScore('all'); setStatus('all'); setDate('all'); 
            setDateFrom(''); setDateTo(''); setLocation(''); setRole(''); setCompany('');
            setSortCol('Score'); setSortDesc(true);
          }}>
            Reset Filters
          </Button>
        </div>
      </Panel>

      {/* Table */}
      <Panel style={{ marginTop: '1rem', overflow: 'hidden' }}>
        <SectionTitle eyebrow="Table" title={`${visible.length} visible opportunities`} />
        <div style={{ position: 'relative', overflowX: 'auto' }}>
          {filtering && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 5,
              backgroundColor: 'color-mix(in srgb, var(--bg-card) 70%, transparent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: '0.75rem',
            }}>
              <Spinner />
            </div>
          )}
          {loading ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody><SkeletonRows cols={8} rows={5} /></tbody>
            </table>
          ) : !visible.length ? (
            <EmptyState icon="🔍" message="No opportunities match the current filters." />
          ) : (
            <table style={{ minWidth: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {(['Date','Company','Role','Location','Source','Score','Status'] as const).map((h) => (
                    <th 
                      key={h} 
                      style={{ ...TH_STYLE, cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => {
                        if (sortCol === h) setSortDesc(!sortDesc);
                        else { setSortCol(h); setSortDesc(true); }
                      }}
                    >
                      {h} {sortCol === h ? (sortDesc ? '↓' : '↑') : ''}
                    </th>
                  ))}
                  <th style={TH_STYLE}>Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item, idx) => (
                  <tr
                    key={item.id}
                    style={{ backgroundColor: idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary)' }}
                  >
                    <td style={TD_STYLE}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                          Posted: {(item.raw_data as any)?.job_posted_at ? timeAgo((item.raw_data as any).job_posted_at) : (item.source === 'naukri' ? 'Unknown' : timeAgo(item.found_at))}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          Discovered: {timeAgo(item.found_at)}
                        </span>
                      </div>
                    </td>
                    <td style={{ ...TD_STYLE, fontWeight: 600, color: 'var(--text-primary)' }}>{item.company_name}</td>
                    <td style={TD_STYLE}>{item.role_title ?? 'Open role'}</td>
                    <td style={TD_STYLE}>{item.location ?? '—'}</td>
                    <td style={TD_STYLE}>{item.source}</td>
                    <td style={TD_STYLE}><ScoreBadge score={item.priority_score ?? 0} /></td>
                    <td style={TD_STYLE}>{item.status}</td>
                    <td style={TD_STYLE}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {(item.apply_url || (item.raw_data as any)?.original_job_url) ? (
                          <a 
                            href={item.apply_url || (item.raw_data as any)?.original_job_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="hs-btn-view"
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                              borderRadius: '9999px',
                              border: '1px solid var(--border)',
                              backgroundColor: 'var(--bg-secondary)',
                              color: 'var(--text-primary)',
                              padding: '0.4rem 0.85rem',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              textDecoration: 'none',
                              whiteSpace: 'nowrap',
                              height: '2.25rem',
                              transition: 'all 0.2s',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                            }}
                          >
                            <span style={{ fontSize: '0.85rem' }}>🔗</span> <span className="hs-btn-view-text">View Job</span>
                          </a>
                        ) : (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            borderRadius: '9999px',
                            border: '1px solid var(--border)',
                            backgroundColor: 'transparent',
                            color: 'var(--text-muted)',
                            padding: '0.4rem 0.85rem',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                            height: '2.25rem',
                            cursor: 'not-allowed'
                          }}>
                            URL Missing
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Panel>

      <style>{`
        @media (min-width: 768px) { .opp-filter-row1 { grid-template-columns: repeat(4,1fr) !important; } }
      `}</style>
    </AppShell>
  );
}

/* inline Mark Applied with spinner */
function MarkAppliedButton({ id, onMark }: { id: string; onMark: () => Promise<void> }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  async function handle() {
    setState('loading');
    try { await onMark(); setState('done'); setTimeout(() => setState('idle'), 2000); }
    catch { setState('idle'); }
  }
  return (
    <button
      disabled={state === 'loading'}
      onClick={() => void handle()}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
        borderRadius: '9999px',
        border: '1px solid var(--border)',
        backgroundColor: state === 'done' ? 'var(--normal)' : 'var(--bg-secondary)',
        color: state === 'done' ? '#fff' : 'var(--text-primary)',
        padding: '0.35rem 0.7rem',
        fontSize: '0.75rem',
        fontWeight: 500,
        cursor: state === 'loading' ? 'not-allowed' : 'pointer',
        transition: 'background-color 0.2s',
      }}
    >
      {state === 'loading' && <Spinner />}
      {state === 'done' ? '✓ Applied' : 'Mark Applied'}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────
   COMPANIES
──────────────────────────────────────────────────────────── */
type AddCompanyForm = {
  name: string; website: string; careers_url: string; linkedin_url: string;
  location: string; tier: string; ai_focus: string; notes: string;
};
const EMPTY_FORM: AddCompanyForm = { name: '', website: '', careers_url: '', linkedin_url: '', location: '', tier: '', ai_focus: '', notes: '' };

export function CompaniesPage() {
  const [companies, setCompanies] = useState<(Company & { last_signal?: string; last_signal_score?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [watchingId, setWatchingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddCompanyForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [companiesResponse, opportunitiesResponse] = await Promise.all([
        fetchCompanies(),
        fetchOpportunities({ date: '7d' }),
      ]);
      const opps = opportunitiesResponse.data;
      setCompanies(
        companiesResponse.data.map((company) => {
          const latest = opps
            .filter((o) => o.company_name === company.name)
            .sort((a, b) => (b.found_at ?? '').localeCompare(a.found_at ?? ''))[0];
          return {
            ...company,
            last_signal: latest ? `${latest.source} · ${latest.role_title ?? 'Open role'}` : 'No signal yet',
            last_signal_score: latest?.priority_score ?? company.priority_base_score ?? 0,
          };
        }),
      );
    } catch {
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function toggleWatch(company: Company & { last_signal?: string; last_signal_score?: number }) {
    setWatchingId(company.id);
    try {
      await patchJson('/api/companies', { id: company.id, career_page_watched: !company.career_page_watched });
      await load();
    } finally {
      setWatchingId(null);
    }
  }

  function field(f: keyof AddCompanyForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [f]: e.target.value }));
  }

  async function handleSaveCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetchJson<{ ok: boolean; error?: string }>('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          website: form.website || null,
          careers_url: form.careers_url || null,
          linkedin_url: form.linkedin_url || null,
          location: form.location || null,
          tier: form.tier ? parseInt(form.tier, 10) : null,
          ai_focus: form.ai_focus || null,
          notes: form.notes || null,
        }),
      });
      if (res.ok) {
        setToast({ msg: '✓ Company added', ok: true });
        setShowForm(false);
        setForm(EMPTY_FORM);
        await load();
      } else {
        setToast({ msg: `✗ ${res.error ?? 'Failed to save'}`, ok: false });
      }
    } catch {
      setToast({ msg: '✗ Failed to save', ok: false });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  const inputCls = 'hs-input';
  const formGrid: React.CSSProperties = { display: 'grid', gap: '0.65rem', gridTemplateColumns: '1fr' };

  return (
    <AppShell title="Company Watch List" subtitle="Curated set of targets and watch flags">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* Toast */}
        {toast && (
          <div style={{
            padding: '0.6rem 1rem', borderRadius: '0.75rem', fontSize: '0.82rem', fontWeight: 600,
            backgroundColor: toast.ok ? 'var(--badge-normal-bg)' : 'var(--badge-urgent-bg)',
            color: toast.ok ? 'var(--normal)' : 'var(--urgent)',
            border: `1px solid ${toast.ok ? 'var(--normal)' : 'var(--urgent)'}`,
          }}>
            {toast.msg}
          </div>
        )}

        {/* Add Company button + collapsible form */}
        <Panel>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showForm ? '1rem' : 0 }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>Companies</span>
            <button
              onClick={() => { setShowForm((v) => !v); setForm(EMPTY_FORM); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                borderRadius: '9999px', border: 'none',
                backgroundColor: showForm ? 'var(--bg-secondary)' : 'var(--accent)',
                color: showForm ? 'var(--text-primary)' : '#fff',
                padding: '0.35rem 0.85rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
              }}
            >
              {showForm ? '✕ Cancel' : '+ Add Company'}
            </button>
          </div>

          {showForm && (
            <form onSubmit={(e) => void handleSaveCompany(e)}>
              <div style={{ ...formGrid }} className="add-company-grid">
                <div>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Company Name *</label>
                  <input required className={inputCls} value={form.name} onChange={field('name')} placeholder="e.g. Pirimid Fintech" />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Location</label>
                  <input className={inputCls} value={form.location} onChange={field('location')} placeholder="Ahmedabad / GIFT City / Gandhinagar" />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Website URL</label>
                  <input className={inputCls} value={form.website} onChange={field('website')} placeholder="https://example.com" />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Careers Page URL</label>
                  <input className={inputCls} value={form.careers_url} onChange={field('careers_url')} placeholder="https://example.com/careers" />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>LinkedIn URL</label>
                  <input className={inputCls} value={form.linkedin_url} onChange={field('linkedin_url')} placeholder="https://linkedin.com/company/..." />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Tier</label>
                  <select className={inputCls} value={form.tier} onChange={field('tier')}>
                    <option value="">Select tier…</option>
                    <option value="1">1 — GIFT City / Top tier</option>
                    <option value="2">2 — AI Product</option>
                    <option value="3">3 — IT Services</option>
                    <option value="4">4 — Fintech</option>
                    <option value="5">5 — Healthtech</option>
                    <option value="6">6 — Startup</option>
                    <option value="7">7 — MNC</option>
                    <option value="8">8 — Recruiter</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>AI Focus</label>
                  <input className={inputCls} value={form.ai_focus} onChange={field('ai_focus')} placeholder="ML, GenAI, NLP…" />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Notes</label>
                  <textarea className={inputCls} value={form.notes} onChange={field('notes')} rows={2} style={{ resize: 'vertical' }} />
                </div>
              </div>
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                    borderRadius: '9999px', border: 'none',
                    backgroundColor: 'var(--accent)', color: '#fff',
                    padding: '0.4rem 1rem', fontSize: '0.8rem', fontWeight: 600,
                    cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving && <Spinner />}
                  {saving ? 'Saving…' : 'Save Company'}
                </button>
                <Button type="button" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}>Cancel</Button>
              </div>
            </form>
          )}
        </Panel>

        {/* Companies table */}
        <Panel>
          {loading ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody><SkeletonRows cols={8} rows={6} /></tbody>
            </table>
          ) : !companies.length ? (
            <EmptyState icon="🏢" message="No companies yet. Use '+ Add Company' or import companies_seed.csv." />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ minWidth: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['#','Company','Tier','Location','Score','Watched','Last Signal','Action'].map((h) => (
                      <th key={h} style={TH_STYLE}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {companies.map((company, idx) => (
                    <tr key={company.id} style={{ backgroundColor: idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary)' }}>
                      <td style={{ ...TD_STYLE, color: 'var(--text-muted)' }}>{idx + 1}</td>
                      <td style={{ ...TD_STYLE, fontWeight: 600, color: 'var(--text-primary)' }}>{company.name}</td>
                      <td style={TD_STYLE}>{company.tier ?? '—'}</td>
                      <td style={TD_STYLE}>{company.location ?? '—'}</td>
                      <td style={TD_STYLE}><ScoreBadge score={company.last_signal_score ?? company.priority_base_score ?? 0} /></td>
                      <td style={TD_STYLE}>
                        <span style={{ color: company.career_page_watched ? 'var(--normal)' : 'var(--text-muted)', fontWeight: 600, fontSize: '0.75rem' }}>
                          {company.career_page_watched ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td style={{ ...TD_STYLE, maxWidth: '14rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {company.last_signal ?? 'No signal yet'}
                      </td>
                      <td style={TD_STYLE}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {company.careers_url && <GhostLink href={company.careers_url}>Visit Careers</GhostLink>}
                          <button
                            disabled={watchingId === company.id}
                            onClick={() => void toggleWatch(company)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                              borderRadius: '9999px', border: 'none',
                              backgroundColor: company.career_page_watched ? 'var(--bg-secondary)' : 'var(--accent)',
                              color: company.career_page_watched ? 'var(--text-primary)' : '#fff',
                              padding: '0.35rem 0.7rem', fontSize: '0.75rem', fontWeight: 500,
                              cursor: watchingId === company.id ? 'not-allowed' : 'pointer',
                              transition: 'background-color 0.15s',
                            }}
                          >
                            {watchingId === company.id ? <Spinner /> : null}
                            {company.career_page_watched ? 'Unwatch' : 'Watch'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <style>{`
        @media (min-width: 640px) { .add-company-grid { grid-template-columns: repeat(2,1fr) !important; } }
      `}</style>
    </AppShell>
  );
}

/* ────────────────────────────────────────────────────────────
   PROACTIVE OUTREACH
──────────────────────────────────────────────────────────── */
export function ProactivePage() {
  const [companies, setCompanies]       = useState<Company[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading]           = useState(true);
  const [reachingOut, setReachingOut]   = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [cr, or] = await Promise.all([fetchCompanies(), fetchOpportunities({ date: '7d' })]);
        setCompanies(cr.data);
        setOpportunities(or.data);
      } catch {
        setCompanies([]); setOpportunities([]);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function markReachedOut(company: Company) {
    setReachingOut(company.id);
    try {
      const note = `${company.notes ?? ''}\nReached out ${new Date().toISOString().slice(0, 10)}`.trim();
      await patchJson('/api/companies', { id: company.id, notes: note });
      setCompanies((cur) => cur.map((c) => c.id === company.id ? { ...c, notes: note } : c));
    } finally {
      setReachingOut(null);
    }
  }

  const coldReach = companies
    .filter((c) => companyHasProactiveSignal(c, opportunities, 90) && !companyHasDirectJobSignal(c, opportunities, 14))
    .map((c) => {
      const sigs = opportunities.filter((o) => o.company_name === c.name).sort((a, b) => new Date(b.found_at).getTime() - new Date(a.found_at).getTime());
      const latest = sigs[0];
      const fundingSignal = c.funding_stage ? `Recent funding: ${c.funding_stage}` : null;
      const pageChange    = sigs.find((o) => o.source === 'career_page' && !o.role_title)?.found_at;
      const aiLeader      = sigs.find((o) => o.source === 'google_search')?.found_at;
      return {
        ...c,
        signalReason:  fundingSignal ?? (pageChange ? 'Page updated' : aiLeader ? 'AI leader hired' : 'Signal detected'),
        signalDate:    latest?.found_at ?? c.last_checked ?? c.created_at,
        contactTitle:  c.ai_focus ? `Lead for ${c.ai_focus}` : 'Engineering Manager / Head of AI',
      };
    });

  const tier56 = companies.filter((c) => (c.tier === 5 || c.tier === 6) && !companyHasDirectJobSignal(c, opportunities, 14));

  function outreachMessage(c: Company) {
    return `Hi [Name], I noticed ${c.name} is building in AI/ML. I am an AI/ML engineer based in Ahmedabad and would love to explore whether there is a fit for current or upcoming roles on your team.`;
  }

  const cardStyle: React.CSSProperties = {
    borderRadius: '1rem',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg-secondary)',
    padding: '1rem',
  };

  const messageStyle: React.CSSProperties = {
    marginTop: '0.65rem',
    borderRadius: '0.75rem',
    backgroundColor: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    padding: '0.65rem 0.85rem',
    fontSize: '0.82rem',
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
  };

  return (
    <AppShell title="Proactive Outreach" subtitle="Companies to contact before the posting appears">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        <Panel>
          <SectionTitle eyebrow="Section 1" title="Companies to cold reach" />
          {loading
            ? <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1rem 0' }}><Spinner /><span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Loading signals…</span></div>
            : !coldReach.length
              ? <EmptyState icon="🎯" message="No proactive-only signals in the last 14 days." />
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {coldReach.map((company) => (
                    <div key={company.id} style={cardStyle}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
                        <div>
                          <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{company.name}</p>
                          <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{company.signalReason}</p>
                          <p style={{ margin: '0.15rem 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Signal: {timeAgo(company.signalDate)}</p>
                          <p style={{ margin: '0.1rem 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Contact: {company.contactTitle}</p>
                        </div>
                        <span style={{ borderRadius: '9999px', backgroundColor: 'var(--badge-watching-bg)', color: 'var(--badge-watching-text)', padding: '0.15rem 0.6rem', fontSize: '0.7rem', fontWeight: 600, flexShrink: 0 }}>
                          Signal only
                        </span>
                      </div>
                      <p style={messageStyle}>{outreachMessage(company)}</p>
                      <div style={{ marginTop: '0.65rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <GhostLink href={company.linkedin_url || `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(company.name + ' ' + company.contactTitle)}`}>
                          Find Contact on LinkedIn
                        </GhostLink>
                        <SuccessButton
                          disabled={reachingOut === company.id}
                          onClick={() => void markReachedOut(company)}
                          style={{ opacity: reachingOut === company.id ? 0.7 : 1 }}
                        >
                          {reachingOut === company.id ? <Spinner /> : null}
                          Mark Reached Out
                        </SuccessButton>
                        <CopyButton text={outreachMessage(company)} />
                      </div>
                    </div>
                  ))}
                </div>
              )
          }
        </Panel>

        <Panel>
          <SectionTitle eyebrow="Section 2" title="Tier 5–6 companies with no recent opportunity" />
          {loading
            ? <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1rem 0' }}><Spinner /><span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Loading…</span></div>
            : !tier56.length
              ? <EmptyState icon="🎯" message="Every Tier 5–6 company has a recent opportunity signal right now." />
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {tier56.map((company) => (
                    <div key={company.id} style={cardStyle}>
                      <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)' }}>{company.name}</p>
                      <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {company.location ?? 'Gujarat'} · Tier {company.tier}
                      </p>
                      <p style={messageStyle}>{outreachMessage(company)}</p>
                      <div style={{ marginTop: '0.65rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {company.careers_url && <GhostLink href={company.careers_url}>Visit Careers</GhostLink>}
                        <CopyButton text={outreachMessage(company)} />
                      </div>
                    </div>
                  ))}
                </div>
              )
          }
        </Panel>
      </div>
    </AppShell>
  );
}

/* ────────────────────────────────────────────────────────────
   TRACKER
──────────────────────────────────────────────────────────── */
export function TrackerPage() {
  const [rows, setRows]             = useState<Opportunity[]>([]);
  const [loading, setLoading]       = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [savingId, setSavingId]     = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetchTracker();
      setRows(response.data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const visible = statusFilter === 'all' ? rows : rows.filter((r) => r.status === statusFilter);

  async function updateOpportunity(id: string, updates: Partial<Opportunity>) {
    setSavingId(id);
    try {
      await patchJson('/api/tracker', { id, ...updates });
      await load();
    } finally {
      setSavingId(null);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    borderRadius: '1rem',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-primary)',
    padding: '0.5rem 0.75rem',
    fontSize: '0.82rem',
    outline: 'none',
    minHeight: '2.375rem',
    minWidth: '10rem',
    colorScheme: 'inherit' as React.CSSProperties['colorScheme'],
  };

  return (
    <AppShell title="Application Tracker" subtitle="Move entries through the pipeline without leaving the phone">
      <Panel style={{ marginBottom: '1rem' }}>
        <div style={{ maxWidth: '16rem' }}>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="new">New</option>
            <option value="applied">Applied</option>
            <option value="followed_up">Followed Up</option>
            <option value="interview">Interview</option>
            <option value="offer">Offer</option>
            <option value="rejected">Rejected</option>
          </Select>
        </div>
      </Panel>

      <Panel>
        {loading ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody><SkeletonRows cols={6} rows={5} /></tbody>
          </table>
        ) : !visible.length ? (
          <EmptyState icon="📋" message="No tracked applications yet. Mark opportunities as Applied to start tracking." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Company','Role','Applied Date','Follow-up Date','Status','Notes'].map((h) => (
                    <th key={h} style={TH_STYLE}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((item, idx) => (
                  <tr key={item.id} style={{ backgroundColor: idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary)' }}>
                    <td style={{ ...TD_STYLE, fontWeight: 600, color: 'var(--text-primary)' }}>{item.company_name}</td>
                    <td style={TD_STYLE}>{item.role_title ?? 'Open role'}</td>
                    <td style={TD_STYLE}>{item.applied_at ? timeAgo(item.applied_at) : '—'}</td>
                    <td style={TD_STYLE}>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="date"
                          defaultValue={item.follow_up_date ?? ''}
                          style={inputStyle}
                          onBlur={(e) => {
                            if (e.target.value !== (item.follow_up_date ?? '')) {
                              void updateOpportunity(item.id, { follow_up_date: e.target.value || null });
                            }
                          }}
                        />
                        {savingId === item.id && (
                          <span style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)' }}>
                            <Spinner />
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={TD_STYLE}>
                      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Select
                          value={item.status}
                          style={{ minWidth: '8rem' }}
                          onChange={(e) => void updateOpportunity(item.id, { status: e.target.value as Opportunity['status'] })}
                        >
                          <option value="new">New</option>
                          <option value="applied">Applied</option>
                          <option value="followed_up">Followed Up</option>
                          <option value="interview">Interview</option>
                          <option value="offer">Offer</option>
                          <option value="rejected">Rejected</option>
                        </Select>
                        {savingId === item.id && <Spinner />}
                      </div>
                    </td>
                    <td style={TD_STYLE}>
                      <Textarea
                        defaultValue={item.notes ?? ''}
                        rows={2}
                        style={{ minWidth: '10rem' }}
                        onBlur={(e) => {
                          if (e.target.value !== (item.notes ?? '')) {
                            void updateOpportunity(item.id, { notes: e.target.value });
                          }
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pipeline summary metrics */}
        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.65rem', gridTemplateColumns: 'repeat(2,1fr)' }} className="tracker-metrics-grid">
          {[
            { label: 'New',         value: rows.filter((r) => r.status === 'new').length,                                        cls: '' },
            { label: 'Applied',     value: rows.filter((r) => r.status === 'applied').length,                                    cls: 'metric-applied' },
            { label: 'Followed Up', value: rows.filter((r) => r.status === 'followed_up').length,                               cls: 'metric-watching' },
            { label: 'Interview',   value: rows.filter((r) => r.status === 'interview').length,                                  cls: 'metric-urgent' },
            { label: 'Closed',      value: rows.filter((r) => r.status === 'offer' || r.status === 'rejected').length,          cls: '' },
          ].map((m) => (
            <Metric key={m.label} label={m.label} value={m.value} accentClass={m.cls} />
          ))}
        </div>
      </Panel>

      <style>{`
        @media (min-width: 640px) { .tracker-metrics-grid { grid-template-columns: repeat(5,1fr) !important; } }
      `}</style>
    </AppShell>
  );
}
