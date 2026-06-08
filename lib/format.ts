export function timeAgo(value: string | null): string {
  if (!value) {
    return 'just now';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'just now';
  }

  const elapsedMinutes = Math.max(Math.floor((Date.now() - date.getTime()) / 60000), 0);
  if (elapsedMinutes < 1) return 'just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays}d ago`;
}

export function bucketScore(score: number | null): 'urgent' | 'watching' | 'normal' {
  if ((score ?? 0) >= 70) return 'urgent';
  if ((score ?? 0) >= 40) return 'watching';
  return 'normal';
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
