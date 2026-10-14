import { api } from './client';

/**
 * The Health page's plan (core_api services/healthPlan.js): a training
 * program, nutrition targets and the food log — the things no connected
 * device can see, so the person sets them here.
 */

export type SessionKind = 'gym' | 'run' | 'ride' | 'sport' | 'recovery' | 'rest' | 'other';
/** `done` — ticked, or a WHOOP workout of the same kind started that day. */
export type SessionStatus = 'done' | 'skipped' | 'missed' | 'today' | 'planned';
export interface ProgramSession {
  uuid: string;
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
  kind: SessionKind; title: string; focus: string | null; detail: string | null; exercises: string[];
  date: string; status: SessionStatus;
  /** The person's own mark, as opposed to one inferred from WHOOP. */
  marked: boolean;
  recorded: { sport: string; minutes: number; strain: number | null } | null;
}
export interface TrainingProgram {
  uuid: string; name: string; goal: string | null; starts_on: string; weeks: number;
  week_number: number; ended: boolean; before_start: boolean; week_of: string;
  sessions: ProgramSession[];
}
export interface NutritionTargets {
  calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null;
  water_oz: number | null; sleep_hours: number | null;
  target_weight_low_kg: number | null; target_weight_high_kg: number | null;
}
export interface NutritionTotals { calories: number; protein_g: number; carbs_g: number; fat_g: number; water_oz: number }
export interface NutritionEntry {
  uuid: string; eaten_on: string; label: string;
  calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; water_oz: number | null;
  created_at: string;
}
export interface NutritionDay {
  date: string; entries: NutritionEntry[]; totals: NutritionTotals;
  /** Seven days ending today, oldest first. */
  days: { date: string; logged: boolean; totals: NutritionTotals }[];
}
export interface HealthPlan { program: TrainingProgram | null; targets: NutritionTargets | null; nutrition: NutritionDay | null }
export interface ProgramDraft {
  name: string; goal?: string | null; starts_on: string; weeks: number;
  sessions: { weekday: number; kind: SessionKind; title: string; focus?: string | null; detail?: string | null; exercises?: string[] }[];
}
export type EntryDraft = Partial<Omit<NutritionEntry, 'uuid' | 'created_at'>> & { label?: string };

/** The person's local date, YYYY-MM-DD — the server can't know their day. */
export const localDay = (d = new Date()) => d.toLocaleDateString('en-CA');

export const healthPlanApi = {
  overview: (today = localDay()) => api.get<HealthPlan>(`/api/v1/dashboard/health/plan?today=${today}`),
  saveProgram: (draft: ProgramDraft) => api.put<{ program: TrainingProgram }>('/api/v1/dashboard/health/program', { ...draft, today: localDay() }),
  endProgram: () => api.del<{ ended: boolean }>('/api/v1/dashboard/health/program'),
  mark: (uuid: string, date: string, status: 'done' | 'skipped' | null) =>
    api.put<{ program: TrainingProgram }>(`/api/v1/dashboard/health/program/sessions/${encodeURIComponent(uuid)}/mark`, { date, status, today: localDay() }),
  saveTargets: (targets: Partial<NutritionTargets>) => api.put<{ targets: NutritionTargets }>('/api/v1/dashboard/health/targets', targets),
  addEntry: (entry: EntryDraft) => api.post<{ nutrition: NutritionDay }>('/api/v1/dashboard/health/nutrition', { eaten_on: localDay(), ...entry, today: localDay() }),
  removeEntry: (uuid: string) => api.del<{ nutrition: NutritionDay }>(`/api/v1/dashboard/health/nutrition/${encodeURIComponent(uuid)}?today=${localDay()}`),
};
