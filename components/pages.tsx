"use client";

import { useEffect, useMemo, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { CompanyDiscovery } from '@/components/company-discovery';
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
   COMPANIES
──────────────────────────────────────────────────────────── */
type AddCompanyForm = {
  name: string; website: string; careers_url: string; linkedin_url: string;
  location: string; tier: string; ai_focus: string; notes: string;
};
const EMPTY_FORM: AddCompanyForm = { name: '', website: '', careers_url: '', linkedin_url: '', location: '', tier: '', ai_focus: '', notes: '' };


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

export function CompaniesPage() {
  const [companies, setCompanies] = useState<(Company & { last_signal?: string; last_signal_score?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [watchingId, setWatchingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddCompanyForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [activeTab, setActiveTab] = useState<'watchlist' | 'discover'>('watchlist');

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
    <AppShell title="Company Intelligence" subtitle="Curated set of targets and watch flags">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
          <button
            onClick={() => setActiveTab('watchlist')}
            style={{
              background: activeTab === 'watchlist' ? 'var(--text-primary)' : 'transparent',
              color: activeTab === 'watchlist' ? 'var(--bg-primary)' : 'var(--text-secondary)',
              border: 'none', borderRadius: '9999px', padding: '0.4rem 1rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Manual / Imported Watchlist
          </button>
          <button
            onClick={() => setActiveTab('discover')}
            style={{
              background: activeTab === 'discover' ? 'var(--text-primary)' : 'transparent',
              color: activeTab === 'discover' ? 'var(--bg-primary)' : 'var(--text-secondary)',
              border: 'none', borderRadius: '9999px', padding: '0.4rem 1rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Discovered Companies
          </button>
        </div>

        {activeTab === 'discover' ? (
          <CompanyDiscovery />
        ) : (
          <>
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
          </>
        )}
      </div>

      <style>{`
        @media (min-width: 640px) { .add-company-grid { grid-template-columns: repeat(2,1fr) !important; } }
      `}</style>
    </AppShell>
  );
}
