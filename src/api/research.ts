import { api } from './client';
import type { SleepClimate } from './sleepClimate';

/**
 * Research studies (core_api services/research). Every study answers in one
 * shape; `detail` is the study's own numbers, typed per study below.
 */
export type StudyStatus = 'needs_source' | 'gathering' | 'inconclusive' | 'ready' | 'unavailable';

interface StudyBase {
  title: string;
  question: string;
  sources: string[];
  status: StudyStatus;
  progress: { have: number; needed: number; unit: string } | null;
  sentence: string;
  confidence?: 'low' | 'moderate' | null;
}

export interface SetpointBand { fromF: number; toF: number; days: number; avgHeatingHours: number | null }
export interface SetpointDetail {
  status: string;
  bands?: SetpointBand[];
  low?: SetpointBand;
  high?: SetpointBand;
  hoursSaved?: number;
  device?: { name: string; title: string };
}

export interface PaceProject { uuid: string; title: string; open: number; doneInWindow: number; idleDays: number | null; stalled: boolean; finishOn: string | null }
export interface PaceDetail {
  status: string;
  perWeek?: number;
  weekly?: { weekOf: string; steps: number }[];
  sessions?: { count: number; hours: number };
  projects?: PaceProject[];
}

export type Study =
  | (StudyBase & { id: 'sleep-climate'; detail: SleepClimate | null })
  | (StudyBase & { id: 'thermostat-setpoint'; detail: SetpointDetail | null })
  | (StudyBase & { id: 'project-pace'; detail: PaceDetail | null });

export const researchApi = {
  list: () => api.get<{ studies: Study[] }>('/api/v1/research'),
};
