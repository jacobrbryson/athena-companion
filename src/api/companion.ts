import { api } from './client';

// ---------------------------------------------------------------- memory ---

export type MemoryItemType = 'fact' | 'event' | 'transcript';

export interface RecallItem {
  type: MemoryItemType;
  uuid: string;
  label: string;
  title: string | null;
  text: string;
  when: string | null;
  mediaRef?: string | null;
  score: number;
}

export interface RecallResult {
  intent: boolean;
  semantic: boolean;
  timeRange: { label: string } | null;
  items: RecallItem[];
  disabled?: boolean;
}

export interface MemoryEvent {
  uuid: string;
  kind: string;
  scope: string;
  title: string | null;
  content: string;
  occurred_at: string;
  importance: number;
  source: string;
  media_ref: string | null;
  metadata: Record<string, unknown> | null;
}

export interface Fact {
  uuid: string;
  category: string;
  key: string;
  value: string | null;
  source: string;
  updated_at: string;
}

export const memoryApi = {
  recall: (q: string, tz?: string) =>
    api.get<RecallResult>(
      `/api/v1/memory/recall?q=${encodeURIComponent(q)}${tz ? `&tz=${encodeURIComponent(tz)}` : ''}`
    ),
  events: (kind?: string) =>
    api.get<MemoryEvent[]>(`/api/v1/memory/events?limit=60${kind ? `&kind=${kind}` : ''}`),
  facts: () => api.get<Fact[]>('/api/v1/memory'),
  journal: () => api.text('/api/v1/memory/journal'),
  remember: (title: string, content: string) =>
    api.post<{ event: MemoryEvent }>('/api/v1/memory/events', { title, content }),
  deleteEvent: (uuid: string) => api.del(`/api/v1/memory/events/${uuid}`),
  deleteFact: (uuid: string) => api.del(`/api/v1/memory/${uuid}`),
  rememberPhoto: (body: {
    imageBase64: string;
    mimeType: string;
    caption?: string;
    mediaRef: string;
    takenAt?: string;
  }) => api.post<{ event: MemoryEvent }>('/api/v1/memory/photos', body),
};

// ----------------------------------------------------------------- brain ---

export interface EndpointHealth {
  available: boolean;
  circuit: 'open' | 'closed';
  latencyMs: number | null;
  errorRate: number;
  calls: number;
}

export interface EndpointStatus {
  id: string;
  tier: 'orcwood' | 'frontier';
  models: Record<string, string | null>;
  reportedModels: string[] | null;
  health: EndpointHealth;
}

export interface ServingTier {
  endpointId: string;
  tier: string;
  model: string;
}

export interface LlmStatus {
  automaticManagement?: {
    mode: string;
    windowMs: number;
    minimumSamples: number;
    slowResponseMs: number;
    tasks: Record<string, { endpointId: string; model: string; samples: number; failures: number; latencyMs: number | null; reason: string; penalty: number }[]>;
  };
  policy: string;
  childPolicy: string;
  embeddingSpace: string;
  serving: Record<string, ServingTier | null>;
  orcwood: EndpointStatus[];
  frontier: EndpointStatus[];
  recentCalls: { at: number; task: string; endpointId: string; tier: string; outcome: string; latencyMs: number }[];
}

export interface DeviceModel {
  id: string;
  runtime: string;
  platforms: string[];
  tasks: string[];
  enabled: boolean;
  notes?: string;
}

export const brainApi = {
  status: () => api.get<LlmStatus>('/api/v1/llm/status'),
  manifest: () => api.get<{ version: string; models: DeviceModel[] }>('/api/v1/llm/manifest'),
};

// --------------------------------------------------------------- devices ---

export interface PairedDevice {
  uuid: string;
  name: string;
  platform: string;
  capabilities: Record<string, unknown> | null;
  last_seen_at: string | null;
  created_at: string;
}

export const devicesApi = {
  list: () => api.get<PairedDevice[]>('/api/v1/devices'),
  pairingCode: (name: string, platform: string) =>
    api.post<{ code: string; device_uuid: string; expires_in: number }>('/api/v1/devices/pairing-code', {
      name,
      platform,
    }),
  revoke: (uuid: string) => api.del(`/api/v1/devices/${uuid}`),
};

// ---------------------------------------------------- integrations (OAuth) ---

/** The stored link, as the server exposes it — never any token material. */
export interface IntegrationLink {
  uuid: string;
  provider: string;
  kind: string;
  external_account_id: string | null;
  display_name: string | null;
  scopes: string[];
  expires_at: string | null;
  status: 'active' | 'needs_reauth' | 'revoked';
  expired: boolean;
  last_refreshed_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface IntegrationProvider {
  provider: string;
  label: string;
  scopes: string[];
  /** A family consent that must exist before this one can be linked. */
  requires_consent: string | null;
  connected: boolean;
  link: IntegrationLink | null;
}

export const integrationsApi = {
  list: () =>
    api.get<{ providers: IntegrationProvider[] }>('/api/v1/integrations').then((r) => r.providers),
  /**
   * Start an authorization. Returns the URL to navigate to rather than
   * redirecting: this is an XHR, so a 302 would be followed by fetch and the
   * consent screen would never reach the address bar.
   */
  connect: (provider: string, redirectTo: string) =>
    api.post<{ provider: string; authorize_url: string; expires_in: number }>(
      `/api/v1/integrations/${provider}/connect`,
      { redirect_to: redirectTo }
    ),
  disconnect: (provider: string) =>
    api.del<{ provider: string; revoked: boolean; revoked_upstream: boolean }>(
      `/api/v1/integrations/${provider}`
    ),
};

export interface ConsentStatus {
  consents: Record<string, { accepted: boolean; document_version: string; accepted_at: string }>;
  all_required_accepted: boolean;
}

export const consentApi = {
  status: () => api.get<ConsentStatus>('/api/v1/consent/status'),
  accept: (consentType: string, documentVersion = '1.0') =>
    api.post<ConsentStatus>('/api/v1/consent', {
      consent_type: consentType,
      document_version: documentVersion,
    }),
};

// ----------------------------------------------------------------- actions ---

/**
 * Something Athena proposed DOING rather than saying. She cannot execute any
 * of these: the backend turns a validated field in her reply into a pending
 * proposal, and this is the surface where a person approves or declines it.
 * See core_api/src/services/actions.
 */
export interface AthenaAction {
  uuid: string;
  action_id: string;
  label: string;
  /** The plain-language sentence the person is approving. Server-authored. */
  summary: string;
  /** Athena's own one-line reason. Model text — display only. */
  rationale: string | null;
  params: Record<string, unknown> | null;
  status: 'pending' | 'executing' | 'done' | 'failed' | 'declined' | 'expired';
  approval: 'human' | 'standing' | null;
  reversible: boolean;
  result_ref: string | null;
  error: string | null;
  created_at: string;
  expires_at: string;
  executed_at: string | null;
}

/** Registry metadata. Lists actions the person has NOT enabled, so the panel can offer them. */
export interface ActionCatalogEntry {
  id: string;
  label: string;
  provider: string | null;
  consent_type: string | null;
  reversible: boolean;
  standing: boolean;
}

export interface ActionAuthority {
  action_id: string;
  label: string;
  expires_at: string | null;
  created_at: string;
}

export interface ActionStatus {
  catalog: ActionCatalogEntry[];
  /** Ids Athena can actually propose right now (linked + consented). */
  available: string[];
  authorities: ActionAuthority[];
  pending: AthenaAction[];
}

export const actionsApi = {
  status: () => api.get<ActionStatus>('/api/v1/actions'),
  pending: () => api.get<AthenaAction[]>('/api/v1/actions/pending'),
  history: (limit = 25) => api.get<AthenaAction[]>(`/api/v1/actions/history?limit=${limit}`),
  confirm: (uuid: string) =>
    api.post<{ success: true; action: AthenaAction }>(`/api/v1/actions/${uuid}/confirm`),
  decline: (uuid: string) =>
    api.post<{ success: true; action: AthenaAction }>(`/api/v1/actions/${uuid}/decline`),
  grantAuthority: (actionId: string) =>
    api.post<{ success: true; authorities: ActionAuthority[] }>(
      `/api/v1/actions/authority/${actionId}`
    ),
  revokeAuthority: (actionId: string) =>
    api.del<{ success: true; authorities: ActionAuthority[] }>(
      `/api/v1/actions/authority/${actionId}`
    ),
};

// -------------------------------------------------------------- initiative ---

/**
 * Something Athena said without being asked. See core_api/src/services/initiative.
 *
 * `text` is model-worded but the DECISION to say it was a deterministic rule —
 * the server keeps the observation that triggered it and does not send it here.
 */
export interface Nudge {
  uuid: string;
  trigger_id: string;
  label: string;
  urgency: 'low' | 'normal' | 'high';
  text: string;
  status: 'pending' | 'delivered' | 'engaged' | 'dismissed' | 'expired';
  created_at: string;
  expires_at: string;
}

export interface InitiativePref {
  enabled: boolean;
  /** Reaching a paired phone. Its own opt-in; cannot outlive `enabled`. */
  push_enabled: boolean;
  timezone: string | null;
  quiet_from: number;
  quiet_to: number;
  daily_cap: number;
}

/** Whether push can work on this server at all, and who is registered. */
export interface PushStatus {
  available: boolean;
  enabled: boolean;
  devices: { uuid: string; name: string }[];
}

/**
 * What Athena has learned about how one trigger lands for this person.
 * `suppressed` is her own decision to stop raising it — reversible only by
 * the person, from the panel.
 */
export interface TriggerScore {
  score: number;
  samples: number;
  suppressed: boolean;
  last_reason: string | null;
}

export interface TriggerCatalogEntry {
  id: string;
  label: string;
  describe: string;
  sources: string[];
  urgency: string;
}

export interface InitiativeStatus {
  pref: InitiativePref;
  push: PushStatus;
  scores: Record<string, TriggerScore>;
  catalog: TriggerCatalogEntry[];
  muted: string[];
  recent: Nudge[];
}

export const initiativeApi = {
  status: () => api.get<InitiativeStatus>('/api/v1/initiative'),
  // Fetching marks them delivered server-side — do not call it speculatively.
  pending: () => api.get<Nudge[]>('/api/v1/initiative/pending'),
  setPref: (patch: Partial<InitiativePref>) =>
    api.put<{ success: true; pref: InitiativePref }>('/api/v1/initiative/pref', patch),
  react: (uuid: string, reaction: 'engaged' | 'dismissed') =>
    api.post<{ success: true; uuid: string; status: string }>(
      `/api/v1/initiative/${uuid}/react`,
      { reaction }
    ),
  mute: (triggerId: string) =>
    api.post<{ success: true; muted: string[] }>(`/api/v1/initiative/mute/${triggerId}`),
  unmute: (triggerId: string) =>
    api.del<{ success: true; muted: string[] }>(`/api/v1/initiative/mute/${triggerId}`),
  /** Undo a suppression Athena applied to herself. */
  resume: (triggerId: string) =>
    api.post<{ success: true; trigger_id: string; score: TriggerScore }>(
      `/api/v1/initiative/resume/${triggerId}`
    ),
};
