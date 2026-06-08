'use client';

import { useState } from 'react';

export function CopyButton({ text }: { text: string }) {
  const [label, setLabel] = useState('Copy Message');

  return (
    <button
      type="button"
      className="inline-flex items-center justify-center rounded-full border border-line px-3 py-2 text-sm font-medium transition hover:border-[color:var(--brand)] hover:text-[color:var(--brand)]"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setLabel('Copied');
        window.setTimeout(() => setLabel('Copy Message'), 1500);
      }}
    >
      {label}
    </button>
  );
}
