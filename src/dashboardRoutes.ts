import type { DashboardSection } from './components/Dashboard';

const SECTION_PATHS: Record<DashboardSection, string> = {
  Dashboard: '/', Today: '/today', Health: '/health', Workouts: '/health/workouts',
  Family: '/family', FamilyFinance: '/family/finance', FamilyTrading: '/family/trading', Community: '/community', CommunityPlaces: '/community/points-of-interest', Property: '/properties', Work: '/work', Research: '/research',
  System: '/system', Calendar: '/system/calendar', Mail: '/system/mail',
  Projects: '/system/projects', News: '/system/news', Dreams: '/system/dreams',
  Finance: '/system/finance',
};

export function dashboardPath(section: DashboardSection): string {
  return SECTION_PATHS[section];
}

export const dashboardRoutePaths = [...new Set(Object.values(SECTION_PATHS))];

/** A project's own page: /properties/<id>/projects/<uuid> or /system/projects/<uuid>. Null on every other path. */
export function projectUuidFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/(?:properties\/[^/]+|system)\/projects\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function sectionFromPath(pathname: string): DashboardSection {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/dashboard') return 'Dashboard';
  if (path.startsWith(`${SECTION_PATHS.Projects}/`)) return 'Projects';
  if (path === '/properties' || path.startsWith('/properties/')) return 'Property';
  return (Object.entries(SECTION_PATHS).find(([, entry]) => entry === path)?.[0] as DashboardSection | undefined) ?? 'Dashboard';
}
