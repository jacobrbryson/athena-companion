import { api } from './client';
import type { AthenaAction } from './companion';

export type SourceStatus = 'ready' | 'not_connected' | 'needs_reauth' | 'consent_required' | 'error';
/** `detail` is the provider's own reason a card is blank, redacted server-side.
 *  Adult-only by construction: every dashboard route is behind requireAdultActor. */
export interface Source<T> { status: SourceStatus; data: T | null; detail?: string | null; checkedAt: string }
export interface CalendarEvent { id: string | null; title: string; start: string; end: string; allDay: boolean; location: string | null; calendar: string | null; shared: boolean }
/** One scored (or pending) Whoop recovery. `state` is 'SCORED' when the rest
 *  of the row can be trusted; the heart fields are null on unscored days. */
export interface RecoveryDay {
  date: string; recovery_score: number | null; state: string;
  resting_heart_rate?: number | null; hrv_ms?: number | null; spo2_percent?: number | null;
}
export interface JiraIssue { key: string; title: string; status: string; project: string; updated: string; due: string | null; site: string; url: string }
export interface DashboardSummary {
  calendar: Source<{ events: CalendarEvent[]; timeZone: string; days: number }>;
  /** Whoop's own recovery fields, straight through. The heart numbers were
   *  always in this payload; the dashboard reads them now. */
  recovery: Source<RecoveryDay[]>;
  sleep: Source<{ date: string; nap: boolean; hours_asleep: number; hours_in_bed?: number; sleep_performance_percent: number | null; sleep_efficiency_percent?: number | null; respiratory_rate?: number | null }[]>;
  strain: Source<{ date: string; day_strain: number | null; average_heart_rate?: number | null; kilojoules?: number | null }[]>;
  activity: Source<{ days: number; activities: { name: string; type: string; start: string; distance_mi: number; moving_time_s: number }[] }>;
  familyChores: Source<{ name: string; chores: { title: string; completed: boolean; status: string | null; dueDate: string | null }[] }>;
  jira: Source<{ issues: JiraIssue[]; partial: boolean }>;
  slack: Source<{ workspace: string; messages: { text: string; channel: string; url: string; timestamp: string }[] }>;
  emailTriage: Source<{ newCount: number; receiptCount: number; travelCount: number; schoolCount: number; otherCount: number; preview: TriageEmail[] }>;
}
export type EmailCategory = 'receipt' | 'travel' | 'school' | 'other';
export type EmailTriageStatus = 'new' | 'actioned' | 'dismissed' | 'trashed';
/** One receipt/travel/school-announcement email Athena has sorted out of the inbox.
 *  `extracted` is the LLM's structured read of it — receipt fields, or a candidate
 *  calendar event — null for 'other', which gets no extraction pass at all. */
export interface TriageEmail {
  uuid: string; gmail_message_id: string; thread_id: string | null;
  subject: string | null; from_address: string | null; from_name: string | null;
  received_at: string | null; category: EmailCategory;
  /** Set for receipts sharing a merchant/sender — how the panel offers "review as a group?" */
  group_key: string | null;
  extracted: Record<string, unknown> | null;
  status: EmailTriageStatus; created_at: string;
}
/** Other 'new' emails sharing this one's group_key — the group-review prompt reads this. */
export interface TriageEmailDetail extends TriageEmail { siblings: TriageEmail[] }
/** One card, and Athena's one-line reason for putting it where she did. */
export interface PriorityEntry { id: string; why: string | null }
/** `source` is 'default' when no model ranked this — the UI stays quiet then. */
export type AlertLevel = 'none' | 'watch' | 'urgent';
/** What Athena, reading the whole dashboard at open, decided belongs across the top of the screen. */
export interface DashboardAlert { level: Exclude<AlertLevel, 'none'>; headline: string; body: string; source: 'athena' | 'emergencies' }
export interface DashboardPriority { order: PriorityEntry[]; source: 'athena' | 'default'; alert?: DashboardAlert | null; model?: string | null; generatedAt: string }
/** One nearby emergency call, as the incident watcher stored it. */
export interface NearbyIncident { id: string; what: string; category: string | null; where: string; miles: number; place: string; units: number; receivedAt: string | null; serious: boolean; latitude?: number; longitude?: number }
/** A place watched for emergencies nearby: home, a parent's house. */
export interface WatchPlace { uuid: string; name: string; address: string | null; latitude: number; longitude: number; radiusMiles: number; enabled: boolean }
/** A ring on the map: where a watched place is and how far it reaches. */
export interface AlertPlace { name: string; latitude: number; longitude: number; radiusMiles: number; live?: boolean }
export interface AddressMatch { label: string; latitude: number; longitude: number }
/** A National Weather Service alert covering a watched place. */
export interface WeatherAlert {
  id: string;
  event: string;
  severity: string;
  urgency: string;
  headline: string;
  instruction: string | null;
  area: string;
  expires: string | null;
  place: string;
  serious: boolean;
}
/** Whether each source behind the alert can currently be read. */
export interface AlertSourceStatus { ok: boolean; blocked: boolean; lastOkAt: string | null; error: string | null }
/** The live emergency situation near this person's places — GET /dashboard/alert. */
export interface EmergencyAlert {
  level: AlertLevel;
  headline: string | null;
  body: string | null;
  incidents: NearbyIncident[];
  key: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  assessedBy: string | null;
  feed: { ok: boolean; blocked?: boolean; lastOkAt: string | null; error: string | null };
  places?: AlertPlace[];
  weather?: WeatherAlert[];
  sources?: { calls: AlertSourceStatus; weather: AlertSourceStatus };
}
export interface TwilioBilling { configured: boolean; checkedAt: string; balance?: { amount: string | null; currency: string | null }; smsMessagesSent?: number; smsCostThisMonth?: number }
/**
 * A page Athena watches, and the rhythm she has settled on for it. The rhythm
 * is hers: there is no endpoint for setting it, only for saying which pages to
 * watch. `setBy: 'athena'` is the only case where `reason` is worth showing.
 */
export interface NewsSource {
  uuid: string; url: string; host: string; label: string; scope: 'world' | 'personal'; enabled: boolean;
  everyMinutes: number; rhythm: string; baselineMinutes: number;
  setBy: 'default' | 'rules' | 'athena' | 'person'; reason: string | null; fasterUntil: string | null;
  lastCheckedAt: string | null; nextCheckAt: string | null; lastChangedAt: string | null;
  lastError: string | null; headlines: number;
}
/** `firstSeen` is when Athena read it — trustworthy, unlike half of `published`. */
export interface NewsItem { title: string; url: string | null; summary: string | null; published: string | null; firstSeen: string; slot: number | null; sourceUuid: string; source: string }
export interface NewsResult { sources: NewsSource[]; items: NewsItem[]; checkedAt: string | null }
/**
 * One place Athena watches, and where it stands right now. `now.openNow` is
 * deliberately three-valued: `null` means the page never said, and the UI must
 * never round that up to open.
 */
export interface Place {
  uuid: string; label: string; url: string; host: string; activity: string;
  distanceMi: number | null; latitude: number | null; longitude: number | null; enabled: boolean;
  state: 'open' | 'closed' | 'unknown'; statusText: string | null; weatherDependent: boolean;
  hours: Record<string, [string, string][]> | null;
  lastCheckedAt: string | null; lastChangedAt: string | null; lastError: string | null;
  now: { openNow: boolean | null; why: string; closesAt?: string | null; closesInMinutes?: number | null;
    opensAt?: string | null; opensInMinutes?: number | null; todaysHours: string[] };
}
export type ProjectStatus = 'todo' | 'in_progress' | 'blocked' | 'done';
export interface HomeProject {
  uuid: string; title: string; detail: string | null; area: string | null;
  status: ProjectStatus; priority: 'low' | 'normal' | 'high';
  effortMinutes: number | null; indoor: boolean | null; costEstimate: number | null;
  dueDate: string | null; blockedOn: string | null; source: string;
}
export interface ProjectCounts { todo: number; inProgress: number; blocked: number; done: number; open: number }
/** What Athena is putting in front of them, and everything it was drawn from. */
export interface Suggestion {
  id: string; kind: 'place' | 'habit' | 'project' | 'goal' | 'work' | 'rest'; title: string; why: string | null;
  activity?: string; url?: string; distanceMi?: number | null; driveMinutes?: number | null;
  closesAt?: string | null; closesInMinutes?: number | null; todaysHours?: string[];
  usableMinutes?: number | null; weatherDependent?: boolean;
  weather?: { outlook: 'wet' | 'fine'; now: string | null; temperatureF: number | null; precipitationChance: number | null } | null;
  rhythm?: { activity: string; perWeek: number; usualDay: string | null; daysSince: number | null; thisWeek: number; isUsualDayToday: boolean } | null;
  area?: string | null; effortMinutes?: number | null; indoor?: boolean | null;
  status?: ProjectStatus | string | null; priority?: string; fitsWindow?: boolean; dueDate?: string | null;
  /** goal: what they said about it. work: the ticket. rest: the numbers behind it. */
  detail?: string | null; issueKey?: string; project?: string | null;
  recoveryScore?: number | null; hoursAsleep?: number | null;
}
export interface RightNow {
  headline: string | null;
  lead: Suggestion | null;
  alternates: Suggestion[];
  /** Why the obvious answer is not on offer — a closed park beats a blank card. */
  ruledOut: { id: string; title: string; reason: string; url?: string }[];
  window: { freeMinutes: number | null; busyWith: string | null;
    nextEvent: { title: string; start: string; inMinutes: number | null } | null };
  reason?: string | null;
  source: 'athena' | 'default';
  model?: string | null;
  generatedAt: string;
}
export const dashboardApi = {
  summary: async () => {
    const value = await api.cachedGet<DashboardSummary>('/api/v1/dashboard');
    if (!value.calendar || !value.jira) throw new Error('Dashboard API needs updating.');
    return value;
  },
  news: async () => {
    const value = await api.cachedGet<NewsResult>('/api/v1/dashboard/news');
    if (!Array.isArray(value.items)) throw new Error('News API needs updating.');
    return value;
  },
  priority: async () => {
    const value = await api.cachedGet<DashboardPriority>('/api/v1/dashboard/priority');
    if (!Array.isArray(value?.order)) throw new Error('Priority API needs updating.');
    return value;
  },
  /** Never cached: this is the one read whose staleness could matter. */
  alert: () => api.get<EmergencyAlert>('/api/v1/dashboard/alert'),
  watchPlaces: () => api.get<{ places: WatchPlace[] }>('/api/v1/dashboard/incidents/places'),
  /** Add, or update by name (radius, on/off, a corrected position). */
  saveWatchPlace: (place: { name: string; latitude: number; longitude: number; radiusMiles?: number; address?: string | null; enabled?: boolean }) =>
    api.put<{ places: WatchPlace[] }>('/api/v1/dashboard/incidents/places', place),
  removeWatchPlace: (uuid: string) => api.del<{ places: WatchPlace[] }>(`/api/v1/dashboard/incidents/places/${encodeURIComponent(uuid)}`),
  lookupAddress: (q: string) => api.get<{ matches: AddressMatch[] }>(`/api/v1/dashboard/incidents/geocode?q=${encodeURIComponent(q)}`),
  rightNow: async () => {
    const value = await api.cachedGet<RightNow>('/api/v1/dashboard/right-now');
    if (!value || !Array.isArray(value.alternates)) throw new Error('Right-now API needs updating.');
    return value;
  },
  places: () => api.get<{ places: Place[]; maxPlaces: number }>('/api/v1/dashboard/places'),
  addPlace: (place: { url: string; label?: string; activity: string; distanceMi?: number | null; latitude?: number | null; longitude?: number | null }) =>
    api.post<{ place: Place | null }>('/api/v1/dashboard/places', place),
  updatePlace: (uuid: string, patch: { label?: string; activity?: string; distanceMi?: number | null; enabled?: boolean }) =>
    api.patch<{ place: Place }>(`/api/v1/dashboard/places/${encodeURIComponent(uuid)}`, patch),
  removePlace: (uuid: string) => api.del<{ success: true }>(`/api/v1/dashboard/places/${encodeURIComponent(uuid)}`),
  checkPlace: (uuid: string) => api.post<{ place: Place }>(`/api/v1/dashboard/places/${encodeURIComponent(uuid)}/check`, {}),
  projects: () => api.get<{ projects: HomeProject[]; counts: ProjectCounts; maxProjects: number }>('/api/v1/dashboard/projects'),
  addProject: (project: Partial<HomeProject>) => api.post<{ project: HomeProject }>('/api/v1/dashboard/projects', project),
  updateProject: (uuid: string, patch: Partial<HomeProject>) =>
    api.patch<{ project: HomeProject }>(`/api/v1/dashboard/projects/${encodeURIComponent(uuid)}`, patch),
  removeProject: (uuid: string) => api.del<{ success: true }>(`/api/v1/dashboard/projects/${encodeURIComponent(uuid)}`),
  /** `dryRun` shows what the import would create without writing any of it. */
  importProjects: (text: string, dryRun = false) =>
    api.post<{ projects: HomeProject[]; created: number; skipped: { line: number | null; reason: string }[]; columns: string[]; unmapped: string[] }>(
      '/api/v1/dashboard/projects/import', { text, dryRun }),
  systemTwilio: () => api.get<TwilioBilling>('/api/v1/system/twilio-billing'),
  sources: () => api.get<{ sources: NewsSource[]; maxSources: number }>('/api/v1/dashboard/news/sources'),
  saveSources: (sources: (string | { url: string; label?: string | null; scope?: 'world' | 'personal' })[]) =>
    api.put<{ sources: NewsSource[] }>('/api/v1/dashboard/news/sources', { sources }),
  updateSource: (uuid: string, patch: { label?: string | null; scope?: 'world' | 'personal'; enabled?: boolean }) =>
    api.patch<{ source: NewsSource }>(`/api/v1/dashboard/news/sources/${encodeURIComponent(uuid)}`, patch),
  removeSource: (uuid: string) => api.del<{ success: true }>(`/api/v1/dashboard/news/sources/${encodeURIComponent(uuid)}`),
  /** "Look now", for the moment after someone adds a page. Rate limited server-side. */
  checkNews: () => api.post<{ checked: number; changed: number; failed: number; cooling: boolean }>('/api/v1/dashboard/news/check'),
  /** Paginated triage list; `cursor` is the previous page's last uuid. */
  mailList: (params: { status?: string; category?: string; cursor?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    if (params.category) q.set('category', params.category);
    if (params.cursor) q.set('cursor', params.cursor);
    if (params.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return api.get<{ items: TriageEmail[] }>(`/api/v1/dashboard/email${qs ? `?${qs}` : ''}`);
  },
  mailDetail: (uuid: string) => api.get<TriageEmailDetail>(`/api/v1/dashboard/email/${encodeURIComponent(uuid)}`),
  /** The "Scan more" button. Bounded and synchronous — no background job. */
  mailScan: (max?: number) =>
    api.post<{ scanned: number; newCount: number; byCategory: Record<string, number> }>(
      '/api/v1/dashboard/email/scan', max ? { max } : {}),
  /** Builds the right proposal (file_receipt_email / file_travel_or_school_email) from the email's stored category. */
  mailPropose: (uuid: string, overrides?: Record<string, unknown>) =>
    api.post<{ success: true; action: AthenaAction }>(
      `/api/v1/dashboard/email/${encodeURIComponent(uuid)}/propose`, overrides ? { overrides } : {}),
  mailProposeGroup: (emailTriageUuids: string[], overrides?: Record<string, unknown>) =>
    api.post<{ success: true; action: AthenaAction }>('/api/v1/dashboard/email/group/propose', {
      email_triage_uuids: emailTriageUuids, ...(overrides ? { overrides } : {}),
    }),
  /** Hides the email from the list without touching Gmail — proposes+confirms dismiss_email in one call. */
  mailDismiss: (uuid: string) =>
    api.post<{ success: true; action: AthenaAction }>(`/api/v1/dashboard/email/${encodeURIComponent(uuid)}/dismiss`),
  /** Proposes moving one or more emails to Gmail's Trash — recoverable there for ~30 days. Still needs approval. */
  mailDelete: (emailTriageUuids: string[]) =>
    api.post<{ success: true; action: AthenaAction }>('/api/v1/dashboard/email/delete', { email_triage_uuids: emailTriageUuids }),
};
