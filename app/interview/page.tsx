'use client';

import { useState, useEffect, useRef } from 'react';
import { InterviewIntelligenceResult, type IntelligenceResponse } from '@/components/interview-intelligence';

/* ── Loading steps ──────────────────────────────────────────── */
const LOADING_STEPS = [
  'Searching Glassdoor…',
  'Searching Reddit…',
  'Searching AmbitionBox…',
  'Analyzing with AI…',
];

function LoadingSteps({ active }: { active: boolean }) {
  const [step, setStep] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (active) {
      setStep(0);
      timer.current = setInterval(() => {
        setStep((s) => (s < LOADING_STEPS.length - 1 ? s + 1 : s));
      }, 1500);
    } else {
      if (timer.current) clearInterval(timer.current);
    }
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [active]);

  if (!active) return null;

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: '1rem', padding: '1.25rem 1.4rem',
    }}>
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
        🔍 Gathering interview intelligence…
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {LOADING_STEPS.map((s, i) => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', width: '1.1rem', textAlign: 'center' }}>
              {i < step ? '✓' : i === step ? '⟳' : '○'}
            </span>
            <span style={{
              fontSize: '0.82rem',
              color: i < step ? '#16a34a' : i === step ? 'var(--accent)' : 'var(--text-muted)',
              fontWeight: i === step ? 600 : 400,
            }}>
              {s}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────── */
export default function InterviewPage() {
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [jd, setJd] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IntelligenceResponse | null>(null);

  const inputStyle: React.CSSProperties = {
    width: '100%', borderRadius: '0.75rem', border: '1px solid var(--border)',
    background: 'var(--bg-card)', color: 'var(--text-primary)',
    padding: '0.6rem 0.85rem', fontSize: '0.88rem', outline: 'none',
    transition: 'border-color 0.15s', boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.78rem', fontWeight: 700,
    color: 'var(--text-secondary)', marginBottom: '0.35rem',
    textTransform: 'uppercase', letterSpacing: '0.08em',
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!company.trim() || !role.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/interview-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: company.trim(), role_title: role.trim(), job_description: jd.trim() }),
      });
      const data = (await res.json()) as IntelligenceResponse;
      setResult(data);
    } catch (err) {
      setResult({ success: false, error: String(err), company_name: company, role_title: role, intelligence: { raw_text: '' }, raw_sources: [], generated_at: new Date().toISOString() });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ backgroundColor: 'var(--bg-secondary)', minHeight: '100vh', color: 'var(--text-primary)' }}>

      {/* Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50, background: 'var(--bg-primary)',
        borderBottom: '1px solid var(--border)', padding: '10px 16px',
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ maxWidth: '48rem', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <a href="/" style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
            fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)',
            textDecoration: 'none', border: '1px solid var(--border)',
            borderRadius: '9999px', padding: '0.25rem 0.65rem',
          }}>
            ← Home
          </a>
          <h1 style={{ margin: 0, flex: 1, textAlign: 'center', fontSize: 'clamp(0.9rem, 3vw, 1.1rem)', fontWeight: 800, color: 'var(--text-primary)' }}>
            🎯 Interview Intelligence
          </h1>
          <span style={{ width: '4rem' }} />
        </div>
        <p style={{ margin: '0.2rem auto 0', maxWidth: '48rem', fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          Real interview experiences from Glassdoor, Reddit, AmbitionBox — powered by AI
        </p>
      </header>

      <main style={{ maxWidth: '48rem', margin: '0 auto', padding: '1.25rem 1rem 3rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* Input form */}
        <form
          onSubmit={(e) => void handleSubmit(e)}
          style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '1rem', padding: '1.1rem',
            display: 'flex', flexDirection: 'column', gap: '0.75rem',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle} htmlFor="ii-company">Company Name *</label>
              <input
                id="ii-company"
                required
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Pirimid Fintech"
                style={inputStyle}
                disabled={loading}
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="ii-role">Role Title *</label>
              <input
                id="ii-role"
                required
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. ML Engineer"
                style={inputStyle}
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle} htmlFor="ii-jd">Job Description (optional)</label>
            <textarea
              id="ii-jd"
              rows={5}
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste the full JD here for better analysis…"
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !company.trim() || !role.trim()}
            style={{
              background: loading ? 'var(--text-muted)' : 'var(--accent)',
              color: '#fff', border: 'none', borderRadius: '9999px',
              padding: '0.6rem 1.4rem', fontSize: '0.88rem', fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer', alignSelf: 'flex-start',
              transition: 'background 0.15s',
            }}
          >
            {loading ? 'Searching Glassdoor, Reddit, AmbitionBox…' : '🔍 Analyze Interview'}
          </button>
        </form>

        {/* Loading steps */}
        <LoadingSteps active={loading} />

        {/* Results */}
        {result && !loading && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Results for <strong style={{ color: 'var(--text-primary)' }}>{result.company_name}</strong> · {result.role_title}
              </p>
              <button
                onClick={() => void handleSubmit({ preventDefault: () => {} } as React.FormEvent)}
                style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: '9999px',
                  padding: '0.2rem 0.65rem', fontSize: '0.72rem', cursor: 'pointer',
                  color: 'var(--text-secondary)',
                }}
              >
                🔄 Refresh
              </button>
            </div>
            <InterviewIntelligenceResult data={result} />
          </div>
        )}
      </main>
    </div>
  );
}
