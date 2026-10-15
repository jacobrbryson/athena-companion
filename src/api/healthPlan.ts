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
/** How an entry arrived: typed, estimated from a photo, a barcode lookup, a starred favorite. */
export type EntrySource = 'manual' | 'photo' | 'barcode' | 'favorite';
export interface NutritionEntry {
  uuid: string; eaten_on: string; label: string;
  calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; water_oz: number | null;
  source?: EntrySource; serving?: string | null; barcode?: string | null;
  /** The uuid of the favorite with this food's name — it's starred — else null. */
  favorite?: string | null;
  created_at: string;
}
export interface NutritionFavorite {
  uuid: string; label: string;
  calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; water_oz: number | null;
  serving: string | null; barcode: string | null;
}
export interface NutritionDay {
  date: string; entries: NutritionEntry[]; totals: NutritionTotals;
  /** Seven days ending today, oldest first. */
  days: { date: string; logged: boolean; totals: NutritionTotals }[];
  favorites?: NutritionFavorite[];
}
export interface ScanResult { entry: NutritionEntry; how: 'barcode' | 'photo'; note: string; nutrition: NutritionDay }
export interface HealthPlan { program: TrainingProgram | null; targets: NutritionTargets | null; nutrition: NutritionDay | null }
export interface ProgramDraft {
  name: string; goal?: string | null; starts_on: string; weeks: number;
  sessions: { weekday: number; kind: SessionKind; title: string; focus?: string | null; detail?: string | null; exercises?: string[] }[];
}
export type EntryDraft = Partial<Omit<NutritionEntry, 'uuid' | 'created_at' | 'favorite'>> & { label?: string; /** Also star it. */ favorite?: boolean };

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
  updateEntry: (uuid: string, entry: EntryDraft) => api.patch<{ nutrition: NutritionDay }>(`/api/v1/dashboard/health/nutrition/${encodeURIComponent(uuid)}`, { ...entry, today: localDay() }),
  /** Log from the camera: a barcode the phone read, the photo, or both (the photo is the fallback). */
  scan: (body: { imageBase64?: string; mimeType?: string; barcode?: string | null }) =>
    api.post<ScanResult>('/api/v1/dashboard/health/nutrition/scan', { ...body, eaten_on: localDay(), today: localDay() }),
  saveFavorite: (food: EntryDraft) => api.post<{ nutrition: NutritionDay }>('/api/v1/dashboard/health/favorites', { ...food, today: localDay() }),
  removeFavorite: (uuid: string) => api.del<{ nutrition: NutritionDay }>(`/api/v1/dashboard/health/favorites/${encodeURIComponent(uuid)}?today=${localDay()}`),
  logFavorite: (uuid: string) => api.post<{ nutrition: NutritionDay }>(`/api/v1/dashboard/health/favorites/${encodeURIComponent(uuid)}/log`, { eaten_on: localDay(), today: localDay() }),
};
