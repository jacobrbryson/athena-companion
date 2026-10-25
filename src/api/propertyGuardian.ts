import { api } from './client';

/** Property → Security → Guardian (core_api services/guardianEngine). */
export type GuardianSubject = { key: string; name: string; serial: string | null; region: string | null };
export type GuardianQuiet = { from: number; to: number };
export type GuardianConfig = {
  recipients: string[]; quiet: GuardianQuiet; escalateAfterMinutes: number; retries: number; retryDelaySeconds: number;
  minConfidence: number; maxEvidenceAgeSeconds: number; autonomy: Record<string, number>; simulation: boolean;
  // nightly_sweep
  schedule?: { time: string; timeZone: string }; overdueAfterMinutes?: number; garageDoors?: GuardianSubject[]; includeUmbrella?: boolean;
  reports?: { evening: boolean; morning: boolean; morningTime: string };
  // storm_umbrella
  umbrella?: GuardianSubject | null; placeUuid?: string | null; weather?: { gustMph: number; stormChance: number; lookaheadHours: number; urgentWithinHours: number };
};
export type GuardianPermission = { id: string; label: string; level: number; allowed: boolean; reasons: string[] };
export type GuardianProtocol = { id: 'nightly_sweep' | 'storm_umbrella'; label: string; describe: string; version: number; enabled: boolean; config: GuardianConfig; updatedBy: number | null; updatedAt: string | null; policy: GuardianPermission[] };
export type GuardianResult = { check: string; subject: string | null; status: string; reason: string | null; confidence?: number | null; incident?: string | null };
export type GuardianRun = { id: string; protocol: string; trigger: 'schedule' | 'weather' | 'recheck' | 'manual' | 'report'; state: string; scheduledFor: string; startedAt: string | null; finishedAt: string | null; attempts: number; simulated: boolean; results: GuardianResult[]; missed: boolean; reason: string | null; risk: { atRisk: boolean; known: boolean } | null;
  report: { kind: 'evening' | 'morning'; text: string; deliveries: { profileId: number; status: string }[] } | null };
export type GuardianNotification = { profileId: number; kind: 'alert' | 'update' | 'escalation' | 'resolved'; status: 'pending' | 'sent' | 'held' | 'failed' | 'simulated' | 'in_app' | 'superseded'; attempts: number; holdUntil: string | null; lastAttemptAt: string | null; skipped: string | null };
export type GuardianIncident = {
  id: string; protocol: string; check: 'garage_door' | 'patio_umbrella'; subject: string; subjectName: string; camera: string | null;
  state: 'open' | 'notified' | 'acknowledged' | 'resolved' | 'dismissed' | 'expired'; condition: string; severity: 'urgent' | 'advisory';
  confidence: number | null; reason: string | null; weather: { reasons: { text: string }[]; earliestAt: string | null } | null; trigger: string;
  firstDetectedAt: string; lastVerifiedAt: string; acknowledgedBy: number | null; acknowledgedAt: string | null; assignedTo: number | null;
  resolvedAt: string | null; resolution: string | null; dismissReason: string | null; rechecks: number; nextRecheckAt: string | null; escalatedAt: string | null;
  evidenceMediaId: string | null; observedAt: string | null; notifications: GuardianNotification[];
};
export type GuardianWeather = { atRisk: boolean; known: boolean; urgent: boolean; reasons: { kind: string; text: string }[]; earliestAt: string | null; checkedAt: string; sources: { forecast: string; alerts: string } };
export type GuardianOverview = {
  status: 'secure' | 'attention' | 'unverified' | 'waiting' | 'off'; bridge: string | null;
  protocols: GuardianProtocol[]; lastSweep: GuardianRun | null; nextSweepAt: string | null; nextMorningReportAt?: string | null; incidents: GuardianIncident[]; runs: GuardianRun[];
  events: { kind: string; actor: string; at: string; detail: Record<string, unknown> | null }[];
  weather: GuardianWeather | null;
  cameras: { serial: string; name: string; watched: boolean; lastSeenAt: string | null; batteryPercent: number | null; freshSnapshotAvailable: boolean }[];
  recipients: { id: number; name: string }[];
  health: { runs: number; safe: number; attention: number; unknown: number; failed: number; missed: number; notificationsFailed: number };
};
export type GuardianScenario = Partial<Record<'garage_door' | 'patio_umbrella', Record<string, string>>>;

const base = '/api/v1/projects/property/security/guardian';
export const propertyGuardianApi = {
  overview: () => api.get<GuardianOverview>(base),
  save: (id: string, body: { enabled?: boolean; config: GuardianConfig }) => api.put<GuardianOverview>(`${base}/protocols/${encodeURIComponent(id)}`, body),
  run: (id: string, body: { simulate?: boolean; scenario?: GuardianScenario } = {}) => api.post<{ run: string; state?: string; claimed: boolean }>(`${base}/protocols/${encodeURIComponent(id)}/run`, body),
  recheck: (id: string) => api.post<unknown>(`${base}/incidents/${encodeURIComponent(id)}/recheck`),
  acknowledge: (id: string) => api.post<void>(`${base}/incidents/${encodeURIComponent(id)}/acknowledge`),
  dismiss: (id: string, reason: string) => api.post<void>(`${base}/incidents/${encodeURIComponent(id)}/dismiss`, { reason }),
  assign: (id: string, profileId: number | null) => api.put<void>(`${base}/incidents/${encodeURIComponent(id)}/assignee`, { profileId: profileId === null ? null : String(profileId) }),
};
