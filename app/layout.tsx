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
          <a href="/companies" className="mobile-nav-item"><span className="mobile-nav-icon">🏢</span>Companies</a>
          <a href="/network" className="mobile-nav-item"><span className="mobile-nav-icon">🔗</span>Network</a>
          <a href="/interview" className="mobile-nav-item"><span className="mobile-nav-icon">🧠</span>Interview</a>
          <a href="/guide" className="mobile-nav-item"><span className="mobile-nav-icon">📖</span>Guide</a>
        </nav>
      </body>
    </html>
  );
}
