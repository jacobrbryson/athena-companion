import type { ProjectsSnapshot } from '../api/projects';
type Point = { x: number; y: number };
export type PropertyArea = Point & { name: string; projects: string[]; concerns: string[] };
export type PropertyDetails = { uuid?: string; name: string; address: string; description: string; acreage: number | string | null; headerImage: string; mapImage: string; areas: PropertyArea[]; boundary: Point[] };
export function areaHealth(area: PropertyArea, snap: ProjectsSnapshot) {
  const projects = snap.projects.filter(p => area.projects.includes(p.uuid) && p.status !== 'dropped');
  const linkedConcerns = snap.concerns.filter(c => area.concerns.includes(c.uuid) || c.projects.some(id => area.projects.includes(id)));
  const concerns = linkedConcerns.filter(c => c.status !== 'resolved');
  if (!projects.length && !linkedConcerns.length) return { label: 'Not assessed', tone: 'unknown', score: null };
  const severity = Math.max(0, ...concerns.map(c => c.severity));
  if (severity >= 4) return { label: 'At risk', tone: 'risk', score: 25 };
  const stalled = projects.some(p => !['done', 'dropped'].includes(p.status) && (p.effectiveStatus === 'blocked' || (p.hardDeadline && p.hardDeadline < new Date().toLocaleDateString('en-CA'))));
  if (concerns.length || stalled) return { label: 'Needs attention', tone: 'attention', score: 55 };
  return { label: 'On track', tone: 'good', score: 100 };
}
export function propertyHealth(property: PropertyDetails | null, snap: ProjectsSnapshot) {
  const health = property?.areas.map(a => areaHealth(a, snap)) || [];
  return health.some(h => h.tone === 'risk') ? 'At risk' : health.some(h => h.tone === 'attention') ? 'Needs attention' : !health.length || health.some(h => h.tone === 'unknown') ? 'Not assessed' : 'On track';
}


