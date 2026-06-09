'use client';

import { useState } from 'react';

import { Spinner } from '@/components/spinner';
import { GhostLink, ScoreBadge } from '@/components/ui';
import { sourceLabel } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import type { Opportunity } from '@/lib/types';

export function OpportunityCard({
  opportunity,
  onMarkApplied,
}: {
  opportunity: Opportunity;
  onMarkApplied?: (opportunity: Opportunity) => Promise<void>;
}) {
  const [applying, setApplying] = useState(false);
  const [markState, setMarkState] = useState<'idle' | 'loading' | 'done'>('idle');

  const score = opportunity.priority_score ?? 0;

  async function handleApply() {
    if (!opportunity.apply_url) return;
    setApplying(true);
    window.open(opportunity.apply_url, '_blank', 'noopener,noreferrer');
    await new Promise((r) => setTimeout(r, 1000));
    setApplying(false);
  }

  async function handleMarkApplied() {
    if (!onMarkApplied || markState === 'loading') return;
    setMarkState('loading');
    try {
      await onMarkApplied(opportunity);
      setMarkState('done');
      setTimeout(() => setMarkState('idle'), 2000);
    } catch {
      setMarkState('idle');
    }
  }

  return (
    <article style={{
      borderRadius: '1.5rem',
      border: '1px solid var(--border)',
      backgroundColor: 'var(--bg-card)',
      padding: '1rem',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {opportunity.company_name}
          </p>
          <h3 style={{ margin: '0.2rem 0 0', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
            {opportunity.role_title ?? 'Open opportunity'}
          </h3>
        </div>
        <ScoreBadge score={score} />
      </div>

      <div style={{ marginTop: '0.65rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        {[sourceLabel(opportunity.source), timeAgo(opportunity.found_at), opportunity.location ?? 'Unknown location'].map((label) => (
          <span
            key={label}
            style={{
              borderRadius: '9999px',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              padding: '0.15rem 0.55rem',
              fontSize: '0.7rem',
              fontWeight: 500,
            }}
          >
            {label}
          </span>
        ))}
      </div>

      <div style={{ marginTop: '0.85rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {opportunity.apply_url && (
          <button
            disabled={applying}
            onClick={() => void handleApply()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              borderRadius: '9999px',
              border: '1px solid var(--accent)',
              backgroundColor: 'var(--accent)',
              color: '#ffffff',
              padding: '0.4rem 0.85rem',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: applying ? 'not-allowed' : 'pointer',
              opacity: applying ? 0.7 : 1,
              transition: 'opacity 0.15s, background-color 0.15s',
            }}
          >
            {applying ? <Spinner /> : null}
            Apply
          </button>
        )}

        {onMarkApplied && (
          <button
            disabled={markState === 'loading'}
            onClick={() => void handleMarkApplied()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              borderRadius: '9999px',
              border: '1px solid var(--border)',
              backgroundColor: markState === 'done' ? 'var(--normal)' : 'var(--bg-secondary)',
              color: markState === 'done' ? '#ffffff' : 'var(--text-primary)',
              padding: '0.4rem 0.85rem',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: markState === 'loading' ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s, color 0.2s',
            }}
          >
            {markState === 'loading' ? <Spinner /> : markState === 'done' ? '✓' : null}
            {markState === 'done' ? 'Applied!' : 'Mark Applied'}
          </button>
        )}
      </div>
    </article>
  );
}
