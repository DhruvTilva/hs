"use client";

import { useEffect, useMemo, useState } from 'react';

import { AppShell } from '@/components/app-shell';
import { CopyButton } from '@/components/copy-button';
import { OpportunityCard } from '@/components/opportunity-card';
import { Button, GhostLink, Metric, Panel, Pill, PrimaryButton, SectionTitle, Select, Textarea } from '@/components/ui';
import {
  companyHasDirectJobSignal,
  companyHasProactiveSignal,
  companyHasRecentSignal,
  fetchCompanies,
  fetchOpportunities,
  fetchTracker,
  filterOpportunities,
} from '@/lib/api';
import { fallbackTrackedCompanies, sampleCompanies, sampleOpportunities } from '@/lib/sample-data';
import { timeAgo } from '@/lib/time';
import type { ApiListResponse, Company, Opportunity } from '@/lib/types';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function patchJson(url: string, body: Record<string, unknown>) {
  return fetchJson(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function TodayRadarPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>(sampleOpportunities);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  async function load() {
    try {
      const response = await fetchJson<ApiListResponse<Opportunity>>('/api/opportunities?filter=today');
      setOpportunities(response.data.length ? response.data : sampleOpportunities);
    } catch {
      setOpportunities(sampleOpportunities);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const urgent = opportunities.filter((item) => (item.priority_score ?? 0) >= 70);
  const watching = opportunities.filter((item) => {
    const score = item.priority_score ?? 0;
    return score >= 40 && score < 70;
  });
  const normal = opportunities.filter((item) => (item.priority_score ?? 0) < 40);

  async function markApplied(opportunity: Opportunity) {
    await patchJson('/api/opportunities', {
      id: opportunity.id,
      status: 'applied',
      applied_at: new Date().toISOString(),
    });
    await load();
  }

  return (
    <AppShell title="Today’s Radar" subtitle="Daily signal board for Ahmedabad, Gandhinagar, and GIFT City">
      <div className="space-y-4">
        <Panel>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Total Today" value={opportunities.length} />
            <Metric label="Urgent" value={urgent.length} />
            <Metric label="Watching" value={watching.length} />
            <Metric label="Applied" value={opportunities.filter((item) => item.status === 'applied').length} />
          </div>
        </Panel>

        <Panel>
          <SectionTitle eyebrow="Urgent" title="Score 70+" />
          <div className="space-y-3">
            {loading ? <p className="text-sm text-slate-500">Loading fresh signals…</p> : null}
            {urgent.map((opportunity) => (
              <OpportunityCard key={opportunity.id} opportunity={opportunity} onMarkApplied={markApplied} />
            ))}
            {!urgent.length && !loading ? <p className="text-sm text-slate-500">No urgent items yet.</p> : null}
          </div>
        </Panel>

        <Panel>
          <SectionTitle eyebrow="Watching" title="Score 40-69" />
          <div className="space-y-3">
            {watching.map((opportunity) => (
              <OpportunityCard key={opportunity.id} opportunity={opportunity} onMarkApplied={markApplied} />
            ))}
            {!watching.length ? <p className="text-sm text-slate-500">Nothing in watching range right now.</p> : null}
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between gap-3">
            <SectionTitle eyebrow="Normal" title="Score under 40" />
            <Button onClick={() => setExpanded((value) => !value)}>{expanded ? 'Hide' : `Show ${normal.length} more`}</Button>
          </div>
          {expanded ? (
            <div className="space-y-3">
              {normal.map((opportunity) => (
                <OpportunityCard key={opportunity.id} opportunity={opportunity} onMarkApplied={markApplied} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Collapsed to keep the phone view clean.</p>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}

export function OpportunitiesPage() {
  const [rows, setRows] = useState<Opportunity[]>(sampleOpportunities);
  const [source, setSource] = useState('all');
  const [score, setScore] = useState('all');
  const [status, setStatus] = useState('all');
  const [date, setDate] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  async function load() {
    try {
      const response = await fetchOpportunities();
      setRows(response.data.length ? response.data : sampleOpportunities);
    } catch {
      setRows(sampleOpportunities);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(
    () => filterOpportunities(rows, { source, score, status, date, date_from: dateFrom, date_to: dateTo }),
    [rows, source, score, status, date, dateFrom, dateTo],
  );

  async function markApplied(id: string) {
    await patchJson('/api/opportunities', { id, status: 'applied', applied_at: new Date().toISOString() });
    await load();
  }

  return (
    <AppShell title="All Opportunities" subtitle="Filterable action list from all scraper sources">
      <Panel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="all">All sources</option>
            <option value="career_page">Career Page</option>
            <option value="linkedin_email">LinkedIn Email</option>
            <option value="naukri">Naukri</option>
            <option value="wellfound">Wellfound</option>
            <option value="google_alert">Google Alert</option>
            <option value="indeed">Indeed</option>
            <option value="google_search">Google Search</option>
          </Select>
          <Select value={score} onChange={(event) => setScore(event.target.value)}>
            <option value="all">All scores</option>
            <option value="70+">70+</option>
            <option value="40-69">40-69</option>
            <option value="<40">&lt;40</option>
          </Select>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="new">New</option>
            <option value="applied">Applied</option>
            <option value="followed_up">Followed Up</option>
            <option value="interview">Interview</option>
            <option value="rejected">Rejected</option>
            <option value="offer">Offer</option>
          </Select>
          <Select value={date} onChange={(event) => setDate(event.target.value)}>
            <option value="all">All dates</option>
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
          </Select>
          <div className="grid gap-3 sm:col-span-2 lg:col-span-1">
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-accent"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="w-full rounded-2xl border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-accent"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <GhostLink href={`/api/opportunities?format=csv&source=${encodeURIComponent(source)}&score=${encodeURIComponent(score)}&status=${encodeURIComponent(status)}&date=${encodeURIComponent(date)}&date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`}>
            Export CSV
          </GhostLink>
          <Button
            onClick={() => {
              setSource('all');
              setScore('all');
              setStatus('all');
              setDate('all');
              setDateFrom('');
              setDateTo('');
            }}
          >
            Reset Filters
          </Button>
        </div>
      </Panel>

      <Panel className="mt-4 overflow-hidden">
        <SectionTitle eyebrow="Table" title={`${visible.length} visible opportunities`} />
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="px-3 py-3 text-slate-500">{timeAgo(item.found_at)}</td>
                  <td className="px-3 py-3 font-medium text-ink">{item.company_name}</td>
                  <td className="px-3 py-3 text-slate-700">{item.role_title ?? 'Open role'}</td>
                  <td className="px-3 py-3 text-slate-700">{item.location ?? '-'}</td>
                  <td className="px-3 py-3 text-slate-700">{item.source}</td>
                  <td className="px-3 py-3 text-slate-700">{item.priority_score ?? 0}</td>
                  <td className="px-3 py-3 text-slate-700">{item.status}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      {item.apply_url ? <GhostLink href={item.apply_url}>Apply</GhostLink> : null}
                      <Button onClick={() => void markApplied(item.id)}>Mark Applied</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </AppShell>
  );
}

export function CompaniesPage() {
  const [companies, setCompanies] = useState<(Company & { last_signal?: string; last_signal_score?: number })[]>(fallbackTrackedCompanies());

  async function load() {
    try {
      const [companiesResponse, opportunitiesResponse] = await Promise.all([
        fetchCompanies(),
        fetchOpportunities({ date: '7d' }),
      ]);
      const list = companiesResponse.data.length ? companiesResponse.data : sampleCompanies;
      const opportunities = opportunitiesResponse.data.length ? opportunitiesResponse.data : sampleOpportunities;
      setCompanies(
        list.map((company) => {
          const latest = opportunities
            .filter((opportunity) => opportunity.company_name === company.name)
            .sort((a, b) => (b.found_at ?? '').localeCompare(a.found_at ?? ''))[0];

          return {
            ...company,
            last_signal: latest ? `${latest.source} · ${latest.role_title ?? 'Open role'}` : company.notes ?? 'No signal yet',
            last_signal_score: latest?.priority_score ?? company.priority_base_score ?? 0,
          };
        }),
      );
    } catch {
      setCompanies(fallbackTrackedCompanies());
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function updateCompany(id: string, updates: Partial<Company>) {
    await patchJson('/api/companies', { id, ...updates });
    await load();
  }

  return (
    <AppShell title="Company Watch List" subtitle="Curated set of targets and watch flags">
      <Panel>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Tier</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Career Watched</th>
                <th className="px-3 py-2">Last Signal</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {companies.map((company, index) => (
                <tr key={company.id} className="align-top">
                  <td className="px-3 py-3 text-slate-500">{index + 1}</td>
                  <td className="px-3 py-3 font-medium text-ink">{company.name}</td>
                  <td className="px-3 py-3 text-slate-700">{company.tier ?? '-'}</td>
                  <td className="px-3 py-3 text-slate-700">{company.location ?? '-'}</td>
                  <td className="px-3 py-3 text-slate-700">{company.last_signal_score ?? company.priority_base_score ?? 0}</td>
                  <td className="px-3 py-3 text-slate-700">{company.career_page_watched ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-3 text-slate-700">{company.last_signal ?? 'No signal yet'}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      {company.careers_url ? <GhostLink href={company.careers_url}>Visit Careers</GhostLink> : null}
                      <PrimaryButton className="px-3 py-2 text-xs" onClick={() => void updateCompany(company.id, { career_page_watched: !company.career_page_watched })}>
                        {company.career_page_watched ? 'Unwatch' : 'Watch'}
                      </PrimaryButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </AppShell>
  );
}

export function ProactivePage() {
  const [companies, setCompanies] = useState<Company[]>(sampleCompanies);
  const [opportunities, setOpportunities] = useState<Opportunity[]>(sampleOpportunities);

  useEffect(() => {
    async function load() {
      try {
        const [companiesResponse, opportunitiesResponse] = await Promise.all([
          fetchCompanies(),
          fetchOpportunities({ date: '7d' }),
        ]);
        setCompanies(companiesResponse.data.length ? companiesResponse.data : sampleCompanies);
        setOpportunities(opportunitiesResponse.data.length ? opportunitiesResponse.data : sampleOpportunities);
      } catch {
        setCompanies(sampleCompanies);
        setOpportunities(sampleOpportunities);
      }
    }

    void load();
  }, []);

  async function markReachedOut(company: Company) {
    await patchJson('/api/companies', {
      id: company.id,
      notes: `${company.notes ?? ''}\nReached out ${new Date().toISOString().slice(0, 10)}`.trim(),
    });
    setCompanies((current) =>
      current.map((item) =>
        item.id === company.id
          ? { ...item, notes: `${item.notes ?? ''}\nReached out ${new Date().toISOString().slice(0, 10)}`.trim() }
          : item,
      ),
    );
  }

  const coldReach = companies
    .filter((company) => companyHasProactiveSignal(company, opportunities, 90) && !companyHasDirectJobSignal(company, opportunities, 14))
    .map((company) => {
      const companySignals = opportunities
        .filter((opportunity) => opportunity.company_name === company.name)
        .sort((a, b) => new Date(b.found_at).getTime() - new Date(a.found_at).getTime());
      const latestSignal = companySignals[0];
      const fundingSignal = company.funding_stage ? `Recent funding: ${company.funding_stage}` : null;
      const pageChangeSignal = companySignals.find((opportunity) => opportunity.source === 'career_page' && !opportunity.role_title)?.found_at;
      const aiLeaderSignal = companySignals.find((opportunity) => opportunity.source === 'google_search')?.found_at;

      return {
        ...company,
        signalReason: fundingSignal ?? (pageChangeSignal ? 'Page updated' : aiLeaderSignal ? 'AI leader hired' : 'Signal detected'),
        signalDate: latestSignal?.found_at ?? company.last_checked ?? company.created_at,
        contactTitle: company.ai_focus ? `Lead for ${company.ai_focus}` : 'Engineering Manager / Head of AI',
      };
    });
  const tierSixNoRecentOpportunity = companies.filter((company) => {
    const hasRecentOpportunity = companyHasDirectJobSignal(company, opportunities, 14);
    return (company.tier === 5 || company.tier === 6) && !hasRecentOpportunity;
  });

  function outreachMessage(company: Company) {
    return `Hi [Name], I noticed ${company.name} is building in AI/ML. I am an AI/ML engineer based in Ahmedabad and would love to explore whether there is a fit for current or upcoming roles on your team.`;
  }

  return (
    <AppShell title="Proactive Outreach" subtitle="Companies to contact before the posting appears">
      <div className="space-y-4">
        <Panel>
          <SectionTitle eyebrow="Section 1" title="Companies to cold reach" />
          <div className="space-y-3">
            {coldReach.map((company) => (
              <div key={company.id} className="rounded-2xl border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{company.name}</p>
                    <p className="text-sm text-slate-600">{company.signalReason}</p>
                    <p className="mt-1 text-xs text-slate-500">Signal date: {timeAgo(company.signalDate)}</p>
                    <p className="mt-1 text-xs text-slate-500">Suggested contact: {company.contactTitle}</p>
                  </div>
                  <Pill>Signal only</Pill>
                </div>
                <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">{outreachMessage(company)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <GhostLink href={company.linkedin_url || `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(company.name + ' ' + company.contactTitle)}`}>
                    Find Contact on LinkedIn
                  </GhostLink>
                  <Button onClick={() => void markReachedOut(company)}>
                    Mark Reached Out
                  </Button>
                  <CopyButton text={outreachMessage(company)} />
                </div>
              </div>
            ))}
            {!coldReach.length ? <p className="text-sm text-slate-500">No proactive-only signals in the last 14 days.</p> : null}
          </div>
        </Panel>

        <Panel>
          <SectionTitle eyebrow="Section 2" title="Tier 5-6 companies with no recent opportunity" />
          <div className="space-y-3">
            {tierSixNoRecentOpportunity.map((company) => (
              <div key={company.id} className="rounded-2xl border border-line p-4">
                <p className="font-medium text-ink">{company.name}</p>
                <p className="mt-1 text-sm text-slate-600">{company.location ?? 'Gujarat'} · Tier {company.tier}</p>
                <p className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">{outreachMessage(company)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {company.careers_url ? <GhostLink href={company.careers_url}>Visit Careers</GhostLink> : null}
                  <CopyButton text={outreachMessage(company)} />
                </div>
              </div>
            ))}
            {!tierSixNoRecentOpportunity.length ? <p className="text-sm text-slate-500">Every Tier 5-6 company has a recent opportunity signal right now.</p> : null}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

export function TrackerPage() {
  const [rows, setRows] = useState<Opportunity[]>(sampleOpportunities);
  const [statusFilter, setStatusFilter] = useState('all');

  async function load() {
    try {
      const response = await fetchTracker();
      setRows(response.data.length ? response.data : sampleOpportunities);
    } catch {
      setRows(sampleOpportunities);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const visible = statusFilter === 'all' ? rows : rows.filter((row) => row.status === statusFilter);

  async function updateOpportunity(id: string, updates: Partial<Opportunity>) {
    await patchJson('/api/tracker', { id, ...updates });
    await load();
  }

  return (
    <AppShell title="Application Tracker" subtitle="Move entries through the pipeline without leaving the phone">
      <Panel>
        <div className="max-w-xs">
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
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

      <Panel className="mt-4">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.18em] text-slate-500">
              <tr>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Applied Date</th>
                <th className="px-3 py-2">Follow-up Date</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="px-3 py-3 font-medium text-ink">{item.company_name}</td>
                  <td className="px-3 py-3 text-slate-700">{item.role_title ?? 'Open role'}</td>
                  <td className="px-3 py-3 text-slate-700">{item.applied_at ? timeAgo(item.applied_at) : '-'}</td>
                  <td className="px-3 py-3">
                    <input
                      type="date"
                      defaultValue={item.follow_up_date ?? ''}
                      className="w-full min-w-[10rem] rounded-2xl border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-accent"
                      onBlur={(event) => {
                        if (event.target.value !== (item.follow_up_date ?? '')) {
                          void updateOpportunity(item.id, { follow_up_date: event.target.value || null });
                        }
                      }}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <Select value={item.status} onChange={(event) => void updateOpportunity(item.id, { status: event.target.value as Opportunity['status'] })}>
                      <option value="new">New</option>
                      <option value="applied">Applied</option>
                      <option value="followed_up">Followed Up</option>
                      <option value="interview">Interview</option>
                      <option value="offer">Offer</option>
                      <option value="rejected">Rejected</option>
                    </Select>
                  </td>
                  <td className="px-3 py-3">
                    <Textarea
                      defaultValue={item.notes ?? ''}
                      rows={2}
                      onBlur={(event) => {
                        if (event.target.value !== (item.notes ?? '')) {
                          void updateOpportunity(item.id, { notes: event.target.value });
                        }
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-5">
          <Metric label="New" value={rows.filter((item) => item.status === 'new').length} />
          <Metric label="Applied" value={rows.filter((item) => item.status === 'applied').length} />
          <Metric label="Followed Up" value={rows.filter((item) => item.status === 'followed_up').length} />
          <Metric label="Interview" value={rows.filter((item) => item.status === 'interview').length} />
          <Metric label="Closed" value={rows.filter((item) => item.status === 'offer' || item.status === 'rejected').length} />
        </div>
      </Panel>
    </AppShell>
  );
}
