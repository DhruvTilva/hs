'use client';

import { useState } from 'react';

/* ── Types ─────────────────────────────────────────────────── */
export interface InterviewRound {
  round_number: number;
  round_name: string;
  description: string;
  duration: string;
}

export interface RepeatedQuestion {
  question: string;
  category: string;
  frequency: string;
  tip: string;
}

export interface TopicToPrepare {
  topic: string;
  priority: string;
  reason: string;
}

export interface InterviewIntelligence {
  company_summary: string;
  gold_mine_secrets?: string[];
  interview_rounds: InterviewRound[];
  repeated_questions: RepeatedQuestion[];
  topics_to_prepare: TopicToPrepare[];
  interview_tips: string[];
  difficulty_level: string;
  typical_duration: string;
  offer_rate_signal: string;
  salary_signals: string;
  red_flags: string[];
  smart_questions_to_ask: string[];
  data_sources_found: string[];
  confidence_level: string;
}

export interface IntelligenceResponse {
  success: boolean;
  company_name: string;
  role_title: string;
  intelligence: InterviewIntelligence | { raw_text: string };
  parse_error?: boolean;
  no_data_found?: boolean;
  raw_sources: string[];
  generated_at: string;
  error?: string;
}

/* ── Helpers ────────────────────────────────────────────────── */
function difficultyColor(level: string) {
  if (level === 'Hard') return '#dc2626';
  if (level === 'Easy') return '#16a34a';
  return '#d97706';
}

function priorityIcon(p: string) {
  if (p === 'High') return '🔴';
  if (p === 'Low') return '🟢';
  return '🟡';
}

function freqColor(f: string) {
  if (f === 'Very Common') return { bg: '#fef2f2', color: '#dc2626' };
  if (f === 'Common') return { bg: '#fffbeb', color: '#d97706' };
  return { bg: '#f0fdf4', color: '#16a34a' };
}

function catColor(c: string) {
  const map: Record<string, { bg: string; color: string }> = {
    'ML Theory':      { bg: '#ede9fe', color: '#5b21b6' },
    'DSA':            { bg: '#dbeafe', color: '#1d4ed8' },
    'System Design':  { bg: '#fce7f3', color: '#be185d' },
    'Behavioral':     { bg: '#d1fae5', color: '#065f46' },
    'HR':             { bg: '#e0f2fe', color: '#0369a1' },
  };
  return map[c] ?? { bg: '#f3f4f6', color: '#374151' };
}

/* ── Sub-components ─────────────────────────────────────────── */
function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: '9999px',
      fontSize: '0.7rem', fontWeight: 700, background: bg, color,
    }}>
      {label}
    </span>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem',
      padding: '1rem 1.1rem', ...style,
    }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
      {children}
    </h3>
  );
}

/* ── Card 1: Company Overview ───────────────────────────────── */
function OverviewCard({ intel }: { intel: InterviewIntelligence }) {
  return (
    <Card>
      <SectionTitle>🏢 Company Overview</SectionTitle>
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {intel.company_summary}
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <Badge label={`⚡ ${intel.difficulty_level}`} bg={difficultyColor(intel.difficulty_level) + '22'} color={difficultyColor(intel.difficulty_level)} />
        <Badge label={`⏱ ${intel.typical_duration}`} bg="var(--bg-secondary)" color="var(--text-secondary)" />
        <Badge label={`🎯 ${intel.offer_rate_signal}`} bg="var(--bg-secondary)" color="var(--text-secondary)" />
        {intel.confidence_level === 'Low' && (
          <Badge label="⚠️ Low Confidence" bg="#fffbeb" color="#d97706" />
        )}
      </div>
    </Card>
  );
}

/* ── Card 1.5: Gold Mine Secrets ──────────────────────────────── */
function GoldMineCard({ secrets }: { secrets: string[] }) {
  if (!secrets || secrets.length === 0) return null;
  return (
    <Card style={{ background: 'linear-gradient(145deg, #fffbeb, #fef3c7)', borderColor: '#fde68a' }}>
      <SectionTitle>🔥 Insider Gold Mine Secrets</SectionTitle>
      <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {secrets.map((secret, i) => (
          <li key={i} style={{ fontSize: '0.85rem', color: '#92400e', lineHeight: 1.5, fontWeight: 500 }}>
            {secret}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ── Card 2: Interview Rounds ───────────────────────────────── */
function RoundsCard({ rounds }: { rounds: InterviewRound[] }) {
  return (
    <Card>
      <SectionTitle>🔄 Interview Rounds</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {rounds.map((r) => (
          <div key={r.round_number} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
            <div style={{
              width: '2rem', height: '2rem', borderRadius: '9999px', background: 'var(--accent)',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
            }}>
              {r.round_number}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{r.round_name}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>· {r.duration}</span>
              </div>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {r.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ── Card 3: Questions ──────────────────────────────────────── */
const CATEGORIES = ['All', 'ML Theory', 'DSA', 'System Design', 'Behavioral', 'HR'];

function QuestionsCard({ questions }: { questions: RepeatedQuestion[] }) {
  const [activeTab, setActiveTab] = useState('All');
  const [copied, setCopied] = useState(false);

  const filtered = activeTab === 'All' ? questions : questions.filter((q) => q.category === activeTab);

  async function copyAll() {
    const text = filtered.map((q, i) => `${i + 1}. ${q.question}`).join('\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <SectionTitle>❓ Most Asked Questions</SectionTitle>
        <button
          onClick={() => void copyAll()}
          style={{
            background: copied ? '#16a34a' : 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: '9999px', padding: '0.25rem 0.7rem', fontSize: '0.72rem',
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          {copied ? '✓ Copied!' : '📋 Copy All'}
        </button>
      </div>

      {/* Category tabs */}
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            style={{
              padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.72rem',
              fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)',
              background: activeTab === cat ? 'var(--accent)' : 'var(--bg-secondary)',
              color: activeTab === cat ? '#fff' : 'var(--text-secondary)',
              transition: 'all 0.15s',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Question cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {filtered.length === 0 && (
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>No questions in this category.</p>
        )}
        {filtered.map((q, i) => {
          const fc = freqColor(q.frequency);
          const cc = catColor(q.category);
          return (
            <div key={i} style={{
              border: '1px solid var(--border)', borderRadius: '0.75rem',
              padding: '0.7rem 0.85rem', background: 'var(--bg-secondary)',
            }}>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                <Badge label={q.category} bg={cc.bg} color={cc.color} />
                <Badge label={q.frequency} bg={fc.bg} color={fc.color} />
              </div>
              <p style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {q.question}
              </p>
              <p style={{ margin: 0, fontSize: '0.77rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                💡 {q.tip}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ── Card 4: Topics ─────────────────────────────────────────── */
function TopicsCard({ topics }: { topics: TopicToPrepare[] }) {
  const high = topics.filter((t) => t.priority === 'High');
  const med  = topics.filter((t) => t.priority === 'Medium');
  const low  = topics.filter((t) => t.priority === 'Low');

  function Group({ label, items, icon }: { label: string; items: TopicToPrepare[]; icon: string }) {
    if (items.length === 0) return null;
    return (
      <div style={{ marginBottom: '0.6rem' }}>
        <p style={{ margin: '0 0 0.3rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {icon} {label}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
          {items.map((t) => (
            <span key={t.topic} title={t.reason} style={{
              padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.78rem',
              background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)',
              cursor: 'default',
            }}>
              {t.topic}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <SectionTitle>📚 Topics to Prepare</SectionTitle>
      <Group label="High Priority" items={high} icon="🔴" />
      <Group label="Medium Priority" items={med} icon="🟡" />
      <Group label="Low Priority" items={low} icon="🟢" />
    </Card>
  );
}

/* ── Card 5: Tips ───────────────────────────────────────────── */
function TipsCard({ tips }: { tips: string[] }) {
  return (
    <Card>
      <SectionTitle>💬 Tips from Candidates</SectionTitle>
      <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {tips.map((tip, i) => (
          <li key={i} style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{tip}</li>
        ))}
      </ul>
    </Card>
  );
}

/* ── Card 6: Smart Questions ────────────────────────────────── */
function SmartQCard({ questions }: { questions: string[] }) {
  const [copied, setCopied] = useState<number | null>(null);

  async function copy(i: number, q: string) {
    await navigator.clipboard.writeText(q);
    setCopied(i);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <Card>
      <SectionTitle>🎤 Smart Questions to Ask Them</SectionTitle>
      <ol style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {questions.map((q, i) => (
          <li key={i} style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
              <span style={{ flex: 1 }}>{q}</span>
              <button
                onClick={() => void copy(i, q)}
                style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: '9999px',
                  padding: '0.1rem 0.45rem', fontSize: '0.68rem', cursor: 'pointer',
                  color: copied === i ? '#16a34a' : 'var(--text-muted)', flexShrink: 0,
                }}
              >
                {copied === i ? '✓' : 'Copy'}
              </button>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/* ── Card 7: Salary & Red Flags ─────────────────────────────── */
function SalaryRedFlagsCard({ salary, redFlags }: { salary: string; redFlags: string[] }) {
  return (
    <Card>
      <SectionTitle>💰 Salary & Red Flags</SectionTitle>
      {salary && (
        <p style={{ margin: '0 0 0.6rem', fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          💵 {salary}
        </p>
      )}
      {redFlags.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.75rem', padding: '0.6rem 0.8rem' }}>
          <p style={{ margin: '0 0 0.35rem', fontSize: '0.75rem', fontWeight: 700, color: '#dc2626', textTransform: 'uppercase' }}>⚠️ Red Flags</p>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {redFlags.map((f, i) => (
              <li key={i} style={{ fontSize: '0.8rem', color: '#7f1d1d' }}>{f}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/* ── Main export ────────────────────────────────────────────── */
export function InterviewIntelligenceResult({ data }: { data: IntelligenceResponse }) {
  if (!data.success || data.error) {
    const company = data.company_name ?? '';
    return (
      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '1rem', padding: '1rem 1.1rem' }}>
        <p style={{ margin: '0 0 0.5rem', fontWeight: 700, color: '#dc2626' }}>Analysis failed</p>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.83rem', color: '#7f1d1d' }}>{data.error}</p>
        <p style={{ margin: '0 0 0.35rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Try searching manually:</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {[
            { label: 'Glassdoor', url: `https://www.glassdoor.co.in/Interview/${company.replace(/\s+/g, '-')}-Interview-Questions` },
            { label: 'Reddit', url: `https://www.reddit.com/search/?q=${encodeURIComponent(company)}+interview` },
            { label: 'AmbitionBox', url: `https://www.ambitionbox.com/interviews/${company.toLowerCase().replace(/\s+/g, '-')}-interview-questions` },
          ].map((l) => (
            <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.82rem', color: 'var(--accent)' }}>
              → {l.label}
            </a>
          ))}
        </div>
      </div>
    );
  }

  if (data.parse_error) {
    const raw = (data.intelligence as { raw_text: string }).raw_text;
    return (
      <Card>
        <SectionTitle>🤖 AI Analysis (raw)</SectionTitle>
        <pre style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
          {raw}
        </pre>
      </Card>
    );
  }

  const intel = data.intelligence as InterviewIntelligence;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {/* Low confidence warning */}
      {(intel.confidence_level === 'Low' || data.no_data_found) && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '0.75rem', padding: '0.65rem 0.9rem' }}>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#92400e' }}>
            ⚠️ <strong>Limited interview data found for this company.</strong> Results are based on general patterns for this role type.
          </p>
        </div>
      )}

      <OverviewCard intel={intel} />
      {intel.gold_mine_secrets && intel.gold_mine_secrets.length > 0 && <GoldMineCard secrets={intel.gold_mine_secrets} />}
      {intel.interview_rounds?.length > 0 && <RoundsCard rounds={intel.interview_rounds} />}
      {intel.repeated_questions?.length > 0 && <QuestionsCard questions={intel.repeated_questions} />}
      {intel.topics_to_prepare?.length > 0 && <TopicsCard topics={intel.topics_to_prepare} />}
      {intel.interview_tips?.length > 0 && <TipsCard tips={intel.interview_tips} />}
      {intel.smart_questions_to_ask?.length > 0 && <SmartQCard questions={intel.smart_questions_to_ask} />}
      {(intel.salary_signals || intel.red_flags?.length > 0) && (
        <SalaryRedFlagsCard salary={intel.salary_signals} redFlags={intel.red_flags ?? []} />
      )}

      {/* Footer */}
      <div style={{ padding: '0.5rem 0', borderTop: '1px solid var(--border)' }}>
        <p style={{ margin: '0 0 0.2rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Sources: {intel.data_sources_found?.join(', ') || 'general patterns'} · Confidence: {intel.confidence_level}
        </p>
        <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Generated: {new Date(data.generated_at).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
