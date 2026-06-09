export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-label="Loading"
      className={`hs-spinner ${className}`}
    />
  );
}
