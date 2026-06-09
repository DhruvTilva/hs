export type OpportunitySource =
  | 'career_page'
  | 'linkedin_email'
  | 'naukri'
  | 'wellfound'
  | 'google_alert'
  | 'indeed'
  | 'google_search';

export type OpportunityStatus = 'new' | 'applied' | 'followed_up' | 'interview' | 'rejected' | 'offer';

export type SignalType = 'early' | 'normal' | 'proactive';

export interface Opportunity {
  id: string;
  company_name: string;
  role_title: string | null;
  location: string | null;
  source: OpportunitySource;
  signal_type: SignalType | null;
  apply_url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_linkedin: string | null;
  priority_score: number | null;
  freshness_score: number | null;
  raw_data: Record<string, unknown> | null;
  status: OpportunityStatus;
  found_at: string;
  applied_at: string | null;
  follow_up_date: string | null;
  notes: string | null;
  is_duplicate: boolean;
  duplicate_of: string | null;
}

export interface Company {
  id: string;
  name: string;
  tier: number | null;
  category: string | null;
  location: string | null;
  website: string | null;
  careers_url: string | null;
  linkedin_url: string | null;
  company_size: string | null;
  ai_focus: string | null;
  funding_stage: string | null;
  priority_base_score: number | null;
  google_alert_set: boolean;
  li_alert_set: boolean;
  career_page_watched: boolean;
  last_careers_hash: string | null;
  last_checked: string | null;
  notes: string | null;
  created_at: string;
}

export interface Recruiter {
  id: string;
  name: string | null;
  company: string | null;
  title: string | null;
  linkedin_url: string | null;
  email: string | null;
  last_active: string | null;
  hiring_focus: string | null;
  contacted: boolean;
  contact_date: string | null;
  notes: string | null;
}

export interface ScraperLog {
  id: string;
  source: string | null;
  run_at: string;
  new_found: number;
  errors: string | null;
  status: string | null;
}

export interface WeeklyStats {
  found_this_week: number;
  applied: number;
  interviews: number;
  followups_due: number;
}

export interface TrackerSummary {
  new: number;
  applied: number;
  followed_up: number;
  interview: number;
  offer: number;
  rejected: number;
}

export interface ApiListResponse<T> {
  data: T[];
  fallback: boolean;
}

export type OpportunityRecord = {
  id: string;
  company_name: string;
  role_title: string | null;
  location: string | null;
  source: string | null;
  signal_type: string | null;
  apply_url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_linkedin: string | null;
  priority_score: number | null;
  freshness_score: number | null;
  raw_data: Record<string, unknown> | null;
  status: string | null;
  found_at: string | null;
  applied_at: string | null;
  follow_up_date: string | null;
  notes: string | null;
  is_duplicate: boolean | null;
  duplicate_of: string | null;
};

export type CompanyRecord = {
  id: string;
  name: string;
  tier: number | null;
  category: string | null;
  location: string | null;
  website: string | null;
  careers_url: string | null;
  linkedin_url: string | null;
  company_size: string | null;
  ai_focus: string | null;
  funding_stage: string | null;
  priority_base_score: number | null;
  google_alert_set: boolean | null;
  li_alert_set: boolean | null;
  career_page_watched: boolean | null;
  last_careers_hash: string | null;
  last_checked: string | null;
  notes: string | null;
  created_at: string | null;
};
