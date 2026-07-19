export function Logo({ className = 'h-8 w-8' }: Readonly<{ className?: string }>) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="Concourse logo"
    >
      <rect width="32" height="32" rx="8" fill="#00B67A" />
      <path
        d="M6 22c0-8 4.5-14 10-14s10 6 10 14"
        stroke="#0F1319"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="16" cy="14" r="2.2" fill="#FFC300" />
    </svg>
  );
}

export function Wordmark({ className = '' }: Readonly<{ className?: string }>) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Logo className="h-7 w-7" />
      <span className="font-display text-xl font-semibold tracking-tight">Concourse</span>
    </div>
  );
}
