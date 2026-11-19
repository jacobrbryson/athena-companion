import { api } from './client';

/** Family → Provisions (core_api services/provisions via /api/v1/provisions). */
export type MealKind = 'dinner' | 'lunch' | 'breakfast' | 'snack';
export type StockKind = 'proteins' | 'grains' | 'canned' | 'produce' | 'dairy' | 'frozen' | 'snacks' | 'drinks' | 'other' | 'household';

export interface MealIdea {
  uuid: string;
  title: string;
  meal: MealKind;
  minutes: number;
  blurb: string | null;
  ingredients: string[];
  /** Worked out in code against the live list: what they usually have, and what they'd need. */
  have: string[];
  missing: string[];
  coverage: number;
  /** Names whose saved food preferences match the dish. */
  lovedBy: string[];
  avoidedBy: string[];
  saved: boolean;
  tags: { quick: boolean; usesPantry: boolean; favorite: boolean };
  imageUrl: string;
}

export interface RestockItem { item: string; kind: StockKind; buys: number; everyDays: number; lastBought: string; daysLeft: number;
  /** A recent photo showed it, so it isn't running low. */
  seenIn?: KitchenPlace }

/** Photo inventory: where a photo was taken, and what it showed. */
export type KitchenPlace = 'pantry' | 'fridge' | 'freezer' | 'counter';
export interface SeenItem { uuid: string; name: string; kind: StockKind; amount: string | null }
export interface SeenPlace { place: KitchenPlace; scannedAt: string; fresh: boolean; items: SeenItem[] }
export interface Insight { tone: 'info' | 'good' | 'tip'; title: string; detail: string }
export interface FoodPreference { uuid: string; name: string; loves: string[]; avoids: string[] }

export type Provisions =
  | { status: 'not_connected' | 'unavailable'; reason?: string }
  | {
    status: 'ready';
    grocery: { lists: { title: string; toBuy: string[]; usualCount: number; recentlyBought: { text: string; day: string }[] }[]; appUrl: string };
    stock: { total: number; household: number; seen: number; kinds: Record<StockKind, number>; items: Record<StockKind, string[]> };
    restock: RestockItem[];
    runningLow: number;
    photos: { status: 'ready' | 'not_migrated' | 'unavailable'; places: SeenPlace[] };
    historySince: string | null;
    ideas: MealIdea[];
    ideasStatus: 'ready' | 'not_migrated';
    ideasAt: string | null;
    ideasStale: boolean;
    coverage: { meal: MealKind; ideas: number; ready: number }[];
    insights: Insight[];
    preferences: FoodPreference[];
  };

export const provisionsApi = {
  get: () => api.get<Provisions>('/api/v1/provisions'),
  refreshIdeas: () => api.post<{ written: number }>('/api/v1/provisions/ideas/refresh'),
  save: (uuid: string, saved: boolean) => api.put<{ uuid: string; saved: boolean }>(`/api/v1/provisions/ideas/${encodeURIComponent(uuid)}/saved`, { saved }),
  /** Photos of one place, downscaled; read by the vision model and never kept. */
  scan: (place: KitchenPlace, photos: { imageBase64: string; mimeType: string }[]) =>
    api.post<{ place: KitchenPlace; scannedAt: string; items: SeenItem[] }>('/api/v1/provisions/scan', { place, photos }),
  removeSeen: (uuid: string) => api.del(`/api/v1/provisions/seen/${encodeURIComponent(uuid)}`),
  /** A dish's picture; the first view of a new dish paints it, which takes a few seconds. */
  image: (url: string) => api.blob(url),
};
