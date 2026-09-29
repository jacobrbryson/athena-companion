import { androidCall } from './android';

export type Sport = 'ride' | 'run';
export interface Bounds {
  above?: number;
  below?: number;
}
export type Limits = Partial<Record<Sport, Bounds>>;

/** What the phone's heart-rate reader is doing (HeartRateService.status). */
export interface HeartRateStatus {
  running: boolean;
  state: 'off' | 'starting' | 'scanning' | 'choosing' | 'connecting' | 'connected' | 'unavailable';
  bpm: number | null;
  device: string | null;
  /** A band has been chosen and is remembered. */
  chosen: boolean;
  /** Bands seen in the last scan, when more than one answered. */
  found: { address: string; name: string }[];
  session: Sport | null;
  limits: Limits;
  /** Minute summaries go to Athena (the server also checks its own switch). */
  share: boolean;
  queued: number;
  lastUpload: string | null;
  /** Alert phrases cached in her voice, for saying with no signal. */
  voice: { cached: number; needed: number };
  permitted: boolean;
  error: string | null;
}

export const heartRateApi = {
  status: () => androidCall<HeartRateStatus>('heartRateStatus'),
  start: (share: boolean) => androidCall<HeartRateStatus>('heartRateStart', { share }),
  stop: () => androidCall<HeartRateStatus>('heartRateStop'),
  choose: (address: string) => androidCall<HeartRateStatus>('heartRateChoose', { address }),
  forget: () => androidCall<HeartRateStatus>('heartRateForget'),
  share: (share: boolean) => androidCall<HeartRateStatus>('heartRateShare', { share }),
  session: (sport: Sport | null) => androidCall<HeartRateStatus>('heartRateSession', { sport }),
  limits: (limits: Limits) => androidCall<HeartRateStatus>('heartRateLimits', { limits }),
};
