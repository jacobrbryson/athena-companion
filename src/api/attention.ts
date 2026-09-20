import { api } from './client';

export interface ActivityReview {
  uuid: string;
  resource_id: string;
  reviewed_at: string;
  stale: boolean;
  observation: { label: string | null; state: string; start?: string; end?: string };
  interpretation: { status: string; label: string | null; reason: string; alternatives: string[] } | null;
  feedback: { kind: string; label: string; note: string } | null;
  evidence: { id: string; kind: string; value: unknown }[];
}
export interface ActivityReviewStatus {
  enabled: boolean;
  blocked_by: string | null;
  last_error: string | null;
  last_sync_at?: string | null;
  next_sync_at?: string | null;
  queue: Record<string, number>;
  reviews: ActivityReview[];
}
const path = '/api/v1/attention/whoop';
export const attentionApi = {
  status: () => api.get<ActivityReviewStatus>(path),
  enable: (enabled: boolean) => api.put<ActivityReviewStatus>(path, { enabled }),
  recheck: () => api.post(path + '/recheck', {}),
  feedback: (uuid: string, kind: 'confirm' | 'correct', label: string, note = '') =>
    api.post(`${path}/reviews/${encodeURIComponent(uuid)}/feedback`, { kind, label, note }),
  forget: () => api.del(path),
};
