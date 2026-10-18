import { api } from './client';

export type SecurityDevice = {
  serial: string; name: string; model: string | null; bound: boolean; stationSerial: string | null; lastSeenAt: string | null;
  capabilities: string[]; batteryPercent: number | null; charging: boolean | null;
  freshSnapshotAvailable: boolean; storedThumbnailAvailable: boolean; clipAvailable?: boolean;
};
export type SecurityEvent = { id: string; kind: 'motion' | 'doorbell'; deviceSn: string; at: string };
export type SecurityStatus = {
  status: 'ready' | 'connecting' | 'reconnecting' | 'authorization_required' | 'not_connected' | 'unavailable';
  updatedAt: string | null; devices: SecurityDevice[]; events: SecurityEvent[];
};
/** An image or clip kept in the household's private security bucket. */
export type SecurityMedia = {
  id: string; deviceSerial: string; deviceName: string | null; type: 'image' | 'clip'; contentType: string;
  bytes: number; durationSeconds: number | null; important: boolean; capturedBy: number; capturedAt: string;
};
const base = '/api/v1/projects/property/security';
export const propertySecurityApi = {
  status: () => api.get<SecurityStatus>(base),
  snapshot: (serial: string, kind: 'fresh' | 'stored') => api.blob(`${base}/devices/${encodeURIComponent(serial)}/snapshot?kind=${kind}`),
  recordClip: (serial: string, seconds = 15) => api.post<{ media: SecurityMedia }>(`${base}/devices/${encodeURIComponent(serial)}/clip`, { seconds }),
  media: () => api.get<{ media: SecurityMedia[] }>(`${base}/media`),
  mediaBlob: (id: string) => api.blob(`${base}/media/${encodeURIComponent(id)}`),
  setImportant: (id: string, important: boolean) => api.patch<{ media: SecurityMedia }>(`${base}/media/${encodeURIComponent(id)}`, { important }),
  removeMedia: (id: string) => api.del<void>(`${base}/media/${encodeURIComponent(id)}`),
};
