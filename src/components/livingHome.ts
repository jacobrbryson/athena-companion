import type { DashboardSummary, Dream, RecoveryDay } from '../api/dashboard';

export interface HomeUpdate {
  id: string;
  area: 'Health' | 'Work' | 'Dreams';
  title: string;
  detail: string;
  source: string;
  at: string;
}

/** Provider timestamps, never the time React happened to render a card. */
export function freshness(at: string | null | undefined, now: number): string {
  const time = Date.parse(at || '');
  if (!Number.isFinite(time) || time > now + 60_000) return 'Time unavailable';
  const minutes = Math.max(0, Math.floor((now - time) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

export function recoveryChange(rows: RecoveryDay[] = []) {
  const days = [...rows].filter(r => r.state === 'SCORED' && r.recovery_score != null && Number.isFinite(r.recovery_score))
    .sort((a, b) => b.date.localeCompare(a.date));
  const current = days[0];
  const previous = days.find(r => r.date < current?.date);
  if (!current || !previous) return null;
  return { current, previous, delta: Math.round((current.recovery_score! - previous.recovery_score!) * 10) / 10 };
}

/** A dated digest, not a visit history. Open-only Jira reads cannot establish completion. */
export function homeUpdates(summary: DashboardSummary | null, dreams: Dream[] | null, now: number): HomeUpdate[] {
  const result: HomeUpdate[] = [];
  if (summary?.recovery.status === 'ready') {
    const change = recoveryChange(summary.recovery.data ?? []);
    if (change) result.push({ id: `recovery-${change.current.date}-${change.current.recovery_score}`, area: 'Health',
      title: `Recovery ${change.delta > 0 ? '+' : ''}${change.delta} points`,
      detail: `${change.previous.recovery_score}% → ${change.current.recovery_score}% · compared with ${change.previous.date}`,
      source: 'WHOOP · reading', at: change.current.date });
  }
  if (summary?.jira.status === 'ready') {
    const latest = [...(summary.jira.data?.issues ?? [])]
      .filter(i => Number.isFinite(Date.parse(i.updated)) && Date.parse(i.updated) <= now)
      .sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated))[0];
    if (latest) result.push({ id: `jira-${latest.site}-${latest.key}-${latest.updated}`, area: 'Work',
      title: `${latest.key} · ${latest.status}`, detail: latest.title,
      source: 'Jira · updated', at: latest.updated });
  }
  const dream = [...(dreams ?? [])].filter(d => (d.status === 'ok' || d.status === 'partial') && d.finishedAt && Date.parse(d.finishedAt) <= now)
    .sort((a, b) => Date.parse(b.finishedAt!) - Date.parse(a.finishedAt!))[0];
  if (dream) result.push({ id: `dream-${dream.uuid}-${dream.finishedAt}`, area: 'Dreams',
    title: dream.status === 'partial' ? 'A dream, partly completed' : 'A dream is ready',
    detail: `Night of ${dream.date}`, source: 'Dream journal · finished', at: dream.finishedAt! });
  return result;
}

