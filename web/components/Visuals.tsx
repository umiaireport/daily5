import type { CSSProperties } from 'react';

/** Five rising candles: a compact mark for five rounds of market reading. */
export function DailyMark({ large = false }: { large?: boolean }) {
  return (
    <svg
      className={large ? 'daily-mark large' : 'daily-mark'}
      viewBox="0 0 64 40"
      fill="none"
      aria-hidden="true"
    >
      <path d="M6 34h52" stroke="currentColor" strokeOpacity=".25" />
      <path
        d="M11 28V18M22 25V10M33 29V15M44 22V7M55 17V3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect x="7" y="22" width="8" height="8" rx="1.5" fill="currentColor" />
      <rect x="18" y="14" width="8" height="11" rx="1.5" fill="currentColor" />
      <rect x="29" y="19" width="8" height="10" rx="1.5" fill="currentColor" />
      <rect x="40" y="10" width="8" height="12" rx="1.5" fill="currentColor" />
      <rect x="51" y="6" width="8" height="11" rx="1.5" fill="currentColor" />
      <path
        d="m8 18 10-7 11 5 11-9 11 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="55" cy="10" r="2" fill="#0b1016" />
    </svg>
  );
}

export function Sparkline({
  values,
  color = 'var(--mint)',
  large = false,
  label = 'Price before the decision cutoff',
}: {
  values: number[];
  color?: string;
  large?: boolean;
  label?: string;
}) {
  const min = Math.min(...values),
    max = Math.max(...values);
  const points = values
    .map(
      (v, i) =>
        `${8 + (i / Math.max(values.length - 1, 1)) * 284},${70 - ((v - min) / (max - min || 1)) * 54}`,
    )
    .join(' ');
  return (
    <svg
      className={`sparkline ${large ? 'expanded' : ''}`}
      viewBox="0 0 300 85"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {[20, 45, 70].map((y) => (
        <line
          key={y}
          x1="0"
          x2="300"
          y1={y}
          y2={y}
          stroke="currentColor"
          strokeOpacity=".07"
          strokeDasharray="3 5"
        />
      ))}
      <polygon points={`8,85 ${points} 292,85`} fill={color} fillOpacity=".055" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function Icon({
  name,
  size = 18,
}: {
  name:
    | 'arrow'
    | 'lock'
    | 'flow'
    | 'buyers'
    | 'pulse'
    | 'check'
    | 'close'
    | 'trophy'
    | 'download'
    | 'help'
    | 'cash';
  size?: number;
}) {
  const paths: Record<string, React.ReactNode> = {
    arrow: (
      <>
        <path d="M4 12h15M13 5l7 7-7 7" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 018 0v3M12 14v3" />
      </>
    ),
    flow: (
      <>
        <path d="M3 8h16m-4-4 4 4-4 4M21 16H5m4-4-4 4 4 4" />
      </>
    ),
    buyers: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0112 0v3M16 5a3 3 0 010 6M18 15a4 4 0 013 4v2" />
      </>
    ),
    pulse: <path d="M2 12h5l3-8 4 16 3-8h5" />,
    check: <path d="m5 12 4 4L20 5" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    trophy: (
      <>
        <path d="M8 3h8v7a4 4 0 01-8 0V3ZM8 5H4v3a4 4 0 004 4m8-7h4v3a4 4 0 01-4 4M12 14v6M8 21h8" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    help: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9 9a3 3 0 116 0c0 2-3 2-3 5M12 17h.01" />
      </>
    ),
    cash: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <circle cx="12" cy="12" r="3" />
        <path d="M6 12h.01M18 12h.01" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export const money = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
export const percent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
export const tokenStyle = (index: number) =>
  ({ '--token': ['#69ddbb', '#9d9af5', '#edb975'][index] }) as CSSProperties;
