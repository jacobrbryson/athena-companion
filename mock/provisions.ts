/**
 * DEV-ONLY: Family → Provisions for `npm run dev:mock` (core_api
 * services/provisions shape). Canned; the heart and "New ideas" change only
 * this page load's state.
 */
import type { KitchenPlace, MealIdea, Provisions, SeenPlace } from '../src/api/provisions';

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

type Seed = [title: string, meal: MealIdea['meal'], minutes: number, have: string[], missing: string[], lovedBy: string[]];
const SEEDS: Seed[] = [
  ['Honey Garlic Chicken Stir-Fry', 'dinner', 25, ['chicken', 'rice', 'honey', 'soy sauce', 'garlic'], ['broccoli'], ['Maya']],
  ['Ground Beef Tacos', 'dinner', 20, ['ground beef', 'tortillas', 'shredded cheese', 'salsa', 'lettuce'], [], ['Eli', 'Maya']],
  ['Creamy Chicken Pasta', 'dinner', 30, ['chicken', 'pasta', 'cream', 'parmesan'], ['spinach'], []],
  ['Pantry Chili', 'dinner', 45, ['ground beef', 'beans', 'tomatoes with chiles', 'onion'], [], ['Eli']],
  ['Grilled Cheese & Tomato Soup', 'dinner', 15, ['bread', 'cheese', 'butter', 'tomato soup'], [], []],
  ['Sheet-Pan Sausage & Potatoes', 'dinner', 40, ['sausage', 'potatoes', 'peppers'], ['zucchini'], []],
  ['Chicken Quesadillas', 'dinner', 15, ['chicken', 'tortillas', 'cheese', 'salsa'], [], ['Maya']],
  ['Baked Ziti', 'dinner', 50, ['pasta', 'red sauce', 'mozzarella'], ['ricotta', 'italian sausage'], []],
  ['Turkey Club Wraps', 'lunch', 10, ['tortillas', 'turkey', 'lettuce', 'bacon'], [], []],
  ['Mac & Cheese Cups', 'lunch', 25, ['macaroni', 'cheese', 'milk'], [], ['Eli']],
  ['Blueberry Waffles', 'breakfast', 10, ['waffles', 'blueberries', 'syrup'], [], ['Maya']],
  ['Banana Oatmeal', 'breakfast', 10, ['bananas', 'milk', 'honey'], ['oatmeal'], []],
  ['Apple Slices & Peanut Butter', 'snack', 5, ['apples', 'peanut butter'], [], []],
  ['Cheese & Crackers', 'snack', 5, ['cheese cubes', 'crackers'], [], []],
];

const idea = ([title, meal, minutes, have, missing, lovedBy]: Seed, i: number, saved = false): MealIdea => {
  const coverage = have.length / (have.length + missing.length);
  return {
    uuid: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    title, meal, minutes, blurb: null, ingredients: [...have, ...missing], have, missing,
    coverage: Math.round(coverage * 100) / 100, lovedBy, avoidedBy: [], saved,
    tags: { quick: minutes <= 30, usesPantry: coverage >= 0.75, favorite: saved || lovedBy.length > 0 },
    imageUrl: `/api/v1/provisions/ideas/${i}/image`,
  };
};

let ideas = SEEDS.map((s, i) => idea(s, i, i === 0));
let seenId = 0;
const seenItem = (name: string, kind: SeenPlace['items'][number]['kind'], amount: string | null = null) => ({ uuid: `00000000-0000-4000-9000-${String(++seenId).padStart(12, '0')}`, name, kind, amount });
let places: SeenPlace[] = [
  { place: 'fridge', scannedAt: ago(1), fresh: true, items: [seenItem('Eggs', 'dairy', '1 dozen'), seenItem('Milk', 'dairy', 'half full'), seenItem('Spinach', 'produce', '1 bag'), seenItem('Chicken breasts', 'proteins', '2 lb'), seenItem('Shredded cheese', 'dairy'), seenItem('Salsa', 'canned', '1 jar')] },
];
// What a mock photo "shows", per place.
const SCANNED: Record<KitchenPlace, [string, SeenPlace['items'][number]['kind'], string | null][]> = {
  fridge: [['Eggs', 'dairy', '1 dozen'], ['Milk', 'dairy', '1 gallon'], ['Greek yogurt', 'dairy', '4 cups'], ['Spinach', 'produce', '1 bag'], ['Ground beef', 'proteins', '1 lb'], ['Ketchup', 'canned', null]],
  pantry: [['Rice', 'grains', '1 bag'], ['Black beans', 'canned', '3 cans'], ['Pasta', 'grains', '2 boxes'], ['Peanut butter', 'canned', '1 jar'], ['Cheerios', 'grains', '1 box']],
  freezer: [['Frozen peas', 'frozen', '1 bag'], ['Waffles', 'frozen', '1 box'], ['Ice cream', 'frozen', null]],
  counter: [['Bananas', 'produce', '5'], ['Apples', 'produce', '6'], ['Bread', 'grains', '1 loaf']],
};
let round = 0;

function coverage() {
  return (['dinner', 'lunch', 'breakfast', 'snack'] as const).map(meal => {
    const of = ideas.filter(i => i.meal === meal);
    return { meal, ideas: of.length, ready: of.filter(i => i.tags.usesPantry).length };
  });
}

// Add item's direct action writes here, so a reload keeps what was added.
const mockToBuy = ['Ribs from Food Lion', 'Cool ranch doritos', "Children's tylenol", 'Oatmeal'];

export function mockGroceryBought(item: string): boolean {
  const i = mockToBuy.findIndex(t => t.toLowerCase() === item.toLowerCase());
  if (i < 0) return false;
  mockToBuy.splice(i, 1);
  return true;
}

export function mockGroceryAdd(item: string): 'ok' | 'dup' {
  if (mockToBuy.some(t => t.toLowerCase() === item.toLowerCase())) return 'dup';
  mockToBuy.push(item);
  return 'ok';
}

function summary(): Provisions {
  if (localStorage.getItem('mock_keep') === 'off') return { status: 'not_connected', reason: 'Google Keep is not connected' };
  return {
    status: 'ready',
    grocery: { appUrl: 'https://keep.google.com/', lists: [{ title: 'Groceries', toBuy: [...mockToBuy], usualCount: 400, usuallyBuys: ['Milk', 'Bananas', 'Bread', 'Eggs', 'Butter', 'Apples', 'Strawberries', 'Chicken breasts', 'Cheddar cheese', 'Shredded cheese', 'Coffee', 'Creamer', 'Paper towels', 'Toilet paper', 'Dog food', 'Oatmeal', 'Blueberries', 'Broccoli', 'Bacon', 'Black beans'], recentlyBought: [{ text: 'Apples', day: ago(1).slice(0, 10) }, { text: 'Bananas', day: ago(6).slice(0, 10) }] }] },
    stock: {
      total: 166 + places.reduce((n, p) => n + p.items.length, 0), household: 90, seen: places.reduce((n, p) => n + p.items.length, 0),
      kinds: { proteins: 14, grains: 19, canned: 27, produce: 18, dairy: 34, frozen: 11, snacks: 23, drinks: 20, other: 0, household: 90 },
      items: { proteins: ['Chicken', 'Ground beef', 'Hotdogs', 'Burger patties'], grains: ['Tortillas', 'Rice', 'Pasta', 'Frosted flakes'], canned: ['Tomatoes with chiles', 'Syrup', 'Bbq sauce'], produce: ['Apples', 'Bananas', 'Blueberries', 'Romaine'], dairy: ['Milk', 'Flips yogurt', 'Provolone'], frozen: ['Waffles', 'Icecream', 'Taquitos'], snacks: ['Fruit snacks', 'Trail mix'], drinks: ['Coffee', 'Diet coke'], other: [], household: ['Paper towels'] },
    },
    restock: [
      { item: 'Waffles', kind: 'frozen', buys: 3, everyDays: 8, lastBought: ago(12), daysLeft: -4 },
      { item: 'Bananas', kind: 'produce', buys: 4, everyDays: 6, lastBought: ago(6), daysLeft: 0 },
      { item: 'Nurri protein shakes for kids', kind: 'drinks', buys: 2, everyDays: 15, lastBought: ago(13), daysLeft: 2 },
      { item: 'Syrup', kind: 'canned', buys: 4, everyDays: 8, lastBought: ago(4), daysLeft: 4 },
      { item: 'Flips yogurt', kind: 'dairy', buys: 2, everyDays: 17, lastBought: ago(13), daysLeft: 4 },
    ],
    runningLow: 3,
    photos: { status: 'ready', places },
    historySince: ago(29),
    ideas,
    ideasStatus: 'ready',
    ideasAt: ago(1),
    ideasStale: false,
    coverage: coverage(),
    insights: [
      { tone: 'info', title: '114 items bought in 30 days', detail: "Counted from ticks I've noticed on the Keep list." },
      { tone: 'good', title: 'Most rebought', detail: 'Apples ×4, Bananas ×4, Syrup ×4' },
      { tone: 'tip', title: '6 ingredients you have go into several meals', detail: 'chicken (4), tortillas (4), cheese (3)' },
    ],
    preferences: [
      { uuid: 'pref-1', name: 'Maya', loves: ['tacos', 'waffles', 'chicken'], avoids: ['mushrooms'] },
      { uuid: 'pref-2', name: 'Eli', loves: ['chili', 'mac and cheese'], avoids: [] },
    ],
  };
}

const PALETTES = [['#c56a2b', '#f2b45c', '#7a3a12'], ['#b23a2a', '#f0c24b', '#5c8a2b'], ['#e6cf9a', '#c98b3d', '#7c5a2a'], ['#8a2f1f', '#d9862f', '#3b6b2a'], ['#d79a3a', '#c2412b', '#f3e1b0']];

/** A stand-in "photo": a plate of colour, different per dish. */
export function mockMealImage(path: string): Blob {
  const n = Number(/ideas\/(\d+)\//.exec(path)?.[1] || 0);
  const [a, b, c] = PALETTES[n % PALETTES.length];
  const dots = Array.from({ length: 14 }, (_, i) => `<circle cx="${300 + ((i * 97 + n * 31) % 420)}" cy="${300 + ((i * 61 + n * 17) % 420)}" r="${26 + ((i * 13) % 30)}" fill="${[a, b, c][i % 3]}"/>`).join('');
  return new Blob([`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#5a3b22"/><rect width="1024" height="1024" fill="url(#w)" opacity=".3"/><circle cx="512" cy="512" r="400" fill="#f4efe6"/><circle cx="512" cy="512" r="330" fill="#ede4d3"/>${dots}<defs><linearGradient id="w" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs></svg>`], { type: 'image/svg+xml' });
}

export async function mockProvisions(method: string, p: string, body: unknown): Promise<unknown> {
  if (!p.startsWith('/api/v1/provisions')) return undefined;
  if (p === '/api/v1/provisions' && method === 'GET') return summary();
  if (p === '/api/v1/provisions/scan' && method === 'POST') {
    const place = (body as { place: KitchenPlace }).place;
    await new Promise(r => setTimeout(r, 1800));
    const items = SCANNED[place].map(([n, k, a]) => seenItem(n, k, a));
    places = [...places.filter(x => x.place !== place), { place, scannedAt: new Date().toISOString(), fresh: true, items }];
    return { place, scannedAt: new Date().toISOString(), items };
  }
  const gone = /^\/api\/v1\/provisions\/seen\/([^/]+)$/.exec(p);
  if (gone && method === 'DELETE') {
    places = places.map(x => ({ ...x, items: x.items.filter(i => i.uuid !== gone[1]) }));
    return { uuid: gone[1], removed: true };
  }
  if (p === '/api/v1/provisions/ideas/refresh' && method === 'POST') {
    await new Promise(r => setTimeout(r, 1500));
    round += 1;
    const kept = ideas.filter(i => i.saved);
    const rest = SEEDS.map((s, i) => idea(s, i)).filter(i => !kept.some(k => k.title === i.title));
    ideas = [...kept, ...rest.slice(round % 3).concat(rest.slice(0, round % 3))];
    return { written: rest.length };
  }
  const saved = /^\/api\/v1\/provisions\/ideas\/([^/]+)\/saved$/.exec(p);
  if (saved && method === 'PUT') {
    const on = !!(body as { saved?: boolean })?.saved;
    ideas = ideas.map(i => (i.uuid === saved[1] ? { ...i, saved: on, tags: { ...i.tags, favorite: on || i.lovedBy.length > 0 } } : i));
    return { uuid: saved[1], saved: on };
  }
  return undefined;
}
