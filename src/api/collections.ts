import { api } from './client';

/**
 * Collections (core_api src/services/collections; owner, 2026-11-28): lists and
 * trackers Athena keeps for someone, defined as data — a Christmas list, a
 * birthday list, a maintenance log. Athena starts and changes them from chat
 * (through the action layer); these calls are the person's own taps: tick
 * someone off, keep a suggestion, change a status, remove with undo.
 */
export interface CollectionField { name: string; label: string; type: 'text' | 'number' | 'money' | 'date' | 'yes_no' | 'choice' | 'link'; choices?: string[]; required?: boolean }

export interface CollectionItem {
  uuid: string;
  title: string;
  /** One of the collection's statuses, or 'suggested' for something Athena found that hasn't been kept. */
  status: string;
  fields: Record<string, string | number | boolean | null>;
  /** Where it came from: chat, memory, person (an interest on their page), athena (her own idea), email. */
  source: string;
  reason: string | null;
  removed: boolean;
}

export interface CollectionPerson { uuid: string; personKey: string; label: string; done: boolean; items: CollectionItem[] }

export interface Collection {
  uuid: string;
  name: string;
  purpose: string | null;
  fields: CollectionField[];
  statuses: string[];
  perPerson: boolean;
  /** Where its card goes on Home. */
  home: 'top' | 'after' | 'off';
  endsOn: string | null;
  archived: boolean;
  people: CollectionPerson[];
  /** Items not tied to a person (a list that isn't per-person). */
  items: CollectionItem[];
  counts: { people: number; peopleDone: number; items: number; suggested: number };
}

export interface PersonCollection {
  uuid: string;
  name: string;
  statuses: string[];
  fields: CollectionField[];
  subjectUuid: string;
  done: boolean;
  items: CollectionItem[];
}

export const SUGGESTED = 'suggested';

const base = '/api/v1/dashboard/collections';
const id = (v: string) => encodeURIComponent(v);

export const collectionsApi = {
  all: () => api.get<{ collections: Collection[] }>(base),
  one: (uuid: string) => api.get<Collection>(`${base}/${id(uuid)}`),
  forPerson: (key: string) => api.get<{ collections: PersonCollection[] }>(`${base}/person/${id(key)}`),
  setDone: (subjectUuid: string, done: boolean) => api.post<{ success: boolean }>(`${base}/subjects/${id(subjectUuid)}/done`, { done }),
  setStatus: (itemUuid: string, status: string) => api.patch<{ success: boolean }>(`${base}/items/${id(itemUuid)}`, { status }),
  remove: (itemUuid: string) => api.del<{ success: boolean }>(`${base}/items/${id(itemUuid)}`),
  restore: (itemUuid: string) => api.post<{ success: boolean }>(`${base}/items/${id(itemUuid)}/restore`),
};

/** "Dec 26" from 2026-12-26. */
export function endsLabel(day: string | null) {
  if (!day) return null;
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Where a suggestion came from, in words. */
export function sourceLabel(item: CollectionItem) {
  switch (item.source) {
    case 'athena': return 'Athena’s idea';
    case 'memory': return 'From what you’ve told her';
    case 'person': return 'From their interests';
    case 'email': return 'From an email';
    case 'chat': return 'From a conversation';
    default: return '';
  }
}
