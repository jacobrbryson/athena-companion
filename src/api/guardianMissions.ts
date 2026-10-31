import { api } from './client';

/**
 * Companion → Guardians (core_api services/guardianMissions, migration 0103):
 * Athena's capabilities, the missions that test them, and the household's
 * controls. Every row carries `audience` so a kid view can filter later.
 */
export type Audience = 'parent_only' | 'kids_too';
export type Attention = 'green' | 'yellow' | 'red';
export type PauseMode = 'running' | 'quiet_until' | 'paused';
export type CapabilityStatus = 'untested' | 'working' | 'flaky' | 'broken';
export type StepStatus = 'pending' | 'waiting_parent' | 'waiting_kids' | 'ready' | 'in_progress' | 'done' | 'stuck' | 'declined';
export type MissionStatus = 'proposed' | 'approved' | 'running' | 'paused' | 'completed' | 'stopped' | 'declined' | 'archived';
export type SkillLevel = 'untested' | 'learning' | 'reliable';

export interface GmControl {
  mode: PauseMode;
  quietUntil: string | null;
  killSwitch: boolean;
  killSwitchAt: string | null;
  monthlyBudget: number | null;
  stopWord: string | null;
}

export interface GmStep {
  uuid: string;
  seq: number;
  instruction: string;
  place: string | null;
  proofRequired: 'none' | 'photo' | 'photo_set' | 'camera_check' | 'kid_confirm' | 'parent_confirm' | 'code';
  status: StepStatus;
  dueAt: string | null;
  sentAt: string | null;
  nudgeCount: number;
  assignee: { uuid: string; name: string; kind: string } | null;
  capability: string | null;
  resultNote: string | null;
  audience: Audience;
}

export interface GmMission {
  uuid: string;
  key: string;
  title: string;
  goal: string | null;
  rung: number;
  priority: 'normal' | 'high';
  status: MissionStatus;
  phase?: 'prep' | 'ready' | 'live' | 'debrief' | null;
  goAt?: string | null;
  /** What stands in the way of Go, once the mission is ready. */
  preflight?: string[];
  debrief?: { passed: number; total: number; results: { key: string; text: string; passed: boolean; detail: string }[] } | null;
  approval: 'unapproved' | 'approved' | 'revoked';
  source: 'athena' | 'seed' | 'legacy' | 'parent';
  adventure: string | null;
  notes: string | null;
  startedAt: string | null;
  endedAt: string | null;
  capabilities: { name: string; badge: string | null }[];
  steps: GmStep[];
  waitingOn: string[];
  audience: Audience;
}

export interface GmCapability {
  uuid: string;
  key: string;
  kind: 'system' | 'skill';
  name: string;
  description: string | null;
  channel: string | null;
  locality: 'local' | 'cloud' | 'hybrid' | null;
  permission: 'free' | 'parent_approval';
  missionOnly: boolean;
  houseControl: boolean;
  enabled: boolean;
  status: CapabilityStatus;
  athenaVia?: string | null;
  badge: string | null;
  hardware: string | null;
  lastTestedAt: string | null;
  stale: boolean;
  record: { total: number; passed: number; avgLatencyMs: number | null; stages: Record<string, { total: number; passed: number }>; text: string };
  audience: Audience;
}

export interface GmChannel { uuid: string; channel: string; trust: string; label: string; reachable: boolean | null }

export type GmAgreement = 'agreed' | 'needs_agreement' | 'needs_new_agreement' | 'withdrawn' | 'unknown';

export interface GmRecipient { uuid: string; name: string; kind: 'parent' | 'kid' | 'guest'; muted: boolean; mutedUntil: string | null; channels?: GmChannel[]; agreement?: GmAgreement }

export interface GmConsentPerson {
  uuid: string;
  name: string;
  kind: 'parent' | 'kid';
  status: GmAgreement;
  needsYou: boolean;
  mayLeave: boolean;
  terms: { id: number; version: number; title: string; body: string } | null;
}

export interface GmGuardian {
  uuid: string;
  name: string;
  muted: boolean;
  mutedUntil: string | null;
  badges: { capabilityUuid: string; name: string; badge: string | null; level: SkillLevel; source: string; retest: boolean }[];
  progress: { reliable: number; learning: number };
  abilities?: { key: string; name: string; reliable: number; learning: number; total: number }[];
}

/**
 * The Guardians app's team on this family's adventure (core_api
 * services/guardianMissions/team.js). Levels, roles and percentages are
 * arithmetic over what was recorded; `detail` says what a percent counts, and
 * null means there is nothing to count yet.
 */
export interface GmTeamActivity { kind: 'find' | 'key' | 'report'; at: string; who: string; text: string }
export interface GmTeamMember { name: string; ours: boolean; checkedIn: boolean; finds: number; trailKeys: number; contributions: number; missionsStarted: number; badges: number; recent: GmTeamActivity[]; level: number; role: string; levelProgress: number }
export interface GmTeamSkill { key: string; name: string; percent: number | null; done: number; total: number; detail: string }
export interface GmTeam { roster: GmTeamMember[]; skills: GmTeamSkill[]; clues: { mission: string | null; found: number; total: number; foundRefs: string[] }; activity: GmTeamActivity[] }

export interface GmClue { uuid: string; seq: number; ref?: string | null; title: string; act: number | null; kind: string | null; status: 'unplaced' | 'hidden' | 'found'; mission: string | null }
export interface GmLocation { uuid: string; name: string; lat: number | null; lng: number | null; description: string | null; hiding_potential: string | null; difficulty: number | null; last_verified_at: string | null; created_at: string }
export interface GmLogEntry { verb: string; outcome: 'ok' | 'refused' | 'failed' | 'held'; detail: Record<string, unknown> | null; at: string; who: string | null; mission: string | null }

export interface GmAbility {
  key: string;
  name: string;
  description: string;
  percent: number;
  rung: number;
  reach: string | null;
  next: { name: string; proven: number; total: number; peopleOnly: boolean } | null;
  capabilities: { key: string; name: string; badge: string | null; proven: boolean }[];
}

export interface GmDraft {
  uuid: string;
  title: string;
  goal: string | null;
  reason: string | null;
  purpose: 'test' | 'add' | null;
  version: number;
  steps: { key: string; phase: 'prep' | 'live'; actor: string; instruction: string; dueMinutes: number; predictMinutes?: number | null }[];
  safety: { where: string; supervision: string; offLimits: string } | null;
  passCriteria: { key: string; text: string }[];
  readiness: { label: 'ready' | 'needs_testing' | 'needs_building' | 'blocked'; reasons: string[] };
  template?: { name: string } | null;
}

export interface GmZone { uuid: string; name: string; offLimits: string; daylightOnly: boolean; maxMinutes: number; mapped: boolean; radiusM: number | null }
export interface GmTemplate { uuid: string; name: string; capabilities: string[]; people: string[]; zones: string[]; maxMinutes: number }
export interface GmHandoff { enabled: boolean; canCreate: boolean; zones: GmZone[]; templates: GmTemplate[] }

export interface GmWish { uuid: string; name: string; why: string; cost: string | null; status: string }

export interface GmPlanning {
  evaluation: {
    weakest: { key: string; name: string; percent: number; unproven: string[] }[];
    weaknesses: { id: number; capability: string | null; summary: string }[];
  };
  drafts: GmDraft[];
  wishes: GmWish[];
  maxDrafts: number;
}

export interface GuardiansOverview {
  control: GmControl;
  attention: Attention;
  active: GmMission[];
  proposed: GmMission[];
  history: GmMission[];
  capabilities: GmCapability[];
  skills: GmCapability[];
  /** Absent until core_api is deployed; null when they can't be worked out. */
  abilities?: GmAbility[] | null;
  recipients: GmRecipient[];
  guardians: GmGuardian[];
  /** Absent until core_api is deployed; null when the team tables can't be read. */
  team?: GmTeam | null;
  clues: GmClue[];
  locations: GmLocation[];
  log: GmLogEntry[];
}

const BASE = '/api/v1/guardian-missions';

export interface GmCamera { serial: string; name: string; model: string; control: { ptz: boolean; presets: boolean; talkback: boolean }; freshSnapshot: boolean }

/** Capabilities with a parent "Test" button; the rest are tested by missions. */
export const TESTABLE = new Set(['porch_light', 'morse_out_light', 'pan_tilt_camera', 'speak_through_camera', 'view_cameras', 'doorbell_camera']);
export const NEEDS_CAMERA = new Set(['pan_tilt_camera', 'speak_through_camera', 'view_cameras', 'doorbell_camera']);

export const guardianMissionsApi = {
  overview: () => api.get<GuardiansOverview>(BASE),
  consent: () => api.get<{ people: GmConsentPerson[] }>(`${BASE}/consent`),
  agree: (uuid: string, termsId: number, method: 'app_prompt' | 'settings') => api.post<{ people: GmConsentPerson[] }>(`${BASE}/consent/${uuid}/agree`, { termsId, method }),
  withdraw: (uuid: string) => api.post<{ people: GmConsentPerson[] }>(`${BASE}/consent/${uuid}/withdraw`, {}),
  cameras: () => api.get<{ state: string; cameras: GmCamera[] }>(`${BASE}/cameras`),
  test: (uuid: string, serial?: string) => api.post<{ overview: GuardiansOverview; result: { ok: boolean; error: string | null; latencyMs: number | null } }>(`${BASE}/capabilities/${uuid}/test`, { serial }),
  setControl: (body: { mode?: PauseMode; quietUntil?: string; killSwitch?: boolean; monthlyBudget?: number | null; stopWord?: string }) => api.put<GuardiansOverview>(`${BASE}/control`, body),
  setCapability: (uuid: string, enabled: boolean) => api.patch<GuardiansOverview>(`${BASE}/capabilities/${uuid}`, { enabled }),
  setRecipient: (uuid: string, muted: boolean, mutedUntil?: string | null) => api.patch<GuardiansOverview>(`${BASE}/recipients/${uuid}`, { muted, mutedUntil: mutedUntil || null }),
  setSkill: (guardianUuid: string, capability: string, level: SkillLevel) => api.put<GuardiansOverview>(`${BASE}/guardians/${guardianUuid}/skills`, { capability, level }),
  approve: (uuid: string) => api.post<GuardiansOverview>(`${BASE}/missions/${uuid}/approve`, {}),
  setCode: (stepUuid: string, code: string) => api.post<GuardiansOverview>(`${BASE}/steps/${stepUuid}/secret`, { code }),
  finish: (uuid: string) => api.post<GuardiansOverview>(`${BASE}/missions/${uuid}/finish`, {}),
  planning: () => api.get<GmPlanning>(`${BASE}/planning`),
  startTemplated: (uuid: string) => api.post<GmPlanning>(`${BASE}/planning/${uuid}/start`, {}),
  handoff: () => api.get<GmHandoff>(`${BASE}/handoff`),
  addZone: (body: { name: string; offLimits: string; lat?: number; lng?: number; radiusM?: number; maxMinutes: number }) => api.post<GmHandoff>(`${BASE}/zones`, body),
  retireZone: (uuid: string) => api.post<GmHandoff>(`${BASE}/zones/${uuid}/retire`, {}),
  addTemplate: (body: { name: string; capabilities: string[]; people: string[]; zones: string[]; maxMinutes: number }) => api.post<GmHandoff>(`${BASE}/templates`, body),
  retireTemplate: (uuid: string) => api.post<GmHandoff>(`${BASE}/templates/${uuid}/retire`, {}),
  draft: (note?: string) => api.post<{ saved: string[]; dropped: { title: string; problems: string[] }[]; skipped?: string; workspace: GmPlanning }>(`${BASE}/planning/draft`, { note }),
  revise: (uuid: string, note: string) => api.post<GmPlanning>(`${BASE}/planning/${uuid}/revise`, { note }),
  decideWish: (uuid: string, status: 'built' | 'declined') => api.post<GmPlanning>(`${BASE}/wishes/${uuid}`, { status }),
  go: (uuid: string, supervisor: string) => api.post<GuardiansOverview>(`${BASE}/missions/${uuid}/go`, { supervisor }),
  decline: (uuid: string) => api.post<GuardiansOverview>(`${BASE}/missions/${uuid}/decline`, {}),
  stop: (uuid: string) => api.post<GuardiansOverview>(`${BASE}/missions/${uuid}/stop`, {}),
  pause: (uuid: string, paused: boolean) => api.post<GuardiansOverview>(`${BASE}/missions/${uuid}/pause`, { paused }),
  stopEverything: () => api.post<GuardiansOverview>(`${BASE}/stop-everything`, {}),
  scout: (body: { place?: string; dueAt?: string }) => api.post<{ overview: GuardiansOverview; send: { verdict: string; reason: string | null } }>(`${BASE}/scout`, body),
  sendStep: (uuid: string) => api.post<{ overview: GuardiansOverview; decision: { verdict: string; reason: string | null } }>(`${BASE}/steps/${uuid}/send`, {}),
  verify: (uuid: string, matches: boolean, note?: string) => api.post<GuardiansOverview>(`${BASE}/steps/${uuid}/verify`, { matches, note }),
  reply: (uuid: string, reply: 'done' | 'cant_now' | 'pause' | 'stop' | 'text', text?: string) => api.post<{ step: { uuid: string; status: StepStatus } }>(`${BASE}/steps/${uuid}/reply`, { reply, text, via: 'app' }),
};
