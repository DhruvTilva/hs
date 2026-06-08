import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f172a',
        paper: '#f8fafc',
        panel: '#ffffff',
        line: '#dbe4f0',
        accent: '#0f766e',
        alert: '#b91c1c',
        watch: '#b45309',
      },
      boxShadow: {
        soft: '0 16px 48px rgba(15, 23, 42, 0.08)',
        card: '0 12px 40px rgba(15, 23, 42, 0.08)',
      },
    },
    fontFamily: {
      sans: ['var(--font-body)', 'sans-serif'],
      display: ['var(--font-display)', 'sans-serif'],
    },
  },
  plugins: [],
};

export default config;
