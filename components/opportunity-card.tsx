import type { Opportunity } from '@/lib/types';
import { scoreLabel, sourceLabel } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { GhostLink, Pill, PrimaryButton } from '@/components/ui';

export function OpportunityCard({
  opportunity,
  onMarkApplied,
}: {
  opportunity: Opportunity;
  onMarkApplied?: (opportunity: Opportunity) => void;
}) {
  const score = opportunity.priority_score ?? 0;
  const badge = scoreLabel(score);

  return (
    <article className="rounded-3xl border border-line bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-600">{opportunity.company_name}</p>
          <h3 className="mt-1 font-display text-lg font-semibold text-ink">{opportunity.role_title ?? 'Open opportunity'}</h3>
        </div>
        <Pill tone={badge.tone}>{score}</Pill>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
        <Pill>{sourceLabel(opportunity.source)}</Pill>
        <Pill>{timeAgo(opportunity.found_at)}</Pill>
        <Pill>{opportunity.location ?? 'Unknown location'}</Pill>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {opportunity.apply_url ? <GhostLink href={opportunity.apply_url}>Apply</GhostLink> : null}
        {onMarkApplied ? (
          <PrimaryButton className="px-4 py-2" onClick={() => onMarkApplied(opportunity)}>
            Mark Applied
          </PrimaryButton>
        ) : null}
      </div>
    </article>
  );
}
