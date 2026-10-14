import { api } from './client';

/**
 * Projects (core_api docs/architecture/projects.md). The server answers every
 * write with the whole snapshot, so the app never patches its own copy — it
 * replaces it, and links, blocked states and ranks are always the server's.
 */
export type Area = 'health' | 'family' | 'community' | 'work' | 'home';
export const AREAS: Area[] = ['health', 'family', 'community', 'home', 'work'];
export const AREA_LABEL: Record<Area, string> = { health: 'Health', family: 'Family', community: 'Community', work: 'Work', home: 'Home' };

export type ProjectState = 'idea' | 'planning' | 'ready' | 'active' | 'waiting' | 'blocked' | 'done' | 'dropped';
export const STATES: ProjectState[] = ['idea', 'planning', 'ready', 'active', 'waiting', 'blocked', 'done', 'dropped'];
export const STATE_LABEL: Record<ProjectState, string> = {
  idea: 'Idea', planning: 'Planning', ready: 'Ready', active: 'Active', waiting: 'Waiting', blocked: 'Blocked', done: 'Done', dropped: 'Dropped',
};
export const PRIORITY_LABEL: Record<number, string> = { 1: 'Low', 2: 'Low–medium', 3: 'Medium', 4: 'High', 5: 'Critical' };
export const CONDITIONS = ['dry', 'mild', 'warm', 'cold', 'during_rain', 'after_rain', 'no_freeze', 'daylight'] as const;

export type StepStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'skipped';
export interface ProjectStep {
  uuid: string; ordinal: number; title: string; detail: string | null; status: StepStatus;
  who: 'me' | 'someone' | 'athena'; blockedOn: string | null; dueOn: string | null;
  effortMinutes: number | null; indoor: boolean | null; completedAt: string | null;
}

export interface Project {
  uuid: string; title: string; goal: string | null; kind: string | null;
  status: ProjectState; effectiveStatus: ProjectState; waitingOn: string | null; priority: number;
  startsOn: string | null; endsOn: string | null; hardDeadline: string | null;
  metric: { source: string | null; start: number | null; target: number | null; unit: string | null } | null;
  effort: { min: number | null; max: number | null; note: string | null };
  indoor: boolean | null;
  cost: { diyLow: number | null; diyHigh: number | null; proLow: number | null; proHigh: number | null; note: string | null };
  valueNote: string | null; seasonMonths: number[] | null; conditions: string[]; serves: string[];
  involvesChildren: boolean; visibility: 'private' | 'household';
  areas: { area: Area; primary: boolean }[]; primaryArea: Area;
  steps: ProjectStep[];
  progress: { steps: { done: number; total: number }; contributors: { done: number; total: number } };
  rank: number | null; rankWhy: string[];
  /** Journal counts and the newest stored photo's entry uuid (device-held photos never count as a cover). */
  media: { entries: number; photos: number; cover: string | null };
  /** Sources this project reads live (weight, WHOOP sports, calendar). Read their data with projectsApi.bound. */
  bindings: Binding[];
  lastProgressAt: string | null; completedAt: string | null; source: string; importKey: string | null;
  createdAt: string; updatedAt: string;
}
export type Relation = 'contributes_to' | 'depends_on';
export interface ProjectLink { from: string; to: string; relation: Relation; note: string | null }
export interface Concern {
  uuid: string; area: Area; title: string; severity: number; frequency: string | null;
  likelyCause: string | null; goalImpact: string | null; assessment: string | null;
  status: 'open' | 'monitoring' | 'resolved'; resolvedAt: string | null; projects: string[];
}
export interface Charter { area: Area; body: string; weights: Record<string, number> | null; updatedAt: string }
export type EntryType = 'note' | 'photo' | 'decision' | 'measurement';
export type Phase = 'concept' | 'before' | 'progress' | 'after' | 'memory';
export const PHASES: Phase[] = ['concept', 'before', 'progress', 'after', 'memory'];
export interface ProjectEntry {
  uuid: string; type: EntryType; phase: Phase | null; body: string | null;
  /** 'server': stored, fetch with projectsApi.image. 'device': only on the device that took it (deviceRef). */
  media: 'server' | 'device' | null; deviceRef: string | null; involvesChildren: boolean;
  source: string; takenAt: string | null; createdAt: string;
}
export interface EntryInput {
  type: EntryType; phase?: Phase; body?: string | null; takenAt?: string | null;
  /** Bare base64 JPEG — refused by the server for anything involving children. */
  image?: string; deviceRef?: string; involvesChildren?: boolean;
}

export type SourceType = 'health_metric' | 'whoop_sport' | 'calendar_match';
export interface Binding {
  uuid: string; sourceType: SourceType; status: 'proposed' | 'confirmed' | 'rejected'; proposedBy: 'owner' | 'athena';
  selector: { metric?: 'weight'; sports?: string[]; titleAny?: string[] };
}
export interface WeightData {
  unit: 'lb' | 'kg'; start: number | null; target: number | null; startsOn: string | null; endsOn: string | null;
  actual: number | null; planned: number | null; gap: number | null; verdict: 'on_track' | 'ahead' | 'behind' | null;
  latest: { date: string; value: number } | null; change: number | null; series: { date: string; value: number }[];
}
export interface WorkoutData {
  sports: string[]; since: string | null; total: number; thisWeek: number; bySport: Record<string, number>;
  weekly: { week: string; count: number }[]; last: { date: string; sport: string; minutes: number; strain: number | null } | null;
}
export interface CalendarData { upcoming: { title: string; start: string; end: string; allDay: boolean; location: string | null }[] }
export type BoundData = Binding & { data: WeightData | WorkoutData | CalendarData | null; error?: string; errorCode?: string | null };

export interface ProjectsSnapshot { projects: Project[]; links: ProjectLink[]; concerns: Concern[]; charters: Charter[] }

/** What a create/patch may send. Nested objects merge field by field on the server. */
export type ProjectInput = Partial<Omit<Project, 'effort' | 'cost' | 'metric' | 'areas'>> & {
  effort?: Partial<Project['effort']> | null;
  cost?: Partial<Project['cost']> | null;
  metric?: Partial<NonNullable<Project['metric']>> | null;
  areas?: Area[];
  primaryArea?: Area;
  completedAt?: string | null;
};
export type StepInput = Partial<Omit<ProjectStep, 'uuid' | 'ordinal' | 'completedAt'>>;
export type ConcernInput = Partial<Omit<Concern, 'uuid' | 'resolvedAt'>>;

const id = (uuid: string) => encodeURIComponent(uuid);
type Write = ProjectsSnapshot & { success: true };

export const projectsApi = {
  all: () => api.get<ProjectsSnapshot>('/api/v1/projects'),
  create: (input: ProjectInput) => api.post<Write>('/api/v1/projects', input),
  update: (uuid: string, patch: ProjectInput) => api.patch<Write>(`/api/v1/projects/${id(uuid)}`, patch),
  remove: (uuid: string) => api.del<Write>(`/api/v1/projects/${id(uuid)}`),
  addStep: (uuid: string, step: StepInput) => api.post<Write>(`/api/v1/projects/${id(uuid)}/steps`, step),
  updateStep: (uuid: string, step: string, patch: StepInput) => api.patch<Write>(`/api/v1/projects/${id(uuid)}/steps/${id(step)}`, patch),
  removeStep: (uuid: string, step: string) => api.del<Write>(`/api/v1/projects/${id(uuid)}/steps/${id(step)}`),
  reorderSteps: (uuid: string, order: string[]) => api.post<Write>(`/api/v1/projects/${id(uuid)}/steps/reorder`, { order }),
  addLink: (uuid: string, relation: Relation, to: string, note?: string) => api.post<Write>(`/api/v1/projects/${id(uuid)}/links`, { relation, to, note }),
  removeLink: (uuid: string, relation: Relation, to: string) =>
    api.del<Write>(`/api/v1/projects/${id(uuid)}/links?relation=${relation}&to=${id(to)}`),
  entries: (uuid: string) => api.get<{ entries: ProjectEntry[] }>(`/api/v1/projects/${id(uuid)}/entries`),
  addEntry: (uuid: string, input: EntryInput) => api.post<Write>(`/api/v1/projects/${id(uuid)}/entries`, input),
  updateEntry: (uuid: string, entry: string, patch: { body?: string | null; phase?: Phase; takenAt?: string | null; moveTo?: string }) =>
    api.patch<Write>(`/api/v1/projects/${id(uuid)}/entries/${id(entry)}`, patch),
  removeEntry: (uuid: string, entry: string) => api.del<Write>(`/api/v1/projects/${id(uuid)}/entries/${id(entry)}`),
  image: (uuid: string, entry: string) => api.blob(`/api/v1/projects/${id(uuid)}/entries/${id(entry)}/image`),
  bound: (uuid: string) => api.get<{ bindings: BoundData[] }>(`/api/v1/projects/${id(uuid)}/bound`),
  bindingOptions: () => api.get<{ sports: { sport: string; count: number }[]; metrics: string[] }>('/api/v1/projects/binding-options'),
  addBinding: (uuid: string, sourceType: SourceType, selector: Binding['selector']) =>
    api.post<Write>(`/api/v1/projects/${id(uuid)}/bindings`, { sourceType, selector }),
  removeBinding: (uuid: string, binding: string) => api.del<Write>(`/api/v1/projects/${id(uuid)}/bindings/${id(binding)}`),
  createConcern: (input: ConcernInput) => api.post<Write>('/api/v1/projects/concerns', input),
  updateConcern: (uuid: string, patch: ConcernInput) => api.patch<Write>(`/api/v1/projects/concerns/${id(uuid)}`, patch),
  removeConcern: (uuid: string) => api.del<Write>(`/api/v1/projects/concerns/${id(uuid)}`),
  putCharter: (area: Area, body: string, weights: Record<string, number> | null) =>
    api.put<Write>(`/api/v1/projects/charters/${area}`, { body, weights }),
};
