import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './client';

/**
 * A kid's own side of Companion (core_api guardianMissions kidHome, 11-23).
 * The server answers 403 for adults, which is how the console knows which
 * screen to draw. Only first names, quest words and their own steps arrive.
 */
export type StopState = 'done' | 'current' | 'locked';
export interface KidSafety { where?: string; supervision?: string; offLimits?: string }
export interface KidStep {
  uuid: string; mission: string; premise: string | null; instruction: string;
  safety: KidSafety | string | null; place: string | null;
  proof: 'none' | 'photo' | 'photo_set' | 'camera_check' | 'kid_confirm' | 'parent_confirm' | 'code' | 'game';
  /** Null until the step has been opened; opening starts its clock. */
  dueAt: string | null;
}
export interface KidGuardian { name: string; level: number; role: string }
export interface KidHome {
  guardian: boolean;
  name: string | null;
  steps: KidStep[];
  ready: { uuid: string; title: string }[];
  reveals: { uuid: string; title: string; reveal: string }[];
  trails: { uuid: string; title: string; stops: StopState[] }[];
  history?: { uuid: string; title: string; reveal: string | null; finished: boolean; endedAt: string | null; legacy?: boolean; did?: { finds: number; keys: number; pieces: number } }[];
  /** Approved, not started, with a planned start for the countdown. Absent before core_api is deployed. */
  upcoming?: KidUpcoming[];
  /** Missions they're in that haven't started and have no date: shown only as locked cards. */
  mysteries?: number;
  /** The rows behind the four Base counters, theirs only. */
  record?: KidRecord | null;
  me: { level: number; role: string; levelProgress: number; xp?: number; xpPerLevel?: number; finds: number; trailKeys?: number; mapPieces?: number; missionsStarted?: number; badges?: number; checkedIn?: boolean; topSkill: { name: string; badge: string | null; level: string } | null } | null;
  squad: KidGuardian[];
  squadName?: string | null;
  squads?: { name: string; members: KidGuardian[] }[];
  others: KidGuardian[];
  feed: { who: string; text: string; at: string }[];
  weekFinds?: number;
  athena: { key: string; name: string; percent: number }[];
  clues: { found: number; total: number } | null;
  skills?: { name: string; badge: string | null; level: 'untested' | 'learning' | 'reliable' }[];
  specialists?: { skill: string; badge: string | null; who: { name: string; level: string }[] }[];
  adventure?: { key: string; label: string | null } | null;
  kit?: string[];
  stopWord?: string | null;
}

export interface KidUpcoming { uuid: string; title: string; plannedFor: string; ready: boolean; game: string | null }
export interface KidRecord {
  finds: { title: string; mission: string; at: string }[];
  keys: { clue: number; code: string; mission: string; at: string }[];
  pieces: { family: string; fragment: string | null; mission: string; at: string }[];
  missions: { title: string; status: string; at: string }[];
}

const BASE = '/api/v1/guardian-missions';
export const kidApi = {
  home: () => api.get<KidHome>(`${BASE}/kid-home`),
  seen: (uuid: string) => api.post<Partial<KidHome>>(`${BASE}/kid/steps/${uuid}/seen`, {}),
  done: (uuid: string) => api.post<Partial<KidHome>>(`${BASE}/kid/steps/${uuid}/done`, {}),
  code: (uuid: string, code: string) => api.post<Partial<KidHome> & { ok?: boolean; message?: string }>(`${BASE}/kid/steps/${uuid}/code`, { code }),
  go: (uuid: string) => api.post<Partial<KidHome>>(`${BASE}/kid/go/${uuid}`, {}),
  photo: (uuid: string, image: string, contentType: string) =>
    api.post<Partial<KidHome> & { correct?: boolean; why?: string }>(`${BASE}/kid/steps/${uuid}/photo`, { image, contentType }),
};

/**
 * A photo for proof, shrunk on the tablet first: old tablets take huge photos
 * and slow uploads. Bare base64 JPEG, longest side at most 1600px.
 */
export async function photoForProof(file: File): Promise<{ image: string; contentType: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('That photo could not be read.'));
      el.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { image: canvas.toDataURL('image/jpeg', 0.85).split(',')[1] || '', contentType: 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A little chime for a finished step, unless sound is off on this tablet. */
export const kidSound = {
  on: () => localStorage.getItem('kid_sound') !== 'off',
  set: (on: boolean) => { try { localStorage.setItem('kid_sound', on ? 'on' : 'off'); } catch { /* stays on */ } },
  chime() {
    if (!kidSound.on()) return;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        o.type = 'triangle';
        const t = ctx.currentTime + i * 0.11;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.4);
      });
      window.setTimeout(() => void ctx.close(), 1200);
    } catch { /* no sound on this tablet */ }
  },
};

const hintKey = (who: string) => `companion_kid:${who}`;
const POLL_MS = 30_000;

/**
 * 'kid' | 'adult' | 'unknown'. A remembered answer paints the right screen on
 * the next visit; the server's answer always wins. Adults stop asking after
 * the first refusal. Kids' tablets get no reliable push, so this polls.
 */
export function useKidHome(who: string | null | undefined) {
  const [mode, setMode] = useState<'kid' | 'adult' | 'unknown'>(() => {
    if (!who) return 'unknown';
    const hint = localStorage.getItem(hintKey(who));
    return hint === 'kid' || hint === 'adult' ? hint : 'unknown';
  });
  const [data, setData] = useState<KidHome | null>(null);
  const [error, setError] = useState('');
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const remember = useCallback((m: 'kid' | 'adult') => {
    setMode(m);
    if (who) try { localStorage.setItem(hintKey(who), m); } catch { /* the server asks again next time */ }
  }, [who]);

  const load = useCallback(async () => {
    try {
      const next = await kidApi.home();
      setData(next);
      setError('');
      remember('kid');
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 403) remember('adult');
      else setError('Athena can’t reach Base right now.');
    }
  }, [remember]);

  useEffect(() => {
    if (!who) return;
    void load();
    const t = window.setInterval(() => { if (modeRef.current !== 'adult' && document.visibilityState === 'visible') void load(); }, POLL_MS);
    return () => window.clearInterval(t);
  }, [who, load]);

  /** Run a step action; it answers with their steps, and the rest (trail, level) is read again. */
  const act = useCallback(async <T extends Partial<KidHome>>(fn: () => Promise<T>) => {
    const next = await fn();
    setData(prev => (prev ? { ...prev, ...next } : prev));
    void load();
    return next;
  }, [load]);

  return { mode, data, error, reload: load, act };
}

/** I Spy (11-23): Thomas, Skylar and Athena take turns as the spy. */
export interface IspyRound {
  uuid: string; roundNo: number;
  spy: { name: string; athena: boolean; me: boolean };
  clue: string; photo: boolean;
  guesses: { by: string; athena: boolean; text: string; right: boolean | null }[];
  hints: string[];
  /** Hidden while Athena's own round is open. */
  answer: string | null;
  outcome: 'guessed' | 'taught' | 'revealed' | null;
  solvedBy: string | null;
  awaitingJudge: boolean;
}
export interface IspyGame {
  mission: { uuid: string; title: string };
  goal: number; done: number;
  players: { name: string; athena: boolean; me: boolean }[];
  turn: { name: string; athena: boolean; me: boolean };
  round: IspyRound | null;
  recent: IspyRound[];
}
const ISPY = `${BASE}/kid/ispy`;
export const ispyApi = {
  state: () => api.get<{ game: IspyGame | null }>(ISPY),
  spy: (image: string, contentType: string, clue: string, answer: string) => api.post<{ game: IspyGame }>(`${ISPY}/rounds`, { image, contentType, clue, answer }),
  athena: (image: string, contentType: string) => api.post<{ game: IspyGame }>(`${ISPY}/athena`, { image, contentType }),
  judge: (uuid: string, right: boolean, hint?: string) => api.post<{ game: IspyGame }>(`${ISPY}/rounds/${uuid}/judge`, { right, hint }),
  guess: (uuid: string, guess: string) => api.post<{ right: boolean; game: IspyGame }>(`${ISPY}/rounds/${uuid}/guess`, { guess }),
  reveal: (uuid: string) => api.post<{ game: IspyGame }>(`${ISPY}/rounds/${uuid}/reveal`, {}),
  photo: (uuid: string) => api.blob(`${ISPY}/rounds/${uuid}/photo`),
};
