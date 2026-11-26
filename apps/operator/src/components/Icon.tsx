// The app's one icon set: inline SVG on a 24px grid, 1.75 stroke, drawn in currentColor.
// Decorative by default (aria-hidden); the control around an icon carries the accessible name.
// Directional icons carry data-mirror so CSS flips them under dir="rtl".
import type { ReactElement } from 'react';

const PATHS = {
  floor: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  till: (
    <>
      <rect x="3.5" y="10.5" width="17" height="9" rx="1.5" />
      <path d="M7 10.5V5.5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v5" />
      <path d="M9.5 7.5h5M7.5 15h2M12 15h4.5" />
    </>
  ),
  shift: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  reports: (
    <>
      <path d="M4 20h16" />
      <path d="M7 16.5v-5M12 16.5V6.5M17 16.5v-8" />
    </>
  ),
  day: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <path d="m9 14.5 2 2 4-4" />
    </>
  ),
  stock: (
    <>
      <path d="M12 3.5 20 7.5v9L12 20.5 4 16.5v-9L12 3.5Z" />
      <path d="M4 7.5 12 11.5l8-4M12 11.5v9" />
    </>
  ),
  menu: (
    <>
      <path d="M5 4.5h11.5a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2v-13Z" />
      <path d="M5 17.5a2 2 0 0 1 2-2h11.5M9 8.5h6M9 11.5h4" />
    </>
  ),
  floorPlan: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="M3.5 12h7v8.5M10.5 3.5V8M15 12h5.5" />
    </>
  ),
  staff: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M3 19.5c.7-3.2 3-5 6-5s5.3 1.8 6 5" />
      <path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M18 14.8c1.5.8 2.6 2.4 3 4.7" />
    </>
  ),
  language: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5S14.3 18.1 12 20.5C9.7 18.1 8.6 15.3 8.6 12S9.7 5.9 12 3.5Z" />
    </>
  ),
  signOut: (
    <>
      <path d="M14 4.5H6.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1H14" />
      <path d="M10.5 12h10M17 8.5l3.5 3.5-3.5 3.5" />
    </>
  ),
  fullscreenExit: (
    <>
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </>
  ),
  power: (
    <>
      <path d="M12 3.5v8" />
      <path d="M7 6.3a7.5 7.5 0 1 0 10 0" />
    </>
  ),
  back: <path d="M15 5.5 8.5 12l6.5 6.5" />,
  forward: <path d="m9 5.5 6.5 6.5L9 18.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.25" fill="currentColor" stroke="none" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4 21 19.5H3L12 4Z" />
      <path d="M12 10v4M12 17v.01" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5c.8-3.3 3.6-5 7-5s6.2 1.7 7 5" />
    </>
  ),
  send: <path d="M4.5 12 19.5 4.5 15 19.5l-3-6-7.5-1.5Z" />,
  print: (
    <>
      <path d="M7 8.5V4.5h10v4" />
      <rect x="3.5" y="8.5" width="17" height="8" rx="1.5" />
      <path d="M7 14h10v5.5H7z" />
    </>
  ),
  cash: (
    <>
      <rect x="3" y="6.5" width="18" height="11" rx="1.5" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6.5 9.5v.01M17.5 14.5v.01" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3 10h18M6.5 14.5h4" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  edit: <path d="M4.5 19.5h4L19 9a2.1 2.1 0 0 0-3-3L5.5 16.5l-1 3ZM14.5 7.5l2 2" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  bell: (
    <>
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 7H4c0-1 2-2 2-7Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  // --- menu category icons (ticket 07): one per key of CATEGORY_ICONS in @rop/core ---
  catDish: (
    <>
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="3" />
      <path d="M3.5 4.5v5M2 4.5v3.5a1.5 1.5 0 0 0 3 0V4.5M20.5 4.5c-1.5 1-2 3-2 5h2v10" />
    </>
  ),
  catMezze: <path d="M3 11h18c0 5-4 8.5-9 8.5S3 16 3 11ZM8 21.5h8M9 4.5c-.8 1 .8 2 0 3M13 4.5c-.8 1 .8 2 0 3" />,
  catGrill: <path d="M12 3c.6 2.6 5 4.6 5 9.8a5 5 0 0 1-10 0c0-2 .9-3.5 2-4.6.2 1.5.9 2.5 1.8 3C10.8 8.6 10.4 6 12 3Z" />,
  catMain: <path d="M3 18h18M5 18a7 7 0 0 1 14 0M12 11V9M10.5 9h3" />,
  catSandwich: (
    <>
      <path d="M4 10a8 5 0 0 1 16 0H4Z" />
      <path d="M3.5 13.5h17M4 17h16" />
      <path d="M5.5 17a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2" />
    </>
  ),
  catDessert: <path d="M7 12h10l-1.5 8h-7L7 12ZM6 12a6 6 0 0 1 12 0M12 4v2" />,
  catHotDrink: <path d="M5 10h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5v-4ZM16 11h1.2a2.4 2.4 0 0 1 0 4.8H16M8 4v3M12 4v3M4 21.5h13" />,
  catColdDrink: (
    <>
      <path d="M6.5 8h11l-1.2 12a1 1 0 0 1-1 .9H8.7a1 1 0 0 1-1-.9L6.5 8Z" />
      <path d="M7 12.5h10M13 8l2-5h3" />
    </>
  ),
} satisfies Record<string, ReactElement>;

export type IconName = keyof typeof PATHS;

const MIRRORED: ReadonlySet<IconName> = new Set<IconName>(['back', 'forward', 'signOut', 'send']);

export function Icon({
  name,
  size = 24,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className ? `rop-icon ${className}` : 'rop-icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-mirror={MIRRORED.has(name) ? 'true' : undefined}
    >
      {PATHS[name]}
    </svg>
  );
}
