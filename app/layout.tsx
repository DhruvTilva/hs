import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'HireSense',
  description: 'Personal AI/ML job opportunity radar for Ahmedabad, Gandhinagar, and GIFT City.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
