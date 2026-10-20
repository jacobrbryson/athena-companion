import { api } from './client';

export type SecurityDevice = {
  serial: string; name: string; model: string | null; bound: boolean; stationSerial: string | null; lastSeenAt: string | null;
  capabilities: string[]; batteryPercent: number | null; charging: boolean | null;
  freshSnapshotAvailable: boolean; storedThumbnailAvailable: boolean; clipAvailable?: boolean;
};
export type SecurityEvent = { id: string; kind: 'motion' | 'doorbell' | 'person'; deviceSn: string; at: string };
export type SecurityStatus = {
  status: 'ready' | 'connecting' | 'reconnecting' | 'authorization_required' | 'not_connected' | 'unavailable';
  updatedAt: string | null; devices: SecurityDevice[]; events: SecurityEvent[];
};
/** An image or clip kept in the household's private security bucket. */
export type SecurityMedia = {
  id: string; deviceSerial: string; deviceName: string | null; type: 'image' | 'clip'; contentType: string;
  bytes: number; durationSeconds: number | null; important: boolean; capturedBy: number; capturedAt: string;
};
export type SubjectKind = 'person' | 'animal' | 'vehicle';
/** Someone or something the cameras can recognise by name. */
export type SightingSubject = {
  id: string; name: string; kind: SubjectKind; description: string | null; photos: string[];
  lastSeen: { at: string; camera: string | null; where: string | null } | null;
};
export type Sighting = {
  id: string; label: string; kind: SubjectKind; subjectId: string | null; camera: string | null; deviceSerial: string;
  zone: string | null; where: string | null; confidence: number | null; eventKind: 'motion' | 'doorbell' | 'person'; seenAt: string; hasFrame: boolean;
};
export type CameraZone = { deviceSerial: string; name: string; description: string | null };
export type SightingRule = { id: string; subjectId: string | null; subjectName: string | null; label: string | null; deviceSerial: string | null; zone: string | null; enabled: boolean };
/** What "This is…" did: the name it took, and whether the frame became a reference photo. */
export type TeachResult = { subjectId: string; name: string; created: boolean; photoAdded: boolean; photoNote: string | null; renamed: number };
export type TeachBody = { subjectId?: string; newSubject?: { name: string; description?: string }; alsoIds?: string[] };
export type SightingsOverview = { subjects: SightingSubject[]; zones: CameraZone[]; rules: SightingRule[]; sightings: Sighting[]; retentionDays: number };
const base = '/api/v1/projects/property/security';
export const propertySecurityApi = {
  status: () => api.get<SecurityStatus>(base),
  snapshot: (serial: string, kind: 'fresh' | 'stored') => api.blob(`${base}/devices/${encodeURIComponent(serial)}/snapshot?kind=${kind}`),
  recordClip: (serial: string, seconds = 15) => api.post<{ media: SecurityMedia }>(`${base}/devices/${encodeURIComponent(serial)}/clip`, { seconds }),
  media: () => api.get<{ media: SecurityMedia[] }>(`${base}/media`),
  mediaBlob: (id: string) => api.blob(`${base}/media/${encodeURIComponent(id)}`),
  setImportant: (id: string, important: boolean) => api.patch<{ media: SecurityMedia }>(`${base}/media/${encodeURIComponent(id)}`, { important }),
  removeMedia: (id: string) => api.del<void>(`${base}/media/${encodeURIComponent(id)}`),
  sightings: () => api.get<SightingsOverview>(`${base}/sightings`),
  sightingFrame: (id: string) => api.blob(`${base}/sightings/${encodeURIComponent(id)}/frame`),
  teachSighting: (id: string, body: TeachBody) => api.post<TeachResult>(`${base}/sightings/${encodeURIComponent(id)}/teach`, body),
  createSubject: (body: { name: string; kind: SubjectKind; description?: string }) => api.post<{ id: string }>(`${base}/subjects`, body),
  updateSubject: (id: string, body: { name?: string; kind?: SubjectKind; description?: string }) => api.patch<void>(`${base}/subjects/${encodeURIComponent(id)}`, body),
  removeSubject: (id: string) => api.del<void>(`${base}/subjects/${encodeURIComponent(id)}`),
  addSubjectPhoto: (id: string, mediaId: string) => api.post<void>(`${base}/subjects/${encodeURIComponent(id)}/photos`, { mediaId }),
  removeSubjectPhoto: (id: string, mediaId: string) => api.del<void>(`${base}/subjects/${encodeURIComponent(id)}/photos/${encodeURIComponent(mediaId)}`),
  setZones: (serial: string, zones: { name: string; description?: string }[]) => api.put<void>(`${base}/zones/${encodeURIComponent(serial)}`, { zones }),
  createRule: (body: { subjectId?: string; label?: 'stranger'; deviceSerial?: string; zone?: string }) => api.post<{ id: string }>(`${base}/rules`, body),
  removeRule: (id: string) => api.del<void>(`${base}/rules/${encodeURIComponent(id)}`),
};
