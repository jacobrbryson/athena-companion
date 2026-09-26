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
const SPRITE: Record<string, number> = { Home: 24, Today: 130, Calendar: 130, Health: 235, Family: 339, Work: 444, Projects: 551, News: 658, 'Quick Actions': 761, Search: 862, Chat: 970, More: 1075, Settings: 1183 };

/** Tile colours for drawn icons; see the `dashboard-icon-tone-*` rules. */
type Tone = 'blue' | 'violet';

const DRAWN: Record<string, { tone: Tone; art: ReactNode }> = {
  Notifications: { tone: 'blue', art: <><path d="M12 3.6a5.4 5.4 0 0 0-5.4 5.4c0 4.2-1.5 5.6-1.5 5.6h13.8s-1.5-1.4-1.5-5.6A5.4 5.4 0 0 0 12 3.6Z" /><path d="M10.4 18a1.8 1.8 0 0 0 3.2 0" /></> },
  Mail: { tone: 'blue', art: <><rect x="3.6" y="6" width="16.8" height="12" rx="1.4" /><path d="m4.2 6.8 7.8 6 7.8-6" /></> },
  Dreams: { tone: 'violet', art: <><path className="icon-fill" d="M15.6 4.4a7.6 7.6 0 1 0 4 10.6 6.2 6.2 0 0 1-4-10.6Z" /><path d="M18.4 4.2v2.4M17.2 5.4h2.4" /><path d="M20.6 9.4v1.2M20 10h1.2" /></> },
};

/**
 * `bare` drops the tile, for the one place an icon already sits inside a
 * bordered button of its own (the bell in the top bar).
 */
export function DashboardIcon({ name, bare = false }: { name: string; bare?: boolean }) {
  const drawn = DRAWN[name];
  if (drawn) {
    const cls = ['dashboard-icon', 'dashboard-icon-drawn', `dashboard-icon-tone-${drawn.tone}`, bare ? 'dashboard-icon-bare' : ''].filter(Boolean).join(' ');
    return <svg aria-hidden="true" className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">{drawn.art}</svg>;
  }
  return <span aria-hidden="true" className="dashboard-icon" style={{ backgroundPosition: `${-(SPRITE[name] ?? SPRITE.Home) * .4}px -16px` }} />;
}
