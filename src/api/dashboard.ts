import { api } from './client';

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
  gmail: Source<{ account: string; messages: { id: string; title: string; from: string; date: string; url: string }[] }>;
}
/** One card, and Athena's one-line reason for putting it where she did. */
export interface PriorityEntry { id: string; why: string | null }
/** `source` is 'default' when no model ranked this — the UI stays quiet then. */
export interface DashboardPriority { order: PriorityEntry[]; source: 'athena' | 'default'; model?: string | null; generatedAt: string }
export interface TwilioUsageRecord { category: string; description: string; count: string | null; countUnit: string | null; price: string | null; priceUnit: string | null }
export interface TwilioBilling { configured: boolean; checkedAt: string; balance?: { amount: string | null; currency: string | null }; today?: TwilioUsageRecord[]; month?: TwilioUsageRecord[] }
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
  systemTwilio: () => api.get<TwilioBilling>('/api/v1/system/twilio-billing'),
  sources: () => api.get<{ sources: NewsSource[]; maxSources: number }>('/api/v1/dashboard/news/sources'),
  saveSources: (sources: (string | { url: string; label?: string | null; scope?: 'world' | 'personal' })[]) =>
    api.put<{ sources: NewsSource[] }>('/api/v1/dashboard/news/sources', { sources }),
  updateSource: (uuid: string, patch: { label?: string | null; scope?: 'world' | 'personal'; enabled?: boolean }) =>
    api.patch<{ source: NewsSource }>(`/api/v1/dashboard/news/sources/${encodeURIComponent(uuid)}`, patch),
  removeSource: (uuid: string) => api.del<{ success: true }>(`/api/v1/dashboard/news/sources/${encodeURIComponent(uuid)}`),
  /** "Look now", for the moment after someone adds a page. Rate limited server-side. */
  checkNews: () => api.post<{ checked: number; changed: number; failed: number; cooling: boolean }>('/api/v1/dashboard/news/check'),
};
