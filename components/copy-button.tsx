'use client';

import { useState } from 'react';

export function CopyButton({ text }: { text: string }) {
  const [label, setLabel] = useState('Copy Message');

  return (
    <button
      type="button"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '9999px',
        border: '1px solid var(--border)',
        backgroundColor: 'var(--bg-card)',
        color: 'var(--text-secondary)',
        padding: '0.4rem 0.85rem',
        fontSize: '0.8rem',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'border-color 0.15s, color 0.15s',
      }}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setLabel('Copied ✓');
        window.setTimeout(() => setLabel('Copy Message'), 1500);
      }}
    >
      {label}
    </button>
  );
}
