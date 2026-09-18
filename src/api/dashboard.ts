import { api } from './client';

export type SourceStatus = 'ready' | 'not_connected' | 'needs_reauth' | 'consent_required' | 'error';
export interface Source<T> { status: SourceStatus; data: T | null; checkedAt: string }
export interface CalendarEvent { id: string | null; title: string; start: string; end: string; allDay: boolean; location: string | null; calendar: string | null; shared: boolean }
export interface JiraIssue { key: string; title: string; status: string; project: string; updated: string; due: string | null; site: string; url: string }
export interface DashboardSummary {
  calendar: Source<{ events: CalendarEvent[]; timeZone: string; days: number }>;
  recovery: Source<{ date: string; recovery_score: number | null; state: string }[]>;
  sleep: Source<{ date: string; nap: boolean; hours_asleep: number; sleep_performance_percent: number | null }[]>;
  strain: Source<{ date: string; day_strain: number | null }[]>;
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
export interface NewsItem { title: string; url: string | null; published: string | null; source: string }
export interface NewsResult { sources: string[]; feeds: { url: string; status: 'ready' | 'error'; items: NewsItem[] }[]; checkedAt: string }
export const dashboardApi = {
  summary: async () => {
    const value = await api.get<DashboardSummary>('/api/v1/dashboard');
    if (!value.calendar || !value.jira) throw new Error('Dashboard API needs updating.');
    return value;
  },
  news: async () => {
    const value = await api.get<NewsResult>('/api/v1/dashboard/news');
    if (!Array.isArray(value.feeds)) throw new Error('News API needs updating.');
    return value;
  },
  priority: async () => {
    const value = await api.get<DashboardPriority>('/api/v1/dashboard/priority');
    if (!Array.isArray(value?.order)) throw new Error('Priority API needs updating.');
    return value;
  },
  sources: () => api.get<{ sources: string[] }>('/api/v1/dashboard/news/sources'),
  saveSources: (sources: string[]) => api.put<{ sources: string[] }>('/api/v1/dashboard/news/sources', { sources }),
};
