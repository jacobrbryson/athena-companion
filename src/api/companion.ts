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
