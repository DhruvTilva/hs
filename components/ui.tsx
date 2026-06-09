import Link from 'next/link';
import type {
  ButtonHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

/* ── Panel ─────────────────────────────────────────────────── */
export function Panel({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <section
      className={className}
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '1.5rem',
        padding: '1rem',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        ...style,
      }}
    >
      {children}
    </section>
  );
}

/* ── SectionTitle ──────────────────────────────────────────── */
export function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '0.75rem' }}>
      <div>
        {eyebrow && (
          <p style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.24em', color: 'var(--text-muted)', margin: 0 }}>
            {eyebrow}
          </p>
        )}
        <h2 style={{ margin: '0.1rem 0 0', fontSize: 'clamp(1rem, 3vw, 1.2rem)', fontWeight: 700, color: 'var(--text-primary)' }}>
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

/* ── Button (secondary) ────────────────────────────────────── */
export function Button({ className = '', style, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={className}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
        borderRadius: '9999px',
        border: '1px solid var(--border)',
        backgroundColor: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        padding: '0.4rem 0.85rem',
        fontSize: '0.8rem',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'border-color 0.15s, color 0.15s',
        ...style,
      }}
      onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)'; }}
      onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'; }}
    />
  );
}

/* ── PrimaryButton (accent) ────────────────────────────────── */
export function PrimaryButton({ className = '', style, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={className}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
        borderRadius: '9999px',
        border: 'none',
        backgroundColor: 'var(--accent)',
        color: '#ffffff',
        padding: '0.4rem 0.85rem',
        fontSize: '0.8rem',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'background-color 0.15s',
        ...style,
      }}
      onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--accent-hover)'; }}
      onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--accent)'; }}
    />
  );
}

/* ── SuccessButton (green / Mark Reached Out) ──────────────── */
export function SuccessButton({ className = '', style, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={className}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
        borderRadius: '9999px',
        border: 'none',
        backgroundColor: 'var(--normal)',
        color: '#ffffff',
        padding: '0.4rem 0.85rem',
        fontSize: '0.8rem',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'opacity 0.15s',
        ...style,
      }}
      onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'; }}
      onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
    />
  );
}

/* ── GhostLink ─────────────────────────────────────────────── */
export function GhostLink({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={className}
      target={href.startsWith('http') ? '_blank' : undefined}
      rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
        borderRadius: '9999px',
        border: '1px solid var(--border)',
        backgroundColor: 'var(--bg-card)',
        color: 'var(--text-primary)',
        padding: '0.4rem 0.85rem',
        fontSize: '0.8rem',
        fontWeight: 500,
        transition: 'border-color 0.15s, color 0.15s',
      }}
    >
      {children}
    </Link>
  );
}

/* ── Select ────────────────────────────────────────────────── */
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { style, ...rest } = props;
  return (
    <select
      {...rest}
      className="hs-input"
      style={{ ...style }}
    />
  );
}

/* ── Textarea ──────────────────────────────────────────────── */
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { style, ...rest } = props;
  return <textarea {...rest} className="hs-input" style={{ resize: 'vertical', ...style }} />;
}

/* ── Pill ──────────────────────────────────────────────────── */
export function Pill({ children, tone }: { children: ReactNode; tone?: string }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center',
        borderRadius: '9999px',
        padding: '0.125rem 0.6rem',
        fontSize: '0.7rem',
        fontWeight: 600,
        backgroundColor: tone ? undefined : 'var(--bg-secondary)',
        color: tone ? undefined : 'var(--text-secondary)',
      }}
      className={tone ?? ''}
    >
      {children}
    </span>
  );
}

/* ── ScoreBadge (replaces Pill for scores) ─────────────────── */
export function ScoreBadge({ score }: { score: number }) {
  let cls = 'badge-normal';
  if (score >= 70) cls = 'badge-urgent';
  else if (score >= 40) cls = 'badge-watching';

  return (
    <span
      className={cls}
      style={{
        display: 'inline-flex', alignItems: 'center',
        borderRadius: '9999px',
        padding: '0.125rem 0.55rem',
        fontSize: '0.7rem',
        fontWeight: 700,
        minWidth: '2rem',
        justifyContent: 'center',
      }}
    >
      {score}
    </span>
  );
}

/* ── Metric (stat card) ────────────────────────────────────── */
export function Metric({
  label,
  value,
  accentClass = '',
  labelColor,
  valueColor,
}: {
  label: string;
  value: string | number;
  accentClass?: string;
  labelColor?: string;
  valueColor?: string;
}) {
  return (
    <div
      className={accentClass}
      style={{
        borderRadius: '1rem',
        border: '1px solid var(--border)',
        backgroundColor: 'var(--bg-card)',
        padding: '0.75rem 1rem',
      }}
    >
      <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.22em', color: labelColor ?? 'var(--text-muted)', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ marginTop: '0.25rem', fontSize: '1.875rem', fontWeight: 700, color: valueColor ?? 'var(--text-primary)', lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

/* ── EmptyState ────────────────────────────────────────────── */
export function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2.5rem 1rem', gap: '0.6rem' }}>
      <span style={{ fontSize: '2rem', lineHeight: 1 }}>{icon}</span>
      <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'center' }}>{message}</p>
    </div>
  );
}

/* ── SkeletonRow ───────────────────────────────────────────── */
export function SkeletonRows({ cols = 5, rows = 4 }: { cols?: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, ri) => (
        <tr key={ri}>
          {Array.from({ length: cols }).map((_, ci) => (
            <td key={ci} style={{ padding: '0.75rem' }}>
              <div
                style={{
                  height: '0.85rem',
                  borderRadius: '0.5rem',
                  backgroundColor: 'var(--bg-secondary)',
                  width: `${55 + ((ri * 3 + ci * 7) % 40)}%`,
                  animation: 'pulse 1.4s ease-in-out infinite',
                }}
              />
            </td>
          ))}
        </tr>
      ))}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}`}</style>
    </>
  );
}

/* ── SkeletonCard ──────────────────────────────────────────── */
export function SkeletonCard() {
  return (
    <div
      style={{
        borderRadius: '1.5rem',
        border: '1px solid var(--border)',
        backgroundColor: 'var(--bg-card)',
        padding: '1rem',
      }}
    >
      {[80, 55, 40].map((w, i) => (
        <div
          key={i}
          style={{
            height: i === 0 ? '1rem' : '0.75rem',
            borderRadius: '0.5rem',
            backgroundColor: 'var(--bg-secondary)',
            width: `${w}%`,
            marginBottom: '0.6rem',
            animation: 'pulse 1.4s ease-in-out infinite',
          }}
        />
      ))}
    </div>
  );
}
