import { api } from './client';
import type { AthenaAction } from './companion';

export type SourceStatus = 'ready' | 'not_connected' | 'needs_reauth' | 'consent_required' | 'error';
/** `detail` is the provider's own reason a card is blank, redacted server-side.
 *  Adult-only by construction: every dashboard route is behind requireAdultActor. */
export interface Source<T> { status: SourceStatus; data: T | null; detail?: string | null; checkedAt: string }
export interface CalendarEvent {
  id: string | null; title: string; start: string; end: string; allDay: boolean; location: string | null; calendar: string | null; shared: boolean;
  /** Google's event type: 'default', 'outOfOffice', 'focusTime', 'workingLocation'. Absent on older servers. */
  eventType?: string;
  /** Guests on the invite (so a meeting is told from a block of your own time). */
  attendees?: number;
  /** For a working-location event: "Home", "Office", or a label the person chose. */
  workingLocation?: string | null;
}
/** One scored (or pending) Whoop recovery. `state` is 'SCORED' when the rest
 *  of the row can be trusted; the heart fields are null on unscored days. */
export interface RecoveryDay {
  date: string; recovery_score: number | null; state: string;
  resting_heart_rate?: number | null; hrv_ms?: number | null; spo2_percent?: number | null;
}
export interface JiraIssue { key: string; title: string; status: string; /** 'new' | 'indeterminate' | 'done' — Jira's own grouping, so "in progress" holds in any workflow. */ statusCategory?: string; project: string; updated: string; due: string | null; site: string; url: string }
export interface DashboardSummary {
  /** `workingLocations` ("Home 7–4") are kept out of `events` on purpose. */
  calendar: Source<{ events: CalendarEvent[]; workingLocations?: CalendarEvent[]; timeZone: string; days: number }>;
  /** Whoop's own recovery fields, straight through. The heart numbers were
   *  always in this payload; the dashboard reads them now. */
  recovery: Source<RecoveryDay[]>;
  sleep: Source<{ date: string; nap: boolean; hours_asleep: number; hours_in_bed?: number; sleep_performance_percent: number | null; sleep_efficiency_percent?: number | null; respiratory_rate?: number | null }[]>;
  strain: Source<{ date: string; day_strain: number | null; average_heart_rate?: number | null; kilojoules?: number | null }[]>;
  familyChores: Source<{ name: string; chores: { title: string; completed: boolean; status: string | null; dueDate: string | null }[] }>;
  jira: Source<{ issues: JiraIssue[]; partial: boolean; /** Jira has more than was read, so a count is a floor. */ capped?: boolean }>;
  slack: Source<{ workspace: string; messages: { text: string; channel: string; url: string; timestamp: string }[] }>;
  emailTriage: Source<{ newCount: number; receiptCount: number; travelCount: number; schoolCount: number; otherCount: number; pendingCount?: number; bundles?: MailBundles; preview: TriageEmail[] }>;
  familyHealth: Source<{ active: FamilyHealthStatus[] }>;
}
export type HealthSeverity = 'mild' | 'moderate' | 'severe';
/** A child on the family profiles; birthday is YYYY-MM-DD. */
export interface FamilyChild { uuid: string; name: string; birthday: string | null; grade: string | null }
/** A Google Contact linked to a remembered family member; birthday is YYYY-MM-DD or year-less --MM-DD. */
export interface FamilyLink {
  factUuid: string; contactId: string; name: string | null;
  card: { contactId: string; name: string; birthday: string | null; phone: string | null; email: string | null; photoUrl: string | null } | null;
  status: 'ok' | 'missing' | 'not_connected' | 'unreadable';
}
export interface FamilyPeople { children: FamilyChild[]; links: FamilyLink[]; contactsLinked: boolean | null }

/** One family member currently reported under the weather. */
export interface FamilyHealthStatus {
  uuid: string; personName: string; symptom: string; severity: HealthSeverity;
  status: 'active' | 'resolved'; startedAt: string; resolvedAt: string | null; notes: string | null; daysActive: number;
}
/** `pending`: new mail the sync has seen but Athena has not sorted yet. */
export type EmailCategory = 'receipt' | 'travel' | 'school' | 'needs_reply' | 'promo' | 'notification' | 'fyi' | 'other' | 'pending';
export type EmailTriageStatus = 'new' | 'actioned' | 'dismissed' | 'trashed' | 'archived' | 'gone';
/** One email inside a bundle — enough to show it and let the person untick it. */
export interface BundleEmail { uuid: string; from: string; subject: string | null; received_at: string | null }
/**
 * What Athena proposes for the open list (Mail card phase 2). Each bundle
 * carries the rows it would act on; `count` can exceed `items` (capped at
 * 100 archive / 25 receipts / 10 replies), and one approval covers `items`.
 */
export interface MailBundles {
  archive: { count: number; senders: { name: string; count: number }[]; items: (BundleEmail & { category: EmailCategory })[] };
  receipts: { count: number; items: (BundleEmail & { merchant: string | null })[] };
  /** `start` is null when Athena found no date — those need one typed in, one at a time. */
  events: { count: number; items: (BundleEmail & { category: EmailCategory; title: string | null; start: string | null; all_day: boolean; location: string | null })[] };
  replies: { count: number; items: (BundleEmail & { ask: string | null })[] };
  /** Senders with 3+ promos/updates waiting and a one-click unsubscribe; `email_triage_uuid` is the email whose link is used. */
  unsubscribe?: { count: number; senders: { key: string; name: string; count: number; email_triage_uuid: string }[] };
}
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
export interface TriageEmailDetail extends TriageEmail {
  siblings: TriageEmail[];
  /** Read live from Gmail on open, not stored — plain text only, never the raw HTML. */
  body: string | null;
  bodyError?: string | null;
}
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
/** What watch.testAlert reports: each step, and whether the push reached anything. */
export interface AlertTestResult {
  ok: boolean;
  kind: 'pulsepoint' | 'weather';
  via?: 'server' | 'phone';
  text?: string;
  steps: { step: string; ok: boolean; detail: string | null }[];
}

/** What a point of interest is to the person. Only a label — every kind is watched the same way. */
export type PlaceKind = 'home' | 'family' | 'neighborhood' | 'church' | 'school' | 'town' | 'work' | 'business' | 'park' | 'other';
/** A point of interest: a place watched for emergencies nearby, and part of the person's community. */
export interface WatchPlace { uuid: string; name: string; kind: PlaceKind; address: string | null; notes: string | null; latitude: number; longitude: number; radiusMiles: number; enabled: boolean }
/** One of the person's Google Contacts, as the page shows it. Read live from Google, never stored. */
export interface ContactCard {
  contactId: string; name: string; phone: string | null; email: string | null; address: string | null; photoUrl: string | null;
  /** Already linked to this household (by uuid) — a contact lives at one household. */
  linkedTo?: { uuid: string; label: string | null };
}
/** A Google contact linked to a household: the saved name, and the live card when Google could be read. */
export interface LinkedContact { contactId: string; name: string | null; card?: ContactCard | null; status?: 'ok' | 'missing' | 'not_connected' | 'unreadable' }
/** A neighbouring household, kept by its address, with any number of linked Google contacts. */
export interface Neighbor {
  uuid: string; name: string | null; address: string | null; latitude: number | null; longitude: number | null;
  placeUuid: string | null; where: string | null; contact: string | null; notes: string | null;
  contacts: LinkedContact[];
}
/** Something happening locally. `nextOn` is the date that matters now (next year's, for a yearly event well past). */
export interface CommunityEvent { uuid: string; title: string; startsOn: string; endsOn: string | null; time: string | null; placeUuid: string | null; location: string | null; repeats: 'none' | 'yearly'; url: string | null; notes: string | null; nextOn: string; nextEndsOn: string | null }
export type NeighborInput = Omit<Neighbor, 'uuid' | 'contacts'> & { contacts: { contactId: string; name: string | null }[] };
export type EventInput = Omit<CommunityEvent, 'uuid' | 'nextOn' | 'nextEndsOn'>;
/** A headline from the person's own news pages that mentions one of their places or towns. */
export interface LocalNewsItem extends NewsItem { matched: string }
/** "Next time I'm at Missy's, remind me to ..." — set by approving Athena's remind_at_place card. */
export interface PlaceReminder { uuid: string; placeUuid: string | null; placeName: string; address: string | null; latitude: number; longitude: number; radiusM: number; reminder: string; repeats: boolean; status: 'armed' | 'done'; fireCount: number; lastFiredAt: string | null; doneAt: string | null; createdAt: string }

/** Calendar events that mention the community's towns and places, read wide (not from the 25-event summary). */
export interface CommunityCalendar { connected: boolean; terms: string[]; events: CalendarEvent[] }
export interface CommunityOverview { places: WatchPlace[]; neighbors: Neighbor[]; events: CommunityEvent[]; localNews: LocalNewsItem[] | null; kinds: PlaceKind[] }
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
  places?: AlertPlace[];
  weather?: WeatherAlert[];
  /** The banner key this person last said "Got it" to — held in the database. */
  acknowledgedKey?: string | null;
}
/** Month-to-date OpenAI spend (Costs API). OpenAI publishes no prepaid balance, so there is none here. */
export interface OpenAIBilling { configured: boolean; checkedAt: string; currency?: string; monthStart?: string; costThisMonth?: number; costToday?: number; costAllTime?: number; allTimeSince?: string; lineItems?: { name: string; cost: number }[]; daily?: { date: string; cost: number }[] }
/** Month-to-date GCP cost for the Athena project, read from the Cloud Billing export in BigQuery. `cost` is net of credits. */
export interface GcpBilling {
  configured: boolean; checkedAt: string; reason?: 'no_project' | 'no_dataset' | 'no_export'; project?: string | null; dataset?: string;
  invoiceMonth?: string; currency?: string; lastExportAt?: string | null; costThisMonth?: number; grossThisMonth?: number; creditsThisMonth?: number;
  /** Gemini (and any other model API) billed to the project, and everything else — both net of credits, this month. */
  llmThisMonth?: number; hostingThisMonth?: number;
  /** Everything the export holds for the project; it has no history before `dataSince`. */
  costAllTime?: number; dataSince?: string | null;
  /** The newest usage the export has reached. A fresh export backfills oldest-first, so this can trail the current month. */
  dataThrough?: string | null;
  services?: { name: string; cost: number; gross: number }[]; topSkus?: { service: string; name: string; cost: number; gross: number }[]; daily?: { date: string; cost: number }[];
}
export interface TwilioBilling { configured: boolean; checkedAt: string; balance?: { amount: string | null; currency: string | null }; smsMessagesSent?: number; smsCostThisMonth?: number; costAllTime?: number | null }
export type SystemHealthStatus = 'ok' | 'degraded' | 'down';
/** Athena's own health: each check says why when it isn't ok. */
/** Minutes saved by actions Athena carried out after an approval. UTC months. */
export interface TimeSaved {
  checkedAt: string; month: string; since: string | null;
  minutesThisMonth: number; minutesLastMonth: number; minutesAllTime: number; actionsThisMonth: number; actionsAllTime: number;
  byAction: { actionId: string; label: string; count: number; minutesEach: number; minutes: number }[];
  daily: { date: string; minutes: number }[];
  rates: { actionId: string; label: string; minutesEach: number }[];
}
export interface SystemHealth { status: SystemHealthStatus; checkedAt: string; checks: { id: string; label: string; status: SystemHealthStatus; detail: string }[] }
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
  id: string; kind: 'place' | 'project' | 'goal' | 'work' | 'rest'; title: string; why: string | null;
  activity?: string; url?: string; distanceMi?: number | null; driveMinutes?: number | null;
  closesAt?: string | null; closesInMinutes?: number | null; todaysHours?: string[];
  usableMinutes?: number | null; weatherDependent?: boolean;
  weather?: { outlook: 'wet' | 'fine'; now: string | null; temperatureF: number | null; precipitationChance: number | null } | null;
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
/** One night of Athena reorganizing her memories — see core_api services/dreams. */
export interface DreamStats {
  facts?: number; focus?: number; rounds?: number; steps_ok?: number; steps_failed?: number;
  purged?: number; guard_drops?: number; questions_asked?: number; questions_resolved?: number;
}
export interface Dream {
  uuid: string;
  date: string;
  status: 'running' | 'ok' | 'partial' | 'failed' | 'skipped';
  /** Her plain account of the night. */
  summary: string | null;
  /** The same night told as a dream. Null when no model could narrate it. */
  narrative: string | null;
  /** A picture painted from the narrative; fetch with dreamsApi.image(uuid). */
  hasImage?: boolean;
  stats: DreamStats;
  startedAt: string;
  finishedAt: string | null;
}
export interface DreamStep {
  seq: number; round: number; kind: string;
  /** Redacted server-side: string literals are '…', upserts are a row count. */
  statement: string | null;
  why: string | null; ok: boolean; error: string | null;
  affectedRows: number | null; ms: number | null;
}
export interface DreamQuestion {
  uuid: string; question: string; status: 'pending' | 'answered' | 'dismissed' | 'expired';
  answer: string | null; askedAt: string; answeredAt: string | null;
}
export const dreamsApi = {
  latest: () => api.get<{ dream: Dream | null }>('/api/v1/dreams/latest'),
  list: () => api.get<{ dreams: Dream[] }>('/api/v1/dreams'),
  night: (uuid: string) => api.get<{ dream: (Dream & { steps: DreamStep[] }) | null }>(`/api/v1/dreams/${encodeURIComponent(uuid)}`),
  questions: () => api.get<{ questions: DreamQuestion[] }>('/api/v1/dreams/questions'),
  dismissQuestion: (uuid: string) => api.post<{ dismissed: boolean }>(`/api/v1/dreams/questions/${encodeURIComponent(uuid)}/dismiss`, {}),
  image: (uuid: string) => api.blob(`/api/v1/dreams/${encodeURIComponent(uuid)}/image`),
};
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
  /** "Got it": remembered server-side until a new development changes the key. */
  ackAlert: (key: string) => api.post<{ acknowledgedKey: string }>('/api/v1/dashboard/alert/ack', { key }),
  watchPlaces: () => api.get<{ places: WatchPlace[] }>('/api/v1/dashboard/incidents/places'),
  /** A made-up PulsePoint call / weather warning at their own place, pushed. Writes nothing. */
  testAlert: (kind: 'pulsepoint' | 'weather') => api.post<AlertTestResult>('/api/v1/dashboard/incidents/test', { kind }),
  /** Add, or update by name (radius, on/off, a corrected position). */
  saveWatchPlace: (place: { name: string; latitude: number; longitude: number; radiusMiles?: number; address?: string | null; enabled?: boolean; kind?: PlaceKind; notes?: string | null }) =>
    api.put<{ places: WatchPlace[] }>('/api/v1/dashboard/incidents/places', place),
  removeWatchPlace: (uuid: string) => api.del<{ places: WatchPlace[] }>(`/api/v1/dashboard/incidents/places/${encodeURIComponent(uuid)}`),
  /** The Community page: points of interest, neighbours, events and local headlines. */
  community: () => api.get<CommunityOverview>('/api/v1/dashboard/community'),
  communityCalendar: () => api.get<CommunityCalendar>('/api/v1/dashboard/community/calendar'),
  saveNeighbor: (input: NeighborInput, uuid?: string) => uuid
    ? api.patch<{ neighbors: Neighbor[] }>(`/api/v1/dashboard/community/neighbors/${encodeURIComponent(uuid)}`, input)
    : api.post<{ neighbors: Neighbor[] }>('/api/v1/dashboard/community/neighbors', input),
  /** Search the person's own Google Contacts. `linked: false` means Contacts isn't connected. */
  searchContacts: (q: string) => api.get<{ linked: boolean; matches: ContactCard[] }>(`/api/v1/dashboard/community/contacts?q=${encodeURIComponent(q)}`),
  /** Google contacts whose address is this street line — suggestions for a household. */
  contactsAt: (address: string) => api.get<{ linked: boolean; matches: ContactCard[] }>(`/api/v1/dashboard/community/contacts/at?address=${encodeURIComponent(address)}`),
  removeNeighbor: (uuid: string) => api.del<{ neighbors: Neighbor[] }>(`/api/v1/dashboard/community/neighbors/${encodeURIComponent(uuid)}`),
  saveEvent: (input: EventInput, uuid?: string) => uuid
    ? api.patch<{ events: CommunityEvent[] }>(`/api/v1/dashboard/community/events/${encodeURIComponent(uuid)}`, input)
    : api.post<{ events: CommunityEvent[] }>('/api/v1/dashboard/community/events', input),
  /** Place reminders: armed ones, then the last fortnight's finished ones. Setting one is an action, not here. */
  placeReminders: () => api.get<{ reminders: PlaceReminder[] }>('/api/v1/place-reminders'),
  removePlaceReminder: (uuid: string) => api.del<{ reminders: PlaceReminder[] }>(`/api/v1/place-reminders/${encodeURIComponent(uuid)}`),
  removeEvent: (uuid: string) => api.del<{ events: CommunityEvent[] }>(`/api/v1/dashboard/community/events/${encodeURIComponent(uuid)}`),
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
  systemOpenAI: () => api.get<OpenAIBilling>('/api/v1/system/openai-billing'),
  systemGcp: () => api.get<GcpBilling>('/api/v1/system/gcp-billing'),
  systemHealth: () => api.get<SystemHealth>('/api/v1/system/health'),
  systemTimeSaved: () => api.get<TimeSaved>('/api/v1/system/time-saved'),
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
  /** Proposes archiving these emails out of the inbox (still in All Mail and search). Still needs approval. */
  /** Proposes adding the events from several dated travel/school emails (and filing them). Still needs approval. */
  mailEvents: (emailTriageUuids: string[]) =>
    api.post<{ success: true; action: AthenaAction }>('/api/v1/dashboard/email/events', { email_triage_uuids: emailTriageUuids }),
  /** Proposes one-click unsubscribing from senders (one email uuid per sender). Can't be undone; still needs approval. */
  mailUnsubscribe: (emailTriageUuids: string[]) =>
    api.post<{ success: true; action: AthenaAction }>('/api/v1/dashboard/email/unsubscribe', { email_triage_uuids: emailTriageUuids }),
  /** A suggested reply as editable text — writes nothing anywhere. */
  mailSuggestReply: (uuid: string) =>
    api.post<{ success: true; body: string }>(`/api/v1/dashboard/email/${encodeURIComponent(uuid)}/reply/suggest`, {}),
  /** Proposes saving the (edited) reply to Gmail's Drafts — never sent. Still needs approval. */
  mailProposeDraft: (uuid: string, body: string) =>
    api.post<{ success: true; action: AthenaAction }>(`/api/v1/dashboard/email/${encodeURIComponent(uuid)}/reply/propose`, { body }),
  mailArchive: (emailTriageUuids: string[]) =>
    api.post<{ success: true; action: AthenaAction }>('/api/v1/dashboard/email/archive', { email_triage_uuids: emailTriageUuids }),
  mailDelete: (emailTriageUuids: string[]) =>
    api.post<{ success: true; action: AthenaAction }>('/api/v1/dashboard/email/delete', { email_triage_uuids: emailTriageUuids }),
  /** Report (or update) a family member's symptom. Athena picks this up in chat and, if initiative is on, may raise it herself. */
  /** Children's birthdays from the family profiles, and the Google Contacts linked to remembered people. */
  familyPeople: () => api.get<FamilyPeople>("/api/v1/dashboard/family/people"),
  linkFamilyContact: (factUuid: string, contact: { contactId: string; name: string }) =>
    api.put<FamilyPeople>(`/api/v1/dashboard/family/people/${encodeURIComponent(factUuid)}/contact`, contact),
  unlinkFamilyContact: (factUuid: string) =>
    api.del<FamilyPeople>(`/api/v1/dashboard/family/people/${encodeURIComponent(factUuid)}/contact`),
  /** Forgets a remembered person or pet (and their contact link). */
  removeFamilyPerson: (factUuid: string) =>
    api.del<FamilyPeople>(`/api/v1/dashboard/family/people/${encodeURIComponent(factUuid)}`),
  /** Folds one remembered person into another: details kept on the target, the duplicate forgotten. */
  mergeFamilyPeople: (fromUuid: string, intoUuid: string) =>
    api.post<FamilyPeople>(`/api/v1/dashboard/family/people/${encodeURIComponent(fromUuid)}/merge`, { intoUuid }),
  reportFamilyHealth: (payload: { personName: string; symptom: string; severity?: HealthSeverity; notes?: string }) =>
    api.post<{ status: FamilyHealthStatus }>('/api/v1/dashboard/health/family', payload),
  resolveFamilyHealth: (uuid: string) =>
    api.patch<{ status: FamilyHealthStatus }>(`/api/v1/dashboard/health/family/${encodeURIComponent(uuid)}/resolve`, {}),
};
