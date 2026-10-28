import type { ReactNode } from 'react';

/**
 * Every icon in the app, in one place.
 *
 * Two kinds, one look. Most come from the supplied sprite sheet, whose
 * artwork already includes a bordered, tinted, glowing tile. The ones the
 * sheet has no window for are drawn here, and carry the same tile in CSS
 * (`svg.dashboard-icon-drawn` in dashboard.css) — so a drawn icon matches its
 * neighbours wherever it appears: the left nav, a card heading, the phone's
 * bottom bar. The tile belongs to the icon, not to the place it sits in; that
 * is what used to drift (Mail framed in the nav, bare on its card).
 *
 * Adding an icon: a sprite window below, or a drawn entry with its tone.
 */

// Explicit sprite windows preserve the borders on this irregular sheet. Today
// uses the supplied calendar tile so it has the same framed treatment as the
// other navigation links; the page itself remains distinct from Calendar.
const SPRITE: Record<string, number> = { Dashboard: 24, Today: 130, Calendar: 130, Health: 235, Family: 339, Work: 444, Projects: 551, News: 658, 'Quick Actions': 761, Search: 862, Chat: 970, More: 1075, Settings: 1183 };

/** Tile colours for drawn icons; see the `dashboard-icon-tone-*` rules. */
type Tone = 'blue' | 'violet';

const DRAWN: Record<string, { tone: Tone; art: ReactNode }> = {
  ProjectList: { tone: 'blue', art: <><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /><path d="M9 6h11M9 12h11M9 18h11" /></> },
  Completed: { tone: 'blue', art: <path d="m5 12 4.5 5L20 6" /> },
  PropertyProjects: { tone: 'blue', art: <><rect x="3" y="4" width="7" height="7" rx="1" /><rect x="14" y="4" width="7" height="7" rx="1" /><rect x="3" y="15" width="7" height="6" rx="1" /><path d="M14 16h7M14 20h7" /></> },
  Concerns: { tone: 'blue', art: <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5M12 17h.01" /></> },
  Issues: { tone: 'blue', art: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.6 17.4a1.9 1.9 0 0 0 2.7 2.7l5.7-5.7a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.3-.3-2.4 2.6-2.6Z" /> },
  Vehicles: { tone: 'blue', art: <><path d="M5 16H3.5v-3.5L6 8h12l2.5 4.5V16H19M5 12.5h14" /><circle cx="7.5" cy="16" r="1.8" /><circle cx="16.5" cy="16" r="1.8" /><path d="M9.3 16h5.4" /></> },
  Taxes: { tone: 'blue', art: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="m9 14 6-6M9.5 8.5h.01M14.5 13.5h.01" /></> },
  Utilities: { tone: 'blue', art: <path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z" /> },
  PropertyMap: { tone: 'blue', art: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></> },
  Seasonal: { tone: 'blue', art: <><path d="M20 3C10 3 4 7 4 13a7 7 0 0 0 7 7c6 0 9-7 9-17Z" /><path d="m3 21 12-12M8 16v-5M8 16h5" /></> },
  Notifications: { tone: 'blue', art: <><path d="M12 3.6a5.4 5.4 0 0 0-5.4 5.4c0 4.2-1.5 5.6-1.5 5.6h13.8s-1.5-1.4-1.5-5.6A5.4 5.4 0 0 0 12 3.6Z" /><path d="M10.4 18a1.8 1.8 0 0 0 3.2 0" /></> },
  Community: { tone: 'blue', art: <><path d="M3.6 11.4 12 4.8l8.4 6.6" /><path d="M5.8 9.8v9.4h12.4V9.8" /><circle cx="9.4" cy="13" r="1.5" /><circle cx="14.6" cy="13" r="1.5" /><path d="M7.2 19.2c0-1.9 1-3 2.2-3s2.2 1.1 2.2 3M12.4 19.2c0-1.9 1-3 2.2-3s2.2 1.1 2.2 3" /></> },
  // The house section (the briefing keeps the sprite's tile as Dashboard).
  Home: { tone: 'blue', art: <><path d="M3.6 11.2 12 4.6l8.4 6.6" /><path d="M5.8 9.6v9.6h12.4V9.6" /><path d="M10.2 19.2v-4.6h3.6v4.6" /><path d="M15.6 7.4V5.2h1.8v3.6" /></> },
  // Research: a flask.
  Research: { tone: 'blue', art: <><path d="M9.5 3.5h5M10.5 3.5v6L5 19a1.6 1.6 0 0 0 1.4 2.4h11.2A1.6 1.6 0 0 0 19 19l-5.5-9.5v-6" /><path d="M7.6 15h8.8" /></> },
  Mail: { tone: 'blue', art: <><rect x="3.6" y="6" width="16.8" height="12" rx="1.4" /><path d="m4.2 6.8 7.8 6 7.8-6" /></> },
  // The System page's tabs. Drawn so they sit in its tab strip like Property's;
  // the sprite's Calendar/Projects/News tiles stay in the nav and on cards.
  SystemOverview: { tone: 'blue', art: <><path d="M3.6 11.2 12 4.6l8.4 6.6" /><path d="M5.8 9.6v9.6h12.4V9.6" /><path d="M10.2 19.2v-4.6h3.6v4.6" /></> },
  SystemCalendar: { tone: 'blue', art: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M8.5 3v4M15.5 3v4M10 15h4M12 13v4" /></> },
  SystemProjects: { tone: 'blue', art: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="m8 12 3 3 5-6" /></> },
  SystemNews: { tone: 'blue', art: <><path d="M6 3.5h8.5L19 8v12.5H6Z" /><path d="M14 3.5V8h5M9 12h7M9 15.5h7M9 8.5h3" /></> },
  Finance: { tone: 'blue', art: <path d="M5 20v-6M10 20V9M15 20v-4M20 20V5M3.5 20h17" /> },
  // The briefing's stat strip.
  Gym: { tone: 'blue', art: <path d="M3 12h18M6.5 7.5v9M4 9.5v5M17.5 7.5v9M20 9.5v5" /> },
  Weather: { tone: 'blue', art: <path d="M7 18.5h10.2a3.8 3.8 0 0 0 .5-7.6 5.5 5.5 0 0 0-10.6 1.4A3.1 3.1 0 0 0 7 18.5Z" /> },
  Tasks: { tone: 'blue', art: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8.5 12 2.5 2.5 4.5-5" /></> },
  Dreams: { tone: 'violet', art: <><path className="icon-fill" d="M15.6 4.4a7.6 7.6 0 1 0 4 10.6 6.2 6.2 0 0 1-4-10.6Z" /><path d="M18.4 4.2v2.4M17.2 5.4h2.4" /><path d="M20.6 9.4v1.2M20 10h1.2" /></> },
};

/**
 * `bare` drops the tile, for the one place an icon already sits inside a
 * bordered button of its own (the bell in the top bar).
 */
export function DashboardIcon({ name, bare = false }: { name: string; bare?: boolean }) {
  if (name === 'Property') name = 'Home';
  const drawn = DRAWN[name];
  if (drawn) {
    const cls = ['dashboard-icon', 'dashboard-icon-drawn', `dashboard-icon-tone-${drawn.tone}`, bare ? 'dashboard-icon-bare' : ''].filter(Boolean).join(' ');
    return <svg aria-hidden="true" className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">{drawn.art}</svg>;
  }
  return <span aria-hidden="true" className="dashboard-icon" style={{ backgroundPosition: `${-(SPRITE[name] ?? SPRITE.Dashboard) * .4}px -16px` }} />;
}
