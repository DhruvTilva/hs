import type {
  ApiListResponse,
  Company,
  Opportunity,
  OpportunitySource,
  OpportunityStatus,
} from '@/lib/types';

export type OpportunityFilters = {
  source?: string;
  score?: string;
  status?: string;
  date?: string;
  date_from?: string;
  date_to?: string;
};

const DIRECT_JOB_SOURCES: OpportunitySource[] = ['career_page', 'naukri', 'wellfound', 'indeed'];
const PROACTIVE_SOURCES: OpportunitySource[] = ['google_alert', 'google_search', 'linkedin_email'];

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function matchesDateFilter(foundAt: string, filters: OpportunityFilters) {
  const found = parseDate(foundAt);
  if (!found) return false;

  if (filters.date === 'today') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (found.getTime() < today.getTime()) return false;
  }

  if (filters.date === '7d' && found.getTime() < Date.now() - 7 * 24 * 60 * 60 * 1000) {
    return false;
  }

  if (filters.date_from) {
    const start = parseDate(filters.date_from);
    if (start) {
      start.setHours(0, 0, 0, 0);
      if (found.getTime() < start.getTime()) return false;
    }
  }

  if (filters.date_to) {
    const end = parseDate(filters.date_to);
    if (end) {
      end.setHours(23, 59, 59, 999);
      if (found.getTime() > end.getTime()) return false;
    }
  }

  return true;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchOpportunities(filters: OpportunityFilters = {}): Promise<ApiListResponse<Opportunity>> {
  const params = new URLSearchParams();
  if (filters.source) params.set('source', filters.source);
  if (filters.score) params.set('score', filters.score);
  if (filters.status) params.set('status', filters.status);
  if (filters.date) params.set('date', filters.date);
  if (filters.date_from) params.set('date_from', filters.date_from);
  if (filters.date_to) params.set('date_to', filters.date_to);

  const query = params.toString();
  return fetchJson<ApiListResponse<Opportunity>>(`/api/opportunities${query ? `?${query}` : ''}`);
}

export async function fetchCompanies(): Promise<ApiListResponse<Company>> {
  return fetchJson<ApiListResponse<Company>>('/api/companies');
}

export async function fetchTracker(): Promise<ApiListResponse<Opportunity>> {
  return fetchJson<ApiListResponse<Opportunity>>('/api/tracker');
}

export function filterOpportunities(opportunities: Opportunity[], filters: OpportunityFilters): Opportunity[] {
  return opportunities.filter((opportunity) => {
    const score = opportunity.priority_score ?? 0;
    const sourceMatch = !filters.source || filters.source === 'all' || opportunity.source === filters.source;
    const statusMatch = !filters.status || filters.status === 'all' || opportunity.status === filters.status;

    let scoreMatch = true;
    if (filters.score === '70+') scoreMatch = score >= 70;
    if (filters.score === '40-69') scoreMatch = score >= 40 && score < 70;
    if (filters.score === '<40') scoreMatch = score < 40;

    return sourceMatch && statusMatch && scoreMatch && matchesDateFilter(opportunity.found_at, filters);
  });
}

export function getVisibleOpportunities(opportunities: Opportunity[]) {
  const urgent = opportunities.filter((item) => (item.priority_score ?? 0) >= 70);
  const watching = opportunities.filter((item) => {
    const score = item.priority_score ?? 0;
    return score >= 40 && score < 70;
  });
  const normal = opportunities.filter((item) => (item.priority_score ?? 0) < 40);

  return { urgent, watching, normal };
}

export function scoreLabel(score: number) {
  if (score >= 70) return { label: 'Urgent', tone: 'bg-red-600 text-white' };
  if (score >= 40) return { label: 'Watching', tone: 'bg-amber-500 text-white' };
  return { label: 'Normal', tone: 'bg-slate-100 text-slate-700' };
}

export function sourceLabel(source: OpportunitySource) {
  return source
    .replace('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function statusLabel(status: OpportunityStatus) {
  return status
    .replace('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function companyHasRecentSignal(company: Pick<Company, 'name'>, opportunities: Opportunity[], days = 14) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return opportunities.some((opportunity) => {
    const found = parseDate(opportunity.found_at);
    return opportunity.company_name === company.name && !!found && found.getTime() >= cutoff;
  });
}

export function companyHasDirectJobSignal(company: Pick<Company, 'name'>, opportunities: Opportunity[], days = 14) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return opportunities.some((opportunity) => {
    const found = parseDate(opportunity.found_at);
    return opportunity.company_name === company.name && DIRECT_JOB_SOURCES.includes(opportunity.source) && !!found && found.getTime() >= cutoff;
  });
}

export function companyHasProactiveSignal(company: Pick<Company, 'name'>, opportunities: Opportunity[], days = 14) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return opportunities.some((opportunity) => {
    const found = parseDate(opportunity.found_at);
    return (
      opportunity.company_name === company.name &&
      (opportunity.signal_type === 'proactive' || PROACTIVE_SOURCES.includes(opportunity.source)) &&
      !!found &&
      found.getTime() >= cutoff
    );
  });
}
