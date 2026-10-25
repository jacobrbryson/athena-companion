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
  /** The plan phase it's grouped under ("Concrete and Foundations"). A label only — it never makes a step wait. */
  phase?: string | null;
  /** What done means for this step, one check per line. */
  acceptanceCriteria?: string | null;
  /** While blocked: who or what it waits on, when to look again, and what would clear it. Cleared on unblock. */
  waitingOnActor?: string | null; reviewAt?: string | null; unblockAction?: string | null;
  /** Steps of the same project that must be done (or skipped) first. Order alone never makes a step wait. */
  dependsOn?: string[];
}

// --- Execution (core_api services/projects/execution.js; derived on every read, never stored) ---

export type SessionStatus = 'planned' | 'in_progress' | 'completed' | 'skipped' | 'cancelled';
export interface WorkSession {
  uuid: string; stepUuid: string | null; plannedStart: string; plannedMinutes: number; actualMinutes: number | null;
  status: SessionStatus; madeProgress: boolean | null;
  /** Set only by an approved calendar action; calendarInSync is false once the session moved and the event hasn't. */
  calendarEventId: string | null; calendarInSync: boolean | null;
  notes: string | null; completedAt: string | null; createdAt: string;
}
export interface NextAction {
  projectUuid: string; projectTitle: string; stepUuid: string; title: string; detail: string | null; phase?: string | null; acceptanceCriteria: string | null;
  status: StepStatus; who: ProjectStep['who']; effortMinutes: number | null; indoor: boolean | null; conditions: string[]; dueOn: string | null;
  fitsWindow: boolean | null; needsMultipleSessions: boolean; startsNew: boolean; urgentStart?: boolean; score: number;
  /** Why it's ready, in words — the first is always about its prerequisites. */
  reasons: string[];
}
export interface FollowUp {
  key: string; projectUuid: string; projectTitle: string; stepUuid: string; stepTitle: string;
  blockedOn: string | null; waitingOn: string | null; reviewAt: string | null;
  /** due: the check-back date has come. triage: there is no check-back date. */
  due: boolean; triage: boolean; overdueDays: number; action: string;
}
export type CompletionState = 'work_remaining' | 'outcome_unverified' | 'ready_for_confirmation' | 'verified_complete' | 'complete' | 'dropped';
export interface Completion {
  state: CompletionState; message: string; openSteps: number; stepsDone: number; stepsTotal: number;
  criteria: { total: number; confirmed: number }; hasCriteria: boolean; suggestCriteria?: boolean;
}
export interface Closeout {
  criteria: { text: string; confirmed: boolean }[]; openSteps: string[]; stepsDone: number; stepsSkipped: number;
  toVerify: string[]; sessionsCompleted: number; minutesWorked: number; canClose: boolean;
}
export interface SessionPreparation {
  sessionUuid: string; plannedStart: string; plannedMinutes: number;
  work: { stepUuid: string | null; title: string; detail: string | null; acceptanceCriteria: string[] };
  materials: { label: string; value: string | null; status: ItemStatus }[]; toVerify: string[];
  blockers: { kind: string; text: string; action: string }[];
  weather: { outdoor: boolean | null; needs: string[]; warning: string | null };
}
export interface ExecutionState {
  completion: Completion; executableSteps: { uuid: string; title: string }[]; nextAction: NextAction | null;
  blockedSteps: FollowUp[]; dueFollowUps: FollowUp[]; needsTriage: FollowUp[];
  upcomingSessions: WorkSession[]; sessionsToCheckIn: WorkSession[];
  unscheduled: { uuid: string; title: string; effortMinutes: number | null }[];
  /** The plan by phase, in order; name null holds the unlabelled steps. Empty when no step has a phase. */
  phases?: PlanPhase[];
  daysSinceProgress: number | null;
  /** When nothing is ready: why, and what would change that. */
  noActionReason: string | null; unblock: string | null;
  preparation?: SessionPreparation;
}
export interface PlanPhase { name: string | null; stepUuids: string[]; done: number; total: number; blocked: number; from: string | null; to: string | null }
/** The phases a project's steps use, in plan order — what the phase field offers to pick from. */
export const phaseNames = (p: Project) => [...new Set([...p.steps].sort((a, b) => a.ordinal - b.ordinal).map(s => s.phase).filter((x): x is string => !!x))];
export interface ProjectPrefs { focusLimit: number; preferFinishing: boolean }
export interface ExecutionSummary {
  nextActions: NextAction[]; followUps: FollowUp[]; upcomingSessions: (WorkSession & { projectUuid: string; projectTitle: string; stepTitle: string | null })[];
  focus: { active: number; limit: number; preferFinishing: boolean; over: boolean };
  metrics: Record<string, unknown>;
}
export const COMPLETION_LABEL: Record<CompletionState, string> = {
  work_remaining: 'Work remaining', outcome_unverified: 'Steps done — outcome unverified', ready_for_confirmation: 'Ready to close out',
  verified_complete: 'Finished & confirmed', complete: 'Done', dropped: 'Dropped',
};
/** "Done when" and acceptance criteria are one per line; bullets and checkboxes are formatting. Mirrors shape.criteriaOf. */
export const criteriaOf = (text: string | null | undefined) =>
  String(text || '').split(/\r?\n/).map(l => l.replace(/^\s*(?:[-*•]|\d+[.)]|\[\s?[xX]?\s?\])\s*/, '').trim()).filter(Boolean).slice(0, 40);

/** A spec (a measurement or decision) or a material-takeoff line, with how sure it is. */
export type ItemKind = 'spec' | 'material';
export type ItemStatus = 'confirmed' | 'pending' | 'estimate';
export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = { confirmed: 'Confirmed', pending: 'To verify', estimate: 'Estimate' };
export interface ProjectItem {
  uuid: string; kind: ItemKind; ordinal: number; label: string; value: string | null; unit: string | null;
  status: ItemStatus; costLow: number | null; costHigh: number | null; note: string | null; confirmedAt: string | null;
}
export type ItemInput = Partial<Omit<ProjectItem, 'uuid' | 'ordinal' | 'confirmedAt'>>;

export interface Project {
  uuid: string; title: string; goal: string | null; kind: string | null;
  /** The person's own reference (e.g. HOME-SIDEYARD-2026-001) and the spec revision they're on. */
  refCode: string | null; revision: string | null;
  /** Set when they moved it to the front of the line; pinned projects rank above everything, newest first. */
  pinnedAt: string | null;
  budget: { working: number | null; ceiling: number | null; note: string | null };
  items: ProjectItem[];
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
  /** What finished looks like, one check per line, and the checks they've confirmed (by text). */
  doneWhen?: string | null; doneWhenConfirmed?: string[]; outcomeConfirmedAt?: string | null;
  sessions?: WorkSession[];
  /** Open projects only; older servers send none. */
  execution?: ExecutionState | null;
  completion?: Completion;
  closeout?: Closeout | null;
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

export interface ProjectsSnapshot {
  projects: Project[]; links: ProjectLink[]; concerns: Concern[]; charters: Charter[];
  prefs?: ProjectPrefs; execution?: ExecutionSummary;
}

/** What a create/patch may send. Nested objects merge field by field on the server. */
export type ProjectInput = Partial<Omit<Project, 'effort' | 'cost' | 'metric' | 'areas' | 'budget' | 'items' | 'pinnedAt'>> & {
  /** true moves it to the front (again, if already pinned); false hands it back to the ranking. */
  pinned?: boolean;
  budget?: Partial<Project['budget']> | null;
  effort?: Partial<Project['effort']> | null;
  cost?: Partial<Project['cost']> | null;
  metric?: Partial<NonNullable<Project['metric']>> | null;
  areas?: Area[];
  primaryArea?: Area;
  completedAt?: string | null;
  /** Closing a project with "done when" checks is the person confirming them — required by the server. */
  outcomeConfirmed?: boolean;
};
export type StepInput = Partial<Omit<ProjectStep, 'uuid' | 'ordinal' | 'completedAt'>>;
export interface SessionInput {
  stepUuid?: string | null; plannedStart?: string; plannedMinutes?: number; actualMinutes?: number | null;
  status?: SessionStatus; madeProgress?: boolean | null; notes?: string | null;
}
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
  addDependency: (uuid: string, step: string, dependsOn: string) =>
    api.post<Write>(`/api/v1/projects/${id(uuid)}/steps/${id(step)}/dependencies`, { dependsOn }),
  removeDependency: (uuid: string, step: string, dependsOn: string) =>
    api.del<Write>(`/api/v1/projects/${id(uuid)}/steps/${id(step)}/dependencies/${id(dependsOn)}`),
  addSession: (uuid: string, input: SessionInput & { plannedStart: string; plannedMinutes: number }) =>
    api.post<Write>(`/api/v1/projects/${id(uuid)}/sessions`, input),
  updateSession: (uuid: string, session: string, patch: SessionInput) => api.patch<Write>(`/api/v1/projects/${id(uuid)}/sessions/${id(session)}`, patch),
  removeSession: (uuid: string, session: string) => api.del<Write>(`/api/v1/projects/${id(uuid)}/sessions/${id(session)}`),
  putPrefs: (prefs: Partial<ProjectPrefs>) => api.put<Write>('/api/v1/projects/prefs', prefs),
  addItem: (uuid: string, item: ItemInput & { kind: ItemKind; label: string }) => api.post<Write>(`/api/v1/projects/${id(uuid)}/items`, item),
  updateItem: (uuid: string, item: string, patch: ItemInput) => api.patch<Write>(`/api/v1/projects/${id(uuid)}/items/${id(item)}`, patch),
  removeItem: (uuid: string, item: string) => api.del<Write>(`/api/v1/projects/${id(uuid)}/items/${id(item)}`),
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
