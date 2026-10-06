/**
 * The Manifest mark: a shipping container's doors with a green "verified" stamp, i.e. pay on
 * proof. Drawn with the theme tokens so it follows light and dark mode; the static copies
 * (favicon, PWA and wallet icons) live in src/app/icon.svg and public/.
 */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={className}>
      <rect width="64" height="64" rx="14" fill="var(--ink)" />
      <rect x="9" y="13" width="40" height="32" rx="3" fill="var(--accent)" />
      <path d="M9 18.5h40M9 39.5h40" stroke="var(--ink)" strokeWidth="2" />
      <path d="M19 18.5v21M29 13v32M39 18.5v21" stroke="var(--ink)" strokeWidth="2" />
      <circle cx="45" cy="45" r="13" fill="var(--stamp)" stroke="var(--ink)" strokeWidth="3.5" />
      <path
        d="M39 45.5l4 4 8-8.5"
        fill="none"
        stroke="var(--paper)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
