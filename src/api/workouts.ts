import { api } from './client';

/** One recorded WHOOP workout (core_api athena_workout via /api/v1/workouts). */
export interface Workout {
  /** The local calendar day it started, where it happened. */
  date: string;
  start: string;
  timezone_offset: string | null;
  minutes: number;
  sport: string | null;
  strain: number | null;
  average_heart_rate: number | null;
  max_heart_rate: number | null;
  kilojoules: number | null;
  percent_recorded: number | null;
  distance_meter: number | null;
  /** Minutes per heart-rate zone: zone_zero … zone_five. */
  minutes_in_zone: Record<string, number> | null;
}

export const workoutsApi = {
  list: (days = 3650) => api.get<{ days: number; workouts: Workout[] }>(`/api/v1/workouts?days=${days}`),
};
