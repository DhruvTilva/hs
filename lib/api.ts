import type {
  ApiListResponse,
  Company,
  Opportunity,
  OpportunitySource,
  OpportunityStatus,
  ScraperLog,
  TrackerSummary,
  WeeklyStats,
} from '@/lib/types';

export type OpportunityFilters = {
  source?: string;
  score?: string;
  status?: string;
  date?: string;
  date_from?: string;
  date_to?: string;
  location?: string;
  role?: string;
  company?: string;
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

  if (filters.date === '3h' && found.getTime() < Date.now() - 3 * 60 * 60 * 1000) return false;
  if (filters.date === '30h' && found.getTime() < Date.now() - 30 * 60 * 60 * 1000) return false;
  if (filters.date === '3d' && found.getTime() < Date.now() - 3 * 24 * 60 * 60 * 1000) return false;
  if (filters.date === '7d' && found.getTime() < Date.now() - 7 * 24 * 60 * 60 * 1000) return false;

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

export async function fetchWeeklyStats(): Promise<WeeklyStats> {
  return fetchJson<WeeklyStats>('/api/weekly-stats');
}

export async function fetchTrackerSummary(): Promise<TrackerSummary> {
  return fetchJson<TrackerSummary>('/api/tracker-summary');
}

export async function fetchFollowUps(): Promise<ApiListResponse<Opportunity>> {
  return fetchJson<ApiListResponse<Opportunity>>('/api/opportunities?followup=today');
}

export async function fetchProactive(): Promise<ApiListResponse<Opportunity>> {
  return fetchJson<ApiListResponse<Opportunity>>('/api/opportunities?signal_type=proactive');
}

export async function fetchScraperStatus(): Promise<{
  last_run: string | null;
  hours_ago: number | null;
  next_run: string;
  logs: ScraperLog[];
}> {
  return fetchJson('/api/scraper-status');
}

export async function triggerScraper(): Promise<{ success: boolean; error?: string }> {
  return fetchJson('/api/trigger-scraper', { method: 'POST' });
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

    const locMatch = !filters.location || (opportunity.location && opportunity.location.toLowerCase().includes(filters.location.toLowerCase()));
    const roleMatch = !filters.role || (opportunity.role_title && opportunity.role_title.toLowerCase().includes(filters.role.toLowerCase()));
    const compMatch = !filters.company || (opportunity.company_name && opportunity.company_name.toLowerCase().includes(filters.company.toLowerCase()));

    return sourceMatch && statusMatch && scoreMatch && locMatch && roleMatch && compMatch && matchesDateFilter(opportunity.found_at, filters);
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
