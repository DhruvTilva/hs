import Link from 'next/link';
import type { ReactNode } from 'react';

const links = [
  { href: '/', label: 'Today' },
  { href: '/opportunities', label: 'Opportunities' },
  { href: '/companies', label: 'Companies' },
  { href: '/proactive', label: 'Proactive' },
  { href: '/tracker', label: 'Tracker' },
];

export function AppShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(15,118,110,0.12),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#eef5f8_100%)] text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-10 pt-4 sm:px-6 lg:px-8">
        <header className="sticky top-0 z-10 mb-4 border-b border-line/70 bg-white/80 px-3 py-3 backdrop-blur sm:px-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-display text-sm uppercase tracking-[0.24em] text-slate-500">Personal AI/ML Radar</p>
                <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
                {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
              </div>
              <div className="hidden rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm sm:block">
                Mobile first
              </div>
            </div>
            <nav className="flex gap-2 overflow-x-auto pb-1 text-sm">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="whitespace-nowrap rounded-full border border-line bg-white px-3 py-1.5 text-slate-700 transition hover:border-accent hover:text-accent"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
