import { api } from './client';

/**
 * Property issues (core_api src/controllers/propertyIssues.js): something
 * wrong at the house right now. Every write answers with the whole list, so
 * the app replaces its copy rather than patching it. Photos are listed by
 * uuid and fetched per issue with `photos`.
 */
export type IssueSeverity = 'low' | 'medium' | 'high' | 'emergency';
export const SEVERITIES: { id: IssueSeverity; label: string; note: string }[] = [
  { id: 'low', label: 'Low', note: 'Minor issue' },
  { id: 'medium', label: 'Medium', note: 'Not urgent' },
  { id: 'high', label: 'High', note: 'Needs attention' },
  { id: 'emergency', label: 'Emergency', note: 'Safety concern' },
];
export const SEVERITY_RANK: Record<IssueSeverity, number> = { emergency: 4, high: 3, medium: 2, low: 1 };

export interface PropertyIssue {
  uuid: string; location: string; description: string; severity: IssueSeverity; noticedOn: string;
  notes: string | null; status: 'open' | 'resolved'; resolvedAt: string | null; createdAt: string; updatedAt: string;
  photos: string[];
  /** Running notes the person keeps while dealing with it, oldest first. */
  log: IssueNote[];
}
export interface IssueNote { uuid: string; body: string; createdAt: string }
export interface IssueInput {
  location: string; description: string; severity: IssueSeverity; noticedOn: string; notes: string | null;
  /** New issue: JPEG data URLs. */
  photos?: string[];
}
export type IssuePatch = Partial<Omit<IssueInput, 'photos'>> & { status?: 'open' | 'resolved'; addPhotos?: string[]; removePhotos?: string[] };

type List = { issues: PropertyIssue[] };
const base = '/api/v1/projects/property/issues';
const id = (uuid: string) => encodeURIComponent(uuid);

export const issuesApi = {
  all: () => api.get<List>(base),
  create: (input: IssueInput) => api.post<List>(base, input),
  update: (uuid: string, patch: IssuePatch) => api.patch<List>(`${base}/${id(uuid)}`, patch),
  remove: (uuid: string) => api.del<List>(`${base}/${id(uuid)}`),
  addNote: (uuid: string, body: string) => api.post<List>(`${base}/${id(uuid)}/notes`, { body }),
  removeNote: (uuid: string, note: string) => api.del<List>(`${base}/${id(uuid)}/notes/${id(note)}`),
  photos: (uuid: string) => api.get<{ photos: { uuid: string; image: string }[] }>(`${base}/${id(uuid)}/photos`),
};

/** Open first, most severe first, newest first. */
export function sortIssues(issues: PropertyIssue[]) {
  return issues.slice().sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1)
    || SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
