// Original illustrations for this product (no third-party mascots or assets).
export function TrophyBadge({ size = 120, locked = false }: { size?: number; locked?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id="tb-g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={locked ? "#c9bff0" : "#ffd36b"} />
          <stop offset="1" stopColor={locked ? "#9d8fd6" : "#f59e0b"} />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="108" rx="34" ry="7" fill="#241a43" opacity=".15" />
      <path d="M38 22h44v20c0 16-10 28-22 28S38 58 38 42z" fill="url(#tb-g)" stroke="#241a43" strokeWidth="3" />
      <path d="M38 30H26c0 12 6 20 16 21M82 30h12c0 12-6 20-16 21" fill="none" stroke="#241a43" strokeWidth="3" strokeLinecap="round" />
      <rect x="54" y="70" width="12" height="14" fill="url(#tb-g)" stroke="#241a43" strokeWidth="3" />
      <rect x="40" y="84" width="40" height="12" rx="4" fill="#8056ea" stroke="#241a43" strokeWidth="3" />
      <path d="M60 32l4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z" fill="#fff" opacity=".85" />
      {locked && (
        <g>
          <rect x="74" y="64" width="28" height="22" rx="5" fill="#241a43" />
          <path d="M80 64v-6a8 8 0 0116 0v6" fill="none" stroke="#241a43" strokeWidth="4" />
        </g>
      )}
    </svg>
  );
}

/** "Оч" — a small spark character used as the friendly guide. */
export function SparkGuide({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 4l7 17 18 3-13 12 3 18-15-9-15 9 3-18L7 24l18-3z" fill="#bba0ff" stroke="#241a43" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="26" cy="30" r="2.6" fill="#241a43" />
      <circle cx="38" cy="30" r="2.6" fill="#241a43" />
      <path d="M27 37q5 4 10 0" fill="none" stroke="#241a43" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#241a43" />
      <path d="M9 21l7-11 7 11" fill="none" stroke="#bba0ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="23" r="2.2" fill="#8056ea" />
    </svg>
  );
}
