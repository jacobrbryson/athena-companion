import type { FamilyHealthStatus, Source } from '../api/dashboard';

/** Summarize reported watches, without inferring a diagnosis or severity from symptoms. */
export function familyHealthSummary(source: Source<{ active: FamilyHealthStatus[] }> | null | undefined): {
  label: 'Good' | 'Watch' | 'Warning' | 'Alert!' | 'Unknown';
  tone: 'good' | 'ok' | 'low' | 'alert' | 'idle';
  note: string;
} {
  if (source?.status !== 'ready' || !source.data) return { label: 'Unknown', tone: 'idle', note: 'Health reports unavailable' };
  const active = source.data.active.filter(w => w.status !== 'resolved');
  if (!active.length) return { label: 'Good', tone: 'good', note: 'No active health reports' };
  const severe = active.some(w => w.severity === 'severe');
  const moderate = active.some(w => w.severity === 'moderate');
  const due = active.filter(w => w.updateDue).length;
  const count = `${active.length} active health ${active.length === 1 ? 'watch' : 'watches'}`;
  return {
    label: severe ? 'Alert!' : moderate ? 'Warning' : 'Watch',
    tone: severe ? 'alert' : moderate ? 'low' : 'ok',
    note: `${count} · ${severe ? 'severe' : moderate ? 'moderate' : 'mild'} reported${due ? ` · ${due} ${due === 1 ? 'update' : 'updates'} due` : ''}`,
  };
}
