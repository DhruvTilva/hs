import type { CompanyRecord, OpportunityRecord } from '@/lib/types';
import { sampleCompanies, sampleOpportunities } from '@/lib/mock-data';
import { createServerSupabase } from '@/lib/supabase';

type OpportunityFilters = {
  source?: string;
  score?: string;
  status?: string;
  date?: string;
};

function filterOpportunities(rows: OpportunityRecord[], filters: OpportunityFilters): OpportunityRecord[] {
  return rows.filter((row) => {
    const score = row.priority_score ?? 0;
    const foundAt = row.found_at ? new Date(row.found_at) : null;

    if (filters.source && filters.source !== 'all' && row.source !== filters.source) {
      return false;
    }

    if (filters.score && filters.score !== 'all') {
      if (filters.score === '70' && score < 70) return false;
      if (filters.score === '40' && (score < 40 || score >= 70)) return false;
      if (filters.score === '0' && score >= 40) return false;
    }

    if (filters.status && filters.status !== 'all' && row.status !== filters.status) {
      return false;
    }

    if (filters.date && filters.date !== 'all' && foundAt) {
      const now = Date.now();
      const ageDays = (now - foundAt.getTime()) / 86400000;
      if (filters.date === 'today' && ageDays > 1) return false;
      if (filters.date === '7d' && ageDays > 7) return false;
    }

    return true;
  });
}

function normalizeOpportunity(row: Record<string, unknown>): OpportunityRecord {
  return {
    id: String(row.id ?? crypto.randomUUID()),
    company_name: String(row.company_name ?? row.companyName ?? 'Unknown'),
    role_title: (row.role_title as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    source: (row.source as string | null) ?? null,
    signal_type: (row.signal_type as string | null) ?? null,
    apply_url: (row.apply_url as string | null) ?? null,
    contact_name: (row.contact_name as string | null) ?? null,
    contact_email: (row.contact_email as string | null) ?? null,
    contact_linkedin: (row.contact_linkedin as string | null) ?? null,
    priority_score: (row.priority_score as number | null) ?? null,
    freshness_score: (row.freshness_score as number | null) ?? null,
    raw_data: (row.raw_data as Record<string, unknown> | null) ?? null,
    status: (row.status as string | null) ?? 'new',
    found_at: (row.found_at as string | null) ?? null,
    applied_at: (row.applied_at as string | null) ?? null,
    follow_up_date: (row.follow_up_date as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    is_duplicate: (row.is_duplicate as boolean | null) ?? null,
    duplicate_of: (row.duplicate_of as string | null) ?? null,
  };
}

function normalizeCompany(row: Record<string, unknown>): CompanyRecord {
  return {
    id: String(row.id ?? crypto.randomUUID()),
    name: String(row.name ?? 'Unknown'),
    tier: (row.tier as number | null) ?? null,
    category: (row.category as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    website: (row.website as string | null) ?? null,
    careers_url: (row.careers_url as string | null) ?? null,
    linkedin_url: (row.linkedin_url as string | null) ?? null,
    company_size: (row.company_size as string | null) ?? null,
    ai_focus: (row.ai_focus as string | null) ?? null,
    funding_stage: (row.funding_stage as string | null) ?? null,
    priority_base_score: (row.priority_base_score as number | null) ?? null,
    google_alert_set: (row.google_alert_set as boolean | null) ?? null,
    li_alert_set: (row.li_alert_set as boolean | null) ?? null,
    career_page_watched: (row.career_page_watched as boolean | null) ?? null,
    last_careers_hash: (row.last_careers_hash as string | null) ?? null,
    last_checked: (row.last_checked as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
  };
}

export async function getOpportunities(filters: OpportunityFilters = {}): Promise<OpportunityRecord[]> {
  const client = createServerSupabase();

  if (!client) {
    return filterOpportunities(sampleOpportunities, filters).sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0));
  }

  const response = await client
    .from('opportunities')
    .select('*')
    .order('found_at', { ascending: false })
    .limit(500);

  if (response.error || !response.data?.length) {
    return filterOpportunities(sampleOpportunities, filters).sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0));
  }

  return filterOpportunities(response.data.map(normalizeOpportunity), filters);
}

export async function getCompanies(): Promise<CompanyRecord[]> {
  const client = createServerSupabase();

  if (!client) {
    return sampleCompanies;
  }

  const response = await client.from('companies').select('*').order('priority_base_score', { ascending: false }).limit(500);
  if (response.error || !response.data?.length) {
    return sampleCompanies;
  }

  return response.data.map(normalizeCompany);
}

export function buildStats(rows: OpportunityRecord[]) {
  const total = rows.length;
  const urgent = rows.filter((row) => (row.priority_score ?? 0) >= 70).length;
  const watching = rows.filter((row) => {
    const score = row.priority_score ?? 0;
    return score >= 40 && score < 70;
  }).length;
  const applied = rows.filter((row) => row.status === 'applied').length;

  return { total, urgent, watching, applied };
}

export function proactiveRows(companies: CompanyRecord[], opportunities: OpportunityRecord[]) {
  const opportunityCompanies = new Set(opportunities.map((row) => row.company_name.toLowerCase()));

  return companies
    .map((company) => {
      const hasOpportunity = opportunityCompanies.has(company.name.toLowerCase());
      const reason = company.funding_stage ? `Recent funding: ${company.funding_stage}` : hasOpportunity ? 'Career page changed' : 'No jobs posted yet';

      return {
        id: company.id,
        name: company.name,
        reason,
        signal_date: company.last_checked ?? company.created_at ?? new Date().toISOString(),
        contact_title: company.ai_focus ?? 'Hiring manager',
        linkedin_search: `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(company.name + ' hiring AI ML')}`,
        no_jobs: !hasOpportunity,
        notes: company.notes,
      };
    })
    .sort((a, b) => Number(b.no_jobs) - Number(a.no_jobs));
}
