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
import { parseCsv, validateRow, mapRowToCompany, deduplicateRows, extractSheetId } from '@/lib/import-service';

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

type SortConfig = { key: string | null; direction: 'asc' | 'desc'; };
type FilterConfig = { company: string; tier: string[]; location: string[]; watched: 'all' | 'yes' | 'no'; };
const DEFAULT_SORT: SortConfig = { key: null, direction: 'asc' };
const DEFAULT_FILTERS: FilterConfig = { company: '', tier: [], location: [], watched: 'all' };

export function CompaniesPage() {
  const [companies, setCompanies] = useState<(Company & { last_signal_score?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [watchingId, setWatchingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AddCompanyForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [isMounted, setIsMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'watchlist' | 'discover'>('watchlist');
  const [sort, setSort] = useState<SortConfig>(DEFAULT_SORT);
  const [filters, setFilters] = useState<FilterConfig>(DEFAULT_FILTERS);
  const [openPopover, setOpenPopover] = useState<string | null>(null);

  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{ imported: number, skipped: number, errors: number, errorDetails?: string[] } | null>(null);

  useEffect(() => {
    setIsMounted(true);
    try {
      const savedSort = localStorage.getItem('hs_companies_sort');
      if (savedSort) setSort(JSON.parse(savedSort));
      const savedFilters = localStorage.getItem('hs_companies_filters');
      if (savedFilters) setFilters(JSON.parse(savedFilters));
      const savedTab = localStorage.getItem('hs_companies_tab');
      if (savedTab === 'watchlist' || savedTab === 'discover') setActiveTab(savedTab);
    } catch (e) { }
  }, []);

  useEffect(() => {
    if (isMounted) {
      localStorage.setItem('hs_companies_sort', JSON.stringify(sort));
      localStorage.setItem('hs_companies_filters', JSON.stringify(filters));
      localStorage.setItem('hs_companies_tab', activeTab);
    }
  }, [sort, filters, activeTab, isMounted]);

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

  async function toggleWatch(company: Company & { last_signal_score?: number }) {
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
    setSaving(true);
    setToast(null);
    try {
      const res = await fetchJson<{ ok: boolean; error?: string; data?: Company }>('/api/companies', {
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

  async function handleImport() {
    if (!importUrl) return;
    const sheetId = extractSheetId(importUrl);
    if (!sheetId) {
      setToast({ msg: 'Invalid Google Sheet URL', ok: false });
      return;
    }
    
    setImporting(true);
    setImportSummary(null);
    setToast({ msg: 'Fetching Google Sheet...', ok: true });
    
    try {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
      const res = await fetch(csvUrl);
      if (!res.ok) throw new Error('Failed to fetch public sheet. Make sure it is public.');
      
      const csvText = await res.text();
      const rows = parseCsv(csvText);
      if (rows.length === 0) {
        setToast({ msg: 'Sheet is empty or invalid format', ok: false });
        setImporting(false);
        return;
      }
      
      let errorCount = 0;
      const errorDetails: string[] = [];
      const validRows: Partial<Company>[] = [];
      
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const val = validateRow(row);
        if (!val.ok) {
          errorCount++;
          if (errorDetails.length < 5) {
             errorDetails.push(`Row ${i + 2}: Missing ${val.errors.join(', ')}`);
          }
        } else {
          validRows.push(mapRowToCompany(row));
        }
      }
      
      const { newRows, skipped } = deduplicateRows(validRows, companies);
      
      if (newRows.length > 0) {
        setToast({ msg: `Importing ${newRows.length} companies...`, ok: true });
        const bulkRes = await fetchJson<{ok: boolean, error?: string, inserted: number}>('/api/companies/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companies: newRows })
        });
        
        if (!bulkRes.ok) throw new Error(bulkRes.error || 'Import failed');
        
        setImportSummary({
          imported: bulkRes.inserted,
          skipped,
          errors: errorCount,
          errorDetails
        });
        
        await load();
        setImportUrl('');
        setToast({ msg: 'Import complete!', ok: true });
      } else {
        setImportSummary({
          imported: 0,
          skipped,
          errors: errorCount,
          errorDetails
        });
        setToast({ msg: 'No new companies to import.', ok: true });
      }
    } catch (e: any) {
      setToast({ msg: e.message || 'Import failed', ok: false });
    } finally {
      setImporting(false);
    }
  }

  const inputCls = 'hs-input';
  const formGrid: React.CSSProperties = { display: 'grid', gap: '0.65rem', gridTemplateColumns: '1fr' };

  const filteredAndSortedCompanies = useMemo(() => {
    let result = [...companies];
    if (filters.company) {
      const term = filters.company.toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(term));
    }
    if (filters.tier.length > 0) {
      result = result.filter(c => c.tier != null && filters.tier.includes(c.tier.toString()));
    }
    if (filters.location.length > 0) {
      result = result.filter(c => c.location != null && filters.location.includes(c.location));
    }
    if (filters.watched !== 'all') {
      const isWatched = filters.watched === 'yes';
      result = result.filter(c => c.career_page_watched === isWatched);
    }
    if (sort.key) {
      result.sort((a, b) => {
        let valA: any = a[sort.key as keyof typeof a];
        let valB: any = b[sort.key as keyof typeof b];
        if (sort.key === 'score') {
          valA = a.last_signal_score ?? a.priority_base_score ?? 0;
          valB = b.last_signal_score ?? b.priority_base_score ?? 0;
        } else if (sort.key === 'watched') {
          valA = a.career_page_watched ? 1 : 0;
          valB = b.career_page_watched ? 1 : 0;
        } else if (sort.key === 'company') {
          valA = a.name; valB = b.name;
        }
        if (valA == null) valA = '';
        if (valB == null) valB = '';
        if (typeof valA === 'string' && typeof valB === 'string') {
          const cmp = valA.localeCompare(valB);
          if (cmp !== 0) return sort.direction === 'asc' ? cmp : -cmp;
        } else {
          if (valA < valB) return sort.direction === 'asc' ? -1 : 1;
          if (valA > valB) return sort.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return result;
  }, [companies, sort, filters]);

  const uniqueLocations = useMemo(() => {
    const locs = new Set<string>();
    companies.forEach(c => { if (c.location) locs.add(c.location); });
    return Array.from(locs).sort();
  }, [companies]);

  const uniqueTiers = useMemo(() => {
    const t = new Set<string>();
    companies.forEach(c => { if (c.tier != null) t.add(c.tier.toString()); });
    return Array.from(t).sort();
  }, [companies]);

  const isFiltered = filters.company !== '' || filters.tier.length > 0 || filters.location.length > 0 || filters.watched !== 'all';

  function ColumnHeader({ column, label, sortable, filterNode }: { column: string, label: string, sortable?: boolean, filterNode?: React.ReactNode }) {
    const isOpen = openPopover === column;
    const isFilteredCol = (column === 'company' && filters.company) ||
      (column === 'tier' && filters.tier.length > 0) ||
      (column === 'location' && filters.location.length > 0) ||
      (column === 'watched' && filters.watched !== 'all');

    return (
      <th style={{ ...TH_STYLE, position: 'relative' }}>
        <div
          onClick={() => setOpenPopover(isOpen ? null : column)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: (sortable || filterNode) ? 'pointer' : 'default', userSelect: 'none' }}
        >
          <span>{label}</span>
          {sort.key === column && (
            <span style={{ color: 'var(--accent)', fontSize: '0.7rem' }}>
              {sort.direction === 'asc' ? '▲' : '▼'}
            </span>
          )}
          {isFilteredCol ? (
            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--accent)', display: 'inline-block' }} />
          ) : null}
          {(sortable || filterNode) && <span style={{ opacity: 0.5, fontSize: '0.6rem' }}>▼</span>}
        </div>
        {isOpen && (sortable || filterNode) && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setOpenPopover(null)} />
            <div
              style={{
                position: 'absolute', top: '100%', left: 0, marginTop: '0.25rem', zIndex: 20,
                backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '0.5rem',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)', padding: '0.75rem', minWidth: '12rem',
                textTransform: 'none', letterSpacing: 'normal', fontWeight: 'normal', color: 'var(--text-primary)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {sortable && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: filterNode ? '0.75rem' : 0, paddingBottom: filterNode ? '0.75rem' : 0, borderBottom: filterNode ? '1px solid var(--border)' : 'none' }}>
                  <button
                    onClick={() => { setSort({ key: column, direction: 'asc' }); setOpenPopover(null); }}
                    style={{ background: sort.key === column && sort.direction === 'asc' ? 'var(--bg-secondary)' : 'transparent', border: 'none', padding: '0.4rem 0.5rem', textAlign: 'left', borderRadius: '0.25rem', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                  >
                    ↑ Sort {column === 'score' ? 'Low → High' : (column === 'watched' ? 'Ascending' : 'A → Z')}
                  </button>
                  <button
                    onClick={() => { setSort({ key: column, direction: 'desc' }); setOpenPopover(null); }}
                    style={{ background: sort.key === column && sort.direction === 'desc' ? 'var(--bg-secondary)' : 'transparent', border: 'none', padding: '0.4rem 0.5rem', textAlign: 'left', borderRadius: '0.25rem', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                  >
                    ↓ Sort {column === 'score' ? 'High → Low' : (column === 'watched' ? 'Descending' : 'Z → A')}
                  </button>
                </div>
              )}
              {filterNode}
            </div>
          </>
        )}
      </th>
    );
  }

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
                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
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

                    <div style={{ flex: 1, minWidth: '1rem' }} />
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input 
                        className={inputCls} 
                        style={{ width: '280px', margin: 0 }} 
                        placeholder="Google Sheet URL" 
                        value={importUrl} 
                        onChange={e => setImportUrl(e.target.value)} 
                      />
                      <button
                        type="button"
                        onClick={() => void handleImport()}
                        disabled={importing || !importUrl}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                          borderRadius: '9999px', border: '1px solid var(--border)',
                          backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
                          padding: '0.4rem 1rem', fontSize: '0.8rem', fontWeight: 600,
                          cursor: (importing || !importUrl) ? 'not-allowed' : 'pointer', opacity: (importing || !importUrl) ? 0.7 : 1,
                        }}
                      >
                        {importing && <Spinner />}
                        {importing ? 'Importing…' : 'Import Companies'}
                      </button>
                    </div>
                  </div>

                  {importSummary && (
                    <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: '0.5rem', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Import Summary</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <p><strong>Companies Imported:</strong> <span style={{ color: 'var(--normal)' }}>{importSummary.imported}</span></p>
                        <p><strong>Duplicates Skipped:</strong> <span style={{ color: 'var(--text-muted)' }}>{importSummary.skipped}</span></p>
                        <p><strong>Rows Failed:</strong> <span style={{ color: importSummary.errors > 0 ? 'var(--urgent)' : 'var(--text-muted)' }}>{importSummary.errors}</span></p>
                      </div>
                      {importSummary.errorDetails && importSummary.errorDetails.length > 0 && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--urgent)' }}>
                          <em>Sample Errors:</em>
                          <ul style={{ paddingLeft: '1.2rem', marginTop: '0.25rem' }}>
                            {importSummary.errorDetails.map((err, i) => <li key={i}>{err}</li>)}
                          </ul>
                        </div>
                      )}
                      <button type="button" onClick={() => setImportSummary(null)} style={{ marginTop: '0.5rem', fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', border: '1px solid var(--border)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', cursor: 'pointer' }}>Dismiss</button>
                    </div>
                  )}
                </form>
              )}
            </Panel>

            {/* Companies table */}
            <Panel>
              {loading ? (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody><SkeletonRows cols={7} rows={6} /></tbody>
                </table>
              ) : !companies.length ? (
                <EmptyState icon="🏢" message="No companies yet. Use '+ Add Company' or import companies_seed.csv." />
              ) : (
                <>
                  {isFiltered && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Showing {filteredAndSortedCompanies.length} of {companies.length} companies</span>
                      <button
                        onClick={() => setFilters(DEFAULT_FILTERS)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
                      >
                        Clear All Filters
                      </button>
                    </div>
                  )}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ minWidth: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={TH_STYLE}>#</th>
                          <ColumnHeader
                            column="company" label="COMPANY" sortable
                            filterNode={
                              <div>
                                <input
                                  autoFocus
                                  placeholder="Filter by name..."
                                  value={filters.company}
                                  onChange={(e) => setFilters(prev => ({ ...prev, company: e.target.value }))}
                                  style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '0.25rem', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                                />
                              </div>
                            }
                          />
                          <ColumnHeader
                            column="tier" label="TIER" sortable
                            filterNode={
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '12rem', overflowY: 'auto' }}>
                                {uniqueTiers.map(t => (
                                  <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                                    <input
                                      type="checkbox"
                                      checked={filters.tier.includes(t)}
                                      onChange={(e) => {
                                        if (e.target.checked) setFilters(prev => ({ ...prev, tier: [...prev.tier, t] }));
                                        else setFilters(prev => ({ ...prev, tier: prev.tier.filter(x => x !== t) }));
                                      }}
                                    />
                                    Tier {t}
                                  </label>
                                ))}
                              </div>
                            }
                          />
                          <ColumnHeader
                            column="location" label="LOCATION" sortable
                            filterNode={
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '12rem', overflowY: 'auto' }}>
                                {uniqueLocations.map(l => (
                                  <label key={l} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                                    <input
                                      type="checkbox"
                                      checked={filters.location.includes(l)}
                                      onChange={(e) => {
                                        if (e.target.checked) setFilters(prev => ({ ...prev, location: [...prev.location, l] }));
                                        else setFilters(prev => ({ ...prev, location: prev.location.filter(x => x !== l) }));
                                      }}
                                    />
                                    {l}
                                  </label>
                                ))}
                              </div>
                            }
                          />
                          <ColumnHeader column="score" label="SCORE" sortable />
                          <ColumnHeader
                            column="watched" label="WATCHED" sortable
                            filterNode={
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                {['all', 'yes', 'no'].map(opt => (
                                  <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', cursor: 'pointer', textTransform: 'capitalize' }}>
                                    <input
                                      type="radio"
                                      name="watched_filter"
                                      checked={filters.watched === opt}
                                      onChange={() => setFilters(prev => ({ ...prev, watched: opt as any }))}
                                    />
                                    {opt}
                                  </label>
                                ))}
                              </div>
                            }
                          />
                          <th style={TH_STYLE}>ACTION</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAndSortedCompanies.map((company, idx) => (
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
                            <td style={TD_STYLE}>
                              <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '0.4rem', alignItems: 'center' }}>
                                {company.careers_url ? (
                                  <a href={company.careers_url} target="_blank" rel="noopener noreferrer" style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    borderRadius: '0.35rem', border: '1px solid var(--border)',
                                    backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)',
                                    padding: '0.35rem', fontSize: '0.85rem',
                                    cursor: 'pointer', transition: 'all 0.15s', textDecoration: 'none'
                                  }} title="Visit Careers">
                                    💼
                                  </a>
                                ) : (
                                  <span style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    borderRadius: '0.35rem', border: '1px solid transparent',
                                    backgroundColor: 'transparent', color: 'var(--text-muted)',
                                    padding: '0.35rem', fontSize: '0.85rem',
                                    opacity: 0.4, cursor: 'not-allowed'
                                  }} title="No Careers URL">
                                    💼
                                  </span>
                                )}

                                {company.linkedin_url ? (
                                  <a href={company.linkedin_url} target="_blank" rel="noopener noreferrer" style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    borderRadius: '0.35rem', border: '1px solid var(--border)',
                                    backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)',
                                    padding: '0.35rem', fontSize: '0.85rem',
                                    cursor: 'pointer', transition: 'all 0.15s', textDecoration: 'none'
                                  }} title="Visit LinkedIn">
                                    🔗
                                  </a>
                                ) : (
                                  <span style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    borderRadius: '0.35rem', border: '1px solid transparent',
                                    backgroundColor: 'transparent', color: 'var(--text-muted)',
                                    padding: '0.35rem', fontSize: '0.85rem',
                                    opacity: 0.4, cursor: 'not-allowed'
                                  }} title="No LinkedIn URL">
                                    🔗
                                  </span>
                                )}

                                <button
                                  disabled={watchingId === company.id}
                                  title={company.career_page_watched ? 'Unwatch' : 'Watch'}
                                  onClick={() => void toggleWatch(company)}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    borderRadius: '0.35rem', border: company.career_page_watched ? '1px solid var(--accent)' : '1px solid var(--border)',
                                    backgroundColor: company.career_page_watched ? 'var(--accent)' : 'var(--bg-primary)',
                                    color: company.career_page_watched ? '#fff' : 'var(--text-secondary)',
                                    padding: '0.35rem', fontSize: '0.85rem',
                                    cursor: watchingId === company.id ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.15s'
                                  }}
                                >
                                  {watchingId === company.id ? <Spinner /> : (company.career_page_watched ? '⭐' : '☆')}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
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
