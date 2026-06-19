import Link from 'next/link';

import { AppShell } from '@/components/app-shell';
import { createServerSupabase } from '@/lib/supabase';
import { Metric, Panel, SectionTitle, GhostLink } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Home() {
  const supabase = createServerSupabase();

  let stats = {
    newCompaniesThisWeek: 0,
    totalCompanies: 0,
    newContactsToday: 0,
    careerPageChanges: 0,
    watchedCompanies: 0,
  };

  let recentCareerChanges: { company_name: string; role_title: string; apply_url: string; found_at: string }[] = [];

  if (supabase) {
    // 1. Total companies
    const { count: totalCompanies } = await supabase
      .from('companies')
      .select('*', { count: 'exact', head: true });
    stats.totalCompanies = totalCompanies || 0;

    // 2. New companies this week (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: newCompanies } = await supabase
      .from('companies')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo);
    stats.newCompaniesThisWeek = newCompanies || 0;

    // 3. New contacts today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    // Note: recruiters table might not have created_at currently. Let's fallback to opportunities for now if needed, 
    // or just assume we have discovered_at / created_at. We will query 'recruiters' but handle errors if column doesn't exist.
    const { count: newContacts, error: errContacts } = await supabase
      .from('recruiters')
      .select('*', { count: 'exact', head: true });
      // .gte('created_at', startOfToday.toISOString()); // Will add back after schema update
    stats.newContactsToday = newContacts || 0; // Temporary placeholder for 'all time' until schema is updated

    // 4. Career page changes (opportunities from career_page in last 7 days)
    const { data: careerChanges } = await supabase
      .from('opportunities')
      .select('company_name, role_title, apply_url, found_at')
      .eq('source', 'career_page')
      .gte('found_at', sevenDaysAgo)
      .order('found_at', { ascending: false })
      .limit(5);
    
    recentCareerChanges = careerChanges || [];
    stats.careerPageChanges = recentCareerChanges.length;

    // 5. Watched Companies
    const { count: watchedCount } = await supabase
      .from('companies')
      .select('*', { count: 'exact', head: true })
      .eq('career_page_watched', true);
    stats.watchedCompanies = watchedCount || 0;
  }

  return (
    <AppShell 
      title="Today's Intel Brief" 
      subtitle="AI/ML Company Intelligence Radar for Gujarat"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        
        {/* Pulse Stats */}
        <Panel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }} className="sm-grid-4">
            <Metric
              label="New Companies (7d)"
              value={stats.newCompaniesThisWeek}
              accentClass="metric-urgent"
              labelColor="var(--urgent)"
              valueColor={stats.newCompaniesThisWeek > 0 ? 'var(--urgent)' : undefined}
            />
            <Metric
              label="Total Tracked"
              value={stats.totalCompanies}
              accentClass="metric-total"
              labelColor="var(--accent)"
            />
            <Metric
              label="New Contacts (24h)"
              value={stats.newContactsToday}
              accentClass="metric-watching"
              labelColor="var(--watching)"
              valueColor={stats.newContactsToday > 0 ? 'var(--watching)' : undefined}
            />
            <Metric
              label="Watched Companies"
              value={stats.watchedCompanies}
              accentClass="metric-applied"
              labelColor="var(--normal)"
              valueColor={stats.watchedCompanies > 0 ? 'var(--normal)' : undefined}
            />
          </div>
        </Panel>

        {/* Quick Actions */}
        <Panel>
          <SectionTitle eyebrow="Actions" title="Daily Routine" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Link href="/companies" style={{ textDecoration: 'none' }}>
              <div style={{ padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', textAlign: 'center', fontWeight: 600, transition: 'background 0.2s' }}>
                🏢 Review Companies
              </div>
            </Link>
            <Link href="/network" style={{ textDecoration: 'none' }}>
              <div style={{ padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', textAlign: 'center', fontWeight: 600, transition: 'background 0.2s' }}>
                🔗 Connect Today
              </div>
            </Link>
            <Link href="/interview" style={{ textDecoration: 'none' }}>
              <div style={{ padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', textAlign: 'center', fontWeight: 600, transition: 'background 0.2s' }}>
                🧠 Interview Prep
              </div>
            </Link>
            <Link href="/guide" style={{ textDecoration: 'none' }}>
              <div style={{ padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', textAlign: 'center', fontWeight: 600, transition: 'background 0.2s' }}>
                📖 Success Guide
              </div>
            </Link>
          </div>
        </Panel>

        {/* Career Alerts */}
        <Panel>
          <SectionTitle eyebrow="Signals" title="Recent Career Page Changes" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
            {recentCareerChanges.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>No recent career page changes detected.</p>
            ) : (
              recentCareerChanges.map((change, idx) => (
                <div key={idx} style={{ padding: '1rem', borderRadius: '0.75rem', border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem', color: 'var(--text-primary)' }}>{change.company_name}</h3>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Detected: {change.role_title}</p>
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {new Date(change.found_at).toLocaleDateString()}
                      </p>
                    </div>
                    {change.apply_url && (
                      <GhostLink href={change.apply_url}>Visit Careers</GhostLink>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>

      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        @media (min-width: 640px) { .sm-grid-4 { grid-template-columns: repeat(4,1fr) !important; } }
      `}} />
    </AppShell>
  );
}
