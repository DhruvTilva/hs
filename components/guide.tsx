'use client';

import { useState, useEffect } from 'react';
import { AppShell } from '@/components/app-shell';
import { Panel } from '@/components/ui';
import { CopyButton } from '@/components/copy-button';

const SECTIONS = [
  { id: 'quick-start', label: '⚡ Quick Start' },
  { id: 'home', label: '🏠 Home Page' },
  { id: 'companies', label: '🏢 Companies' },
  { id: 'network', label: '🔗 Network' },
  { id: 'interview', label: '🧠 Interview' },
  { id: 'routine', label: '📅 Daily Routine' },
  { id: 'automations', label: '⚙️ Automations' },
];

export function GuidePage() {
  const [activeSection, setActiveSection] = useState('quick-start');
  const [status, setStatus] = useState<any>(null);
  const [triggerState, setTriggerState] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/scraper-status')
      .then(r => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  async function triggerWorkflow(workflow: string) {
    setTriggerState(prev => ({ ...prev, [workflow]: 'loading' }));
    try {
      const res = await fetch('/api/trigger-scraper', { 
        method: 'POST', 
        body: JSON.stringify({ workflow }),
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        setTriggerState(prev => ({ ...prev, [workflow]: 'success' }));
      } else {
        setTriggerState(prev => ({ ...prev, [workflow]: 'error' }));
      }
    } catch {
      setTriggerState(prev => ({ ...prev, [workflow]: 'error' }));
    }
    setTimeout(() => setTriggerState(prev => ({ ...prev, [workflow]: 'idle' })), 3000);
  }

  const automations = [
    {
      id: 'company_discovery.yml',
      title: 'Company Discovery Scanner',
      frequency: 'Every Sunday 06:30 AM IST',
      description: 'Discovers new AI startups in Ahmedabad/GIFT City via LinkedIn and updates the intelligence database.',
      source_filter: 'company_discovery',
    },
    {
      id: 'network_growth.yml',
      title: 'Network Growth Scraper',
      frequency: 'Every Day at 09:00 AM IST',
      description: 'Discovers new AI/ML recruiters and technical leaders (CTOs, Founders, Managers) at watchlist companies via LinkedIn X-Ray search.',
      source_filter: 'network_growth',
    },
    {
      id: 'career_page_watcher.yml',
      title: 'Career Page Watcher',
      frequency: 'Every Day at 09:00 AM IST',
      description: 'Monitors the careers pages of companies in your Watchlist for changes.',
      source_filter: 'career_page',
    }
  ];

  return (
    <AppShell title="Success Guide" subtitle="A simple playbook to master AI/ML job hunting in Gujarat">
      <div className="guide-layout">
        
        {/* Sidebar / Tabs */}
        <nav className="guide-nav" aria-label="Guide Navigation">
          {SECTIONS.map(s => (
             <button 
               key={s.id} 
               onClick={() => setActiveSection(s.id)} 
               className={activeSection === s.id ? 'active' : ''}
             >
               {s.label}
             </button>
          ))}
        </nav>
        
        {/* Content Area */}
        <div className="guide-content">
          
          {activeSection === 'quick-start' && (
            <div className="tab-pane">
              <Panel>
                <h2>⚡ Quick Start Overview</h2>
                <p>Welcome to HireSense v2.0. We do not spray-and-pray applications on job boards. We build intelligence and network proactively. Here is how you win:</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
                  <div className="feature-row"><strong>🏠 Home Page:</strong> Your daily brief. See new companies discovered and daily network tasks.</div>
                  <div className="feature-row"><strong>🏢 Companies:</strong> Your database. Find companies, review their score, and jump straight to their LinkedIn pages.</div>
                  <div className="feature-row"><strong>🔗 Network:</strong> Manage connections. Discover employees at target companies and track outreach.</div>
                  <div className="feature-row"><strong>🧠 Interview:</strong> AI mock interviewer. Generates questions based on the job description.</div>
                </div>
              </Panel>
              <Panel style={{ marginTop: '1rem', borderTop: '3px solid var(--accent)' }}>
                <h3>🚀 Fast Track Setup</h3>
                <ol style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)' }}>
                  <li>Run the one-time LinkedIn URL backfill script.</li>
                  <li>Review Discovered companies and move them to your Watchlist.</li>
                  <li>Click <strong>💼 LinkedIn</strong> on target companies to find technical leaders.</li>
                  <li>Connect and send personalized messages.</li>
                </ol>
              </Panel>
            </div>
          )}

          {activeSection === 'home' && (
            <Panel className="tab-pane">
              <h2>🏠 Home Page</h2>
              <p>Your Daily Intel Brief. Only look here to know what requires immediate action today.</p>
              
              <div className="info-box urgent">
                <strong>📈 Pulse Stats:</strong> 
                <p>Metrics showing new companies discovered this week and your 24h networking efforts.</p>
              </div>
              
              <div className="info-box normal">
                <strong>⏰ Career Alerts:</strong> 
                <p>Shows exactly which companies on your Watchlist have updated their career pages.</p>
              </div>
            </Panel>
          )}

          {activeSection === 'companies' && (
            <Panel className="tab-pane">
              <h2>🏢 Company Intelligence</h2>
              <p>LinkedIn Company URLs are the master key to finding jobs. We don't rely on job boards; we go straight to the source.</p>
              
              <h3>My Watchlist vs Discovered</h3>
              <ul className="bullet-list">
                <li><strong>Discovered Intelligence:</strong> Automated weekly scans find AI/ML startups in Gujarat. Review them here.</li>
                <li><strong>My Watchlist:</strong> Move promising companies here. If they have a careers URL, the system watches it daily for you.</li>
              </ul>
              
              <h3>Pro Tip: The LinkedIn Button</h3>
              <p>Every company card has a prominent <strong>💼 LinkedIn</strong> button. Clicking this instantly shows you the company size, open roles, and all employees.</p>
            </Panel>
          )}

          {activeSection === 'network' && (
            <div className="tab-pane">
              <Panel>
                <h2>🔗 Network Intelligence</h2>
                <p>Networking compounds. An application is just a lottery ticket, but a direct referral from an AI Engineer is an interview guarantee.</p>
                <ul className="bullet-list">
                  <li>Go to a company's LinkedIn page.</li>
                  <li>Click "People" and search for "AI", "Machine Learning", "CTO", or "Founder".</li>
                  <li>Send a connection request with a targeted note.</li>
                  <li>Log the connection in your Network tab to remember to follow up.</li>
                </ul>
              </Panel>
              
              <Panel style={{ marginTop: '1rem' }}>
                <h3>Connection Note Template</h3>
                <div className="code-box">
                  <pre>
Hi [Name],

I'm an AI/ML Engineer in Ahmedabad following [Company]'s work in GenAI. 
Would love to connect and learn more about the team's engineering culture.

Best,
[Your Name]
                  </pre>
                  <CopyButton text={`Hi [Name],\n\nI'm an AI/ML Engineer in Ahmedabad following [Company]'s work in GenAI. \nWould love to connect and learn more about the team's engineering culture.\n\nBest,\n[Your Name]`} />
                </div>
              </Panel>
            </div>
          )}

          {activeSection === 'interview' && (
            <Panel className="tab-pane">
              <h2>🧠 Interview Intelligence</h2>
              <p>Never walk into an interview unprepared. Let AI act as your mock interviewer.</p>
              
              <ul className="bullet-list">
                <li>Paste the Job Description and Company Name.</li>
                <li>HireSense AI predicts exactly what they will ask you.</li>
                <li><strong>How to use:</strong> Run this 1-2 days before your interview and practice answering the generated questions out loud.</li>
              </ul>
            </Panel>
          )}

          {activeSection === 'routine' && (
            <div className="tab-pane">
              <Panel>
                <h2>📅 Daily Routine</h2>
                <p>Consistency beats volume. Follow this simple 15-minute daily habit:</p>
                
                <div className="routine-grid">
                  <div className="routine-card">
                    <h3>🌅 Morning (5 mins)</h3>
                    <ul>
                      <li>Check Home Page for Career Alerts</li>
                      <li>Send 2-3 new LinkedIn connections</li>
                    </ul>
                  </div>
                  
                  <div className="routine-card">
                    <h3>☀️ Midday (5 mins)</h3>
                    <ul>
                      <li>Review any responses to outreach</li>
                      <li>Send Follow-Ups to older connections</li>
                    </ul>
                  </div>
                  
                  <div className="routine-card highlight">
                    <h3>📅 Weekly (30 mins)</h3>
                    <ul>
                      <li>Review Discovered companies</li>
                      <li>Update Watchlist tracking</li>
                    </ul>
                  </div>
                </div>
              </Panel>
              
              {/* Motivation Card */}
              <Panel style={{ background: 'linear-gradient(135deg, var(--bg-card) 0%, color-mix(in srgb, var(--accent) 15%, var(--bg-card)) 100%)', border: '1px solid var(--accent)', marginTop: '1rem', textAlign: 'center' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 0.5rem 0' }}>Consistency is Key</h2>
                <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
                  A daily habit of 10 minutes reviewing intel and messaging contacts creates a massive compounding advantage over applying endlessly on job boards.
                </p>
              </Panel>
            </div>
          )}

          {activeSection === 'automations' && (
            <Panel className="tab-pane">
              <h2 style={{ margin: '0 0 1.5rem 0' }}>⚙️ Automations & Crons</h2>
              <p>HireSense is powered by GitHub Actions running in the background. Here are your active automations.</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
                {automations.map(auto => (
                  <div key={auto.id} style={{ background: 'var(--bg-secondary)', borderRadius: '0.5rem', border: '1px solid var(--border)', overflow: 'hidden' }}>
                    <div style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <h3 style={{ margin: '0 0 0.4rem 0', fontSize: '1.05rem' }}>{auto.title}</h3>
                        <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{auto.description}</p>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg-card)', padding: '0.3rem 0.7rem', borderRadius: '999px', fontSize: '0.8rem', border: '1px solid var(--border)' }}>
                          🕒 {auto.frequency}
                        </div>
                      </div>
                      <button 
                        onClick={() => triggerWorkflow(auto.id)}
                        disabled={triggerState[auto.id] === 'loading'}
                        style={{ 
                          background: triggerState[auto.id] === 'success' ? 'var(--urgent)' : triggerState[auto.id] === 'error' ? 'var(--urgent)' : 'var(--bg-card)', 
                          color: (triggerState[auto.id] === 'success' || triggerState[auto.id] === 'error') ? '#fff' : 'var(--text-primary)', 
                          border: triggerState[auto.id] ? '1px solid transparent' : '1px solid var(--border)', 
                          padding: '0.5rem 1.25rem', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
                          transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap'
                        }}
                      >
                        {triggerState[auto.id] === 'loading' ? '⏳ Triggering...' : triggerState[auto.id] === 'success' ? '✓ Triggered' : triggerState[auto.id] === 'error' ? '✖ Failed' : '▶ Manual Run'}
                      </button>
                    </div>
                    
                    {status?.logs && status.logs.length > 0 && (
                      <details style={{ borderTop: '1px solid var(--border)' }}>
                        <summary style={{ padding: '0.85rem 1.25rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500, background: 'color-mix(in srgb, var(--bg-card) 50%, transparent)', outline: 'none', userSelect: 'none' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Show Latest Run Logs</span>
                        </summary>
                        <div className="logs-list" style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'color-mix(in srgb, var(--bg-card) 30%, transparent)' }}>
                          {status?.logs?.filter((l: any) => !auto.source_filter || l.source?.includes(auto.source_filter)).slice(0, 5).map((log: any) => (
                            <div key={log.id} className={`log-item log-${log.status}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', background: 'var(--bg-card)', padding: '0.6rem 0.85rem', borderRadius: '0.35rem', border: '1px solid var(--border)' }}>
                              <span>
                                <strong style={{ color: 'var(--text-primary)' }}>{log.source}</strong> 
                                <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{new Date(log.run_at).toLocaleString()}</span>
                              </span>
                              <span style={{ color: log.status === 'success' ? '#10b981' : log.errors ? '#ef4444' : 'var(--text-secondary)', fontWeight: 500 }}>
                                {log.status === 'success' ? `✓ ${log.new_found} found` : 'Error'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          )}

        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{ __html: `
        .guide-layout { display: flex; flex-direction: column; gap: 1.5rem; align-items: flex-start; }
        
        .guide-nav {
          display: flex; gap: 0.5rem; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch;
          position: sticky; top: 68px; z-index: 10;
          background: var(--bg-secondary); padding: 0.75rem; border-radius: 1rem;
          width: calc(100% + 2rem); margin-left: -1rem; margin-right: -1rem;
          border: 1px solid var(--border);
        }
        .guide-nav::-webkit-scrollbar { display: none; }
        .guide-nav button {
          flex: 0 0 auto;
          background: var(--bg-card); border: 1px solid var(--border); color: var(--text-secondary);
          padding: 0.5rem 1rem; border-radius: 9999px; font-size: 0.85rem; font-weight: 500; cursor: pointer;
          transition: all 0.2s;
        }
        .guide-nav button:hover { border-color: var(--accent); color: var(--text-primary); }
        .guide-nav button.active { background: var(--accent); color: #fff; border-color: var(--accent); }
        
        .guide-content { width: 100%; min-height: 50vh; }
        .tab-pane { animation: fadeIn 0.25s ease-out; }
        
        @media (min-width: 768px) {
          .guide-layout { flex-direction: row; }
          .guide-nav { 
            flex-direction: column; width: 240px; top: 80px; 
            padding: 0; background: transparent; border: none; margin: 0;
          }
          .guide-nav button { text-align: left; }
          .guide-content { flex: 1; min-width: 0; }
        }
        
        /* Typography & Components */
        .guide-content h2 { font-size: 1.4rem; font-weight: 700; color: var(--text-primary); margin: 0 0 1rem 0; }
        .guide-content h3 { font-size: 1.1rem; font-weight: 600; color: var(--text-primary); margin: 1.5rem 0 0.75rem 0; }
        .guide-content p { font-size: 0.95rem; line-height: 1.6; color: var(--text-secondary); margin: 0 0 1rem 0; }
        
        .feature-row { background: var(--bg-secondary); padding: 0.75rem 1rem; border-radius: 0.5rem; font-size: 0.9rem; color: var(--text-secondary); }
        .feature-row strong { color: var(--text-primary); }
        
        .info-box { background: var(--bg-secondary); border-left: 3px solid var(--accent); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem; font-size: 0.9rem; }
        .info-box.urgent { border-left-color: var(--urgent); background: var(--badge-urgent-bg); color: var(--badge-urgent-text); }
        .info-box.normal { border-left-color: var(--watching); background: var(--badge-watching-bg); color: var(--badge-watching-text); }
        .info-box strong { display: block; margin-bottom: 0.25rem; font-size: 0.95rem; }
        .info-box p { margin: 0; color: inherit; }
        
        .bullet-list { margin: 0 0 1rem 1.5rem; padding: 0; font-size: 0.95rem; line-height: 1.6; color: var(--text-secondary); }
        .bullet-list li { margin-bottom: 0.5rem; }
        .bullet-list strong { color: var(--text-primary); }
        
        .code-box { background: var(--bg-secondary); padding: 1rem; border-radius: 0.5rem; position: relative; border: 1px solid var(--border); }
        .code-box pre { margin: 0; white-space: pre-wrap; font-family: inherit; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5; padding-bottom: 2.5rem; }
        .code-box button { position: absolute; bottom: 0.75rem; right: 0.75rem; }
        
        .badge { background: var(--bg-secondary); padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.8rem; border: 1px solid var(--border); }
        
        .routine-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem; }
        @media (max-width: 640px) { .routine-grid { grid-template-columns: 1fr; } }
        .routine-card { background: var(--bg-secondary); padding: 1rem; border-radius: 0.5rem; }
        .routine-card.highlight { border-left: 3px solid var(--accent); }
        .routine-card h3 { margin: 0 0 0.5rem 0; font-size: 0.95rem; color: var(--text-primary); }
        .routine-card ul { margin: 0 0 0 1.2rem; padding: 0; font-size: 0.85rem; color: var(--text-secondary); }
        .routine-card li { margin-bottom: 0.25rem; }
        
        details summary::-webkit-details-marker { display: none; }
        
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
      `}} />
    </AppShell>
  );
}
