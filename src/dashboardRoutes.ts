import type { DashboardSection } from './components/Dashboard';

const SECTION_PATHS: Record<DashboardSection, string> = {
  Dashboard: '/', Today: '/today', Health: '/health', Workouts: '/health/workouts',
  Family: '/family', Community: '/community', Property: '/properties', Work: '/work',
  System: '/system', Calendar: '/system/calendar', Mail: '/system/mail',
  Projects: '/system/projects', News: '/system/news', Dreams: '/system/dreams',
  Finance: '/system/finance',
};

export function dashboardPath(section: DashboardSection): string {
  return SECTION_PATHS[section];
}

export const dashboardRoutePaths = [...new Set(Object.values(SECTION_PATHS))];

export function sectionFromPath(pathname: string): DashboardSection {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/dashboard') return 'Dashboard';
  if (path === '/properties' || path.startsWith('/properties/')) return 'Property';
  return (Object.entries(SECTION_PATHS).find(([, entry]) => entry === path)?.[0] as DashboardSection | undefined) ?? 'Dashboard';
}
