import type { ProjectsSnapshot } from '../api/projects';
type Point = { x: number; y: number };
export type PropertyArea = Point & { name: string; projects: string[]; concerns: string[] };
export type PropertyDetails = { uuid?: string; name: string; address: string; description: string; acreage: number | string | null; headerImage: string; mapImage: string; areas: PropertyArea[]; boundary: Point[] };
/** The fields of a property issue that health reads (api/propertyIssues.ts). */
export type IssueSignal = { location: string; severity: 'low' | 'medium' | 'high' | 'emergency'; status: 'open' | 'resolved' };
type Health = { label: string; tone: string; score: number | null };
const RISK: Health = { label: 'At risk', tone: 'risk', score: 25 };
const ATTENTION: Health = { label: 'Needs attention', tone: 'attention', score: 55 };
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** Open issues: high or emergency puts a place at risk; low or medium needs attention. */
function issueHealth(issues: IssueSignal[]): Health | null {
  const open = issues.filter(i => i.status === 'open');
  if (!open.length) return null;
  return open.some(i => i.severity === 'high' || i.severity === 'emergency') ? RISK : ATTENTION;
}
export function areaHealth(area: PropertyArea, snap: ProjectsSnapshot, issues: IssueSignal[] = []): Health {
  const reported = issueHealth(issues.filter(i => same(i.location, area.name)));
  if (reported?.tone === 'risk') return reported;
  const projects = snap.projects.filter(p => area.projects.includes(p.uuid) && p.status !== 'dropped');
  const linkedConcerns = snap.concerns.filter(c => area.concerns.includes(c.uuid) || c.projects.some(id => area.projects.includes(id)));
  const concerns = linkedConcerns.filter(c => c.status !== 'resolved');
  if (!projects.length && !linkedConcerns.length) return reported || { label: 'Not assessed', tone: 'unknown', score: null };
  const severity = Math.max(0, ...concerns.map(c => c.severity));
  if (severity >= 4) return RISK;
  const stalled = projects.some(p => !['done', 'dropped'].includes(p.status) && (p.effectiveStatus === 'blocked' || (p.hardDeadline && p.hardDeadline < new Date().toLocaleDateString('en-CA'))));
  if (concerns.length || stalled || reported) return ATTENTION;
  return { label: 'On track', tone: 'good', score: 100 };
}
const ISSUE_ORDER = { emergency: 4, high: 3, medium: 2, low: 1 } as const;
/**
 * The property's health right now, from its active issues alone. Key areas keep
 * their own conditions (areaHealth) on the Key areas card; long-standing
 * concerns describe planned work, not the state of the house today, so they no
 * longer decide this headline.
 */
export function propertyHealth(issues: IssueSignal[]): { label: string; tone: 'good' | 'ok' | 'alert'; note: string } {
  const open = issues.filter(i => i.status === 'open').sort((a, b) => ISSUE_ORDER[b.severity] - ISSUE_ORDER[a.severity]);
  const worst = open[0];
  if (!worst) return { label: 'Good', tone: 'good', note: 'no active issues' };
  const note = open.length === 1 ? `${worst.location} · ${worst.severity}` : `${open.length} active issues · worst: ${worst.location}`;
  if (worst.severity === 'emergency') return { label: 'Emergency', tone: 'alert', note };
  if (worst.severity === 'high') return { label: 'At risk', tone: 'alert', note };
  return { label: 'Needs attention', tone: 'ok', note };
}
