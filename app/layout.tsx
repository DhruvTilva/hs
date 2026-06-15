import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'HireSense',
  description: 'Personal AI/ML job opportunity radar for Ahmedabad, Gandhinagar, and GIFT City.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('hiresense-theme');if(t!=='light')document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        {children}
        <nav className="mobile-nav" aria-label="Mobile navigation">
          <a href="/" className="mobile-nav-item"><span className="mobile-nav-icon">🏠</span>Home</a>
          <a href="/opportunities" className="mobile-nav-item"><span className="mobile-nav-icon">💼</span>Jobs</a>
          <a href="/companies" className="mobile-nav-item"><span className="mobile-nav-icon">🏢</span>Companies</a>
          <a href="/tracker" className="mobile-nav-item"><span className="mobile-nav-icon">📋</span>Tracker</a>
          <a href="/proactive" className="mobile-nav-item"><span className="mobile-nav-icon">🎯</span>Proactive</a>
          <a href="/interview" className="mobile-nav-item"><span className="mobile-nav-icon">🎯</span>Interview</a>
          <a href="/discover" className="mobile-nav-item"><span className="mobile-nav-icon">🔭</span>Discover</a>
        </nav>
      </body>
    </html>
  );
}
