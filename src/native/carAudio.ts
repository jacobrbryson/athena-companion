import { androidCall } from './android';

/**
 * Conversation mode in the car (CarAudio.java): while it is on and the phone
 * is connected to a car's hands-free, Athena talks over that link like a
 * call — the car's microphone, her voice on the car's speakers.
 */
export interface CarAudioStatus {
  /** Android 12+ (the routing calls this needs). */
  available: boolean;
  /** The person's switch; on unless they turned it off. */
  on: boolean;
  /** A car is connected for calls right now. */
  connected: boolean;
  /** Conversation mode is using it right now. */
  active: boolean;
  car: string | null;
  /** Why a connected car can't be used (a missing permission), or null. */
  blocked: string | null;
}

export const carAudioApi = {
  status: () => androidCall<CarAudioStatus>('carAudioStatus'),
  setOn: (on: boolean) => androidCall<CarAudioStatus>('carAudioSet', { on }),
};
