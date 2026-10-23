import { api } from './client';

/**
 * Bedroom temperature against WHOOP sleep (core_api services/sleepClimate.js).
 * Arithmetic over the person's own nights; the sentence is the server's.
 */
export interface SleepBand {
  fromF: number;
  toF: number;
  nights: number;
  avgRecovery: number | null;
  avgPerformance: number | null;
  avgHumidity: number | null;
}
export interface SleepClimate {
  status: 'not_linked' | 'no_device' | 'gathering' | 'flat' | 'ready';
  nights?: number;
  needed?: number;
  metric?: 'avgRecovery' | 'avgPerformance';
  bands?: SleepBand[];
  best?: SleepBand & { delta: number; othersAvg: number };
  confidence?: 'low' | 'moderate';
  device?: { name: string; title: string };
  sentence?: string;
}

export const sleepClimateApi = {
  get: () => api.get<SleepClimate>('/api/v1/dashboard/health/sleep-climate'),
};
