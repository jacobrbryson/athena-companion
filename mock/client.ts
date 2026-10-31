/**
 * DEV-ONLY mock of src/api/client.ts for `npm run dev:mock`.
 *
 * Lets the Companion UI run with no proxy_service, core_api, database or
 * Google sign-in: vite.mock.config.ts swaps this in for the real client.
 * Everything here is canned; nothing is persisted. Never imported by the
 * production build.
 */

import { mockTrading } from './trading';
import type { NewsSource } from '../src/api/dashboard';
import { mockProjectsRoute, mockVehicles, mockApplyBill } from './projects';
import { mockWorkItems } from './workItems';
import { mockReviewRuns, mockWorkspaceReviews } from './workspaceReviews';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
const DAY = 86_400_000;

let signedIn = localStorage.getItem('mock_signed_in') === 'true';
/**
 * Dev-only fault injection for the "left it open all night" failures:
 *   mock_ip_drift=true   every /api/v1 call 401s until the session is re-pinned
 *                        (POST /auth/companion/refresh) — the real IP-pin drift
 *   mock_link_down=true  the API is unreachable (503) — the LinkLost screen
 * Toggle them live with __mockIpDrift() / __mockLinkDown().
 */
let ipDrift = localStorage.getItem('mock_ip_drift') === 'true';
const linkDown = () => localStorage.getItem('mock_link_down') === 'true';
// Dev-only access fixtures: set mock_access_locked=true to review the gate.
const mockAccess = () => ({ allowed: localStorage.getItem('mock_access_locked') !== 'true', requested: localStorage.getItem('mock_access_requested') === 'true' });
const messages: { uuid: string; is_human: boolean; text: string; created_at: string }[] = [
  { uuid: 'm1', is_human: true, text: 'Remind me what we decided about the Iceland trip?', created_at: iso(DAY * 2) },
  {
    uuid: 'm2',
    is_human: false,
    text: 'March, eight days, and you wanted the south coast first — Vík, then the glacier lagoon. You were still torn on renting a camper.',
    created_at: iso(DAY * 2 - 5000),
  },
];

const events = [
  { uuid: 'e1', kind: 'photo', scope: 'personal', title: 'Sunset at Wrightsville Beach', content: 'A wide beach at golden hour, low waves, a pier in the distance, two people walking a golden retriever along the waterline.\nThey said: "Biscuit\'s first time at the ocean"', occurred_at: iso(DAY * 9), importance: 6, source: 'user', media_ref: null, metadata: null },
  { uuid: 'e2', kind: 'conversation', scope: 'personal', title: 'Iceland trip plan', content: 'Planning 8 days in Iceland in March — south coast first (Vík, Jökulsárlón). Undecided on a camper van.', occurred_at: iso(DAY * 2), importance: 7, source: 'ai', media_ref: null, metadata: null },
  { uuid: 'e3', kind: 'observation', scope: 'personal', title: 'Deer at the roadside', content: 'An adult deer at the edge of the road near the lake (seen via phone camera, front)', occurred_at: iso(DAY * 1), importance: 5, source: 'device', media_ref: null, metadata: null },
  { uuid: 'e4', kind: 'reflection', scope: 'personal', title: 'Reflection', content: 'We mostly talked travel today — Iceland is clearly the big thing on their mind. They seemed lighter than last week.', occurred_at: iso(DAY * 1.5), importance: 6, source: 'ai', media_ref: null, metadata: null },
];

const facts = [
  { uuid: 'f1', category: 'pet', key: "dog's name", value: 'Biscuit — golden retriever, 4', source: 'user', updated_at: iso(DAY * 30) },
  { uuid: 'f2', category: 'person', key: 'sister', value: 'Emma — moved to Denver in August for a nursing job', source: 'ai', updated_at: iso(DAY * 12) },
  { uuid: 'f3', category: 'goal', key: 'trip', value: 'Iceland in March', source: 'ai', updated_at: iso(DAY * 2) },
];

const journal = `# What Athena remembers about Sam

_Generated just now. Anything here can be deleted from the Memories panel._

## Things I know

### Pets
- **dog's name** — Biscuit — golden retriever, 4

### People
- **sister** — Emma — moved to Denver in August _(picked up in conversation)_

## Moments

- **${iso(DAY * 2).slice(0, 10)}** · conversation · Iceland trip plan
  Planning 8 days in Iceland in March — south coast first.
- **${iso(DAY * 9).slice(0, 10)}** · photo · Sunset at Wrightsville Beach
  A wide beach at golden hour…

## Athena's reflections

- **${iso(DAY * 1.5).slice(0, 10)}** — We mostly talked travel today.
`;

const status = {
  policy: 'local-first',
  childPolicy: 'frontier-first',
  embeddingSpace: 'orcwood-dev:nomic-embed-text',
  serving: {
    chat: { endpointId: 'orcwood-dev', tier: 'orcwood', model: 'qwen3:8b' },
    vision: { endpointId: 'orcwood-dev', tier: 'orcwood', model: 'qwen2.5vl:7b' },
    extract: { endpointId: 'orcwood-dev', tier: 'orcwood', model: 'qwen3:8b' },
  },
  orcwood: [
    { id: 'orcwood-dev', tier: 'orcwood', models: { chat: 'qwen3:8b', vision: 'qwen2.5vl:7b', embed: 'nomic-embed-text' }, reportedModels: null, health: { available: true, circuit: 'closed', latencyMs: 1400, errorRate: 0.02, calls: 212 } },
    { id: 'orcwood-rack-2', tier: 'orcwood', models: { chat: 'llama3.3:70b' }, reportedModels: null, health: { available: false, circuit: 'open', latencyMs: null, errorRate: 1, calls: 6 } },
  ],
  frontier: [
    { id: 'gemini', tier: 'frontier', models: { chat: 'gemini-3.5-flash-lite', tts: 'gemini-2.5-flash-preview-tts' }, reportedModels: null, health: { available: true, circuit: 'closed', latencyMs: 800, errorRate: 0, calls: 31 } },
  ],
  recentCalls: [
    { at: now - 60_000, task: 'chat', endpointId: 'orcwood-dev', tier: 'orcwood', outcome: 'ok', latencyMs: 1320 },
    { at: now - 50_000, task: 'extract', endpointId: 'orcwood-dev', tier: 'orcwood', outcome: 'ok', latencyMs: 2100 },
    { at: now - 40_000, task: 'tts', endpointId: 'gemini', tier: 'frontier', outcome: 'ok', latencyMs: 9800 },
  ],
};

const manifest = {
  version: 'edea50d35273',
  models: [
    { id: 'gemini-nano', runtime: 'android-aicore', platforms: ['android'], tasks: ['intent', 'summarize', 'chat-lite'], enabled: true },
    { id: 'vision-detector', runtime: 'unity-inference-engine', platforms: ['android'], tasks: ['vision-fast'], enabled: false },
    { id: 'web-chat-lite', runtime: 'webllm', platforms: ['web'], tasks: ['intent', 'chat-lite'], enabled: false },
  ],
};

/**
 * Integration fixtures. Covers the three states the panel renders:
 * connected, never connected, and a link whose grant was rejected.
 */
const integrations = [
  {
    provider: 'gmail',
    label: 'Gmail',
    scopes: ['gmail.readonly', 'gmail.modify'],
    requires_consent: null,
    group: 'google',
    connected: true,
    link: {
      uuid: 'i0', provider: 'gmail', kind: 'oauth2',
      external_account_id: 'sam@example.com', display_name: 'sam@example.com',
      scopes: ['gmail.readonly'], expires_at: null, status: 'active' as const,
      expired: false, last_refreshed_at: iso(3600_000), last_used_at: iso(1800_000),
      created_at: iso(DAY * 12),
    },
  },
  {
    provider: 'google_contacts',
    label: 'Google Contacts',
    scopes: ['contacts.readonly'],
    requires_consent: null,
    group: 'google',
    connected: false,
    link: null,
  },
  {
    provider: 'google_calendar',
    label: 'Google Calendar',
    scopes: ['calendar.readonly'],
    requires_consent: null,
    group: 'google',
    connected: true,
    link: {
      uuid: 'i1', provider: 'google_calendar', kind: 'oauth2',
      external_account_id: 'g-1', display_name: 'sam@example.com',
      scopes: ['calendar.readonly'], expires_at: null, status: 'active' as const,
      expired: false, last_refreshed_at: iso(3600_000), last_used_at: iso(900_000),
      created_at: iso(DAY * 12),
    },
  },
  {
    provider: 'whoop',
    label: 'Whoop',
    scopes: ['read:recovery', 'read:sleep', 'read:workout', 'read:profile', 'offline'],
    requires_consent: 'health_data',
    connected: true,
    link: {
      uuid: 'i3', provider: 'whoop', kind: 'oauth2',
      external_account_id: 'w-1', display_name: 'Sam B',
      scopes: ['read:recovery'], expires_at: iso(-3600_000), status: 'needs_reauth' as const,
      expired: true, last_refreshed_at: iso(DAY * 3), last_used_at: iso(DAY * 3),
      created_at: iso(DAY * 40),
    },
  },
];

/**
 * Set mock_consent_health=true to preview the already-consented path; the
 * default shows the consent gate the server enforces with a 412.
 */
const healthConsented = () => localStorage.getItem('mock_consent_health') === 'true';

const devices = [
  { uuid: 'd1', name: 'Pixel 9', platform: 'android', capabilities: { ramGb: 12, installed: [{ id: 'gemini-nano' }] }, last_seen_at: iso(3 * 60_000), created_at: iso(DAY * 5) },
];

// ------------------------------------------------------------- dashboard ---
// A dashboard with real-shaped data in it, so the cards, counts and ordering
// can be worked on without every provider connected. Deliberately mixed: two
// sources are ready, one needs re-auth and one was never connected, because
// those three states are what the layout has to hold at once.
/** Calibration references the mock keeps across reloads. */
function mockBodyReferences(): { uuid: string; measured_on: string; source: string | null; height_cm: number | null; body_fat_percent: number | null; skeletal_muscle_kg: number | null; fat_free_mass_kg: number | null; body_water_percent: number | null }[] {
  try { return JSON.parse(localStorage.getItem('mock_body_references') || '[]'); } catch { return []; }
}
const ready = <T,>(data: T) => ({ status: 'ready' as const, data, checkedAt: new Date().toISOString() });
const unready = (status: 'not_connected' | 'needs_reauth' | 'consent_required' | 'error') =>
  ({ status, data: null, checkedAt: new Date().toISOString() });
const inMinutes = (m: number) => new Date(now + m * 60_000).toISOString();
const dayStamp = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString().slice(0, 10);

/** Watched places for the emergency watch, kept in localStorage like the rest of the mock. */
function mockWatchPlaces(): { uuid: string; name: string; kind: string; address: string | null; notes: string | null; latitude: number; longitude: number; radiusMiles: number; enabled: boolean }[] {
  try {
    const saved = localStorage.getItem('mock_watch_places');
    if (saved) return JSON.parse(saved).map((p: { kind?: string; notes?: string | null }) => ({ kind: 'other', notes: null, ...p }));
  } catch { /* fall through */ }
  return [
    { uuid: 'wp-home', name: 'Home', kind: 'home', address: '148 RUSHING WATER LN, TROUTMAN, NC, 28166', notes: null, latitude: 35.6741, longitude: -80.9073, radiusMiles: 3, enabled: true },
    { uuid: 'wp-church', name: 'Troutman ARP Church', kind: 'church', address: '125 S MAIN ST, TROUTMAN, NC, 28166', notes: 'Wednesday night suppers', latitude: 35.6995, longitude: -80.8885, radiusMiles: 1, enabled: true },
  ];
}

// -------------------------------------------------------- place reminders ---

function mockPlaceReminders() {
  const saved = localStorage.getItem('mock_place_reminders');
  if (saved) return JSON.parse(saved) as Array<Record<string, unknown> & { uuid: string }>;
  const base = { latitude: 35.7001, longitude: -80.8802, radiusM: 150, fireCount: 0, lastFiredAt: null, doneAt: null, createdAt: '2026-10-04T15:00:00Z' };
  return [
    { ...base, uuid: 'pr-1', placeUuid: null, placeName: "Missy's", address: '412 OAK ST, TROUTMAN, NC, 28166', reminder: 'Bring back her casserole dish', repeats: false, status: 'armed' },
    { ...base, uuid: 'pr-2', placeUuid: null, placeName: 'Troutman ARP Church', address: null, reminder: 'Drop off the canned goods', repeats: true, status: 'armed' },
  ];
}

// -------------------------------------------------------------- community ---
// Neighbours and local events, kept in localStorage like the watched places so
// the Community page can be worked on without a database.
type MockNeighbor = { uuid: string; name: string | null; address: string | null; latitude: number | null; longitude: number | null; placeUuid: string | null; where: string | null; contact: string | null; notes: string | null; contacts: { contactId: string; name: string | null }[] };
// Google Contacts, as GET /dashboard/community/contacts returns them. ?contacts=off
// in the URL plays the "not connected" case.
const MOCK_SITES = [
  {
    uuid: 'site-1', domain: 'orcwood.com', label: 'Orcwood Games', searchSite: 'sc-domain:orcwood.com', gaProperty: '22', notes: null,
    lastCheckedAt: new Date(Date.now() - 20 * 60_000).toISOString(), lastError: null,
    search: { takenOn: '2026-10-07', window: { start: '2026-09-27', end: '2026-10-04' }, clicks: 412, impressions: 15800, ctr: 0.026, position: 11.4, previous: { clicks: 350, impressions: 14100 }, trend: { clicks: 18, impressions: 12 }, topQueries: [{ query: 'orcwood', clicks: 120, impressions: 800 }, { query: 'orc games', clicks: 45, impressions: 2100 }] },
    analytics: { takenOn: '2026-10-07', users: 1290, sessions: 1840, newUsers: 960, previous: { users: 1410, sessions: 1900, newUsers: 1100 }, trend: { users: -9, sessions: -3 }, topPages: [{ path: '/', views: 2100 }, { path: '/games', views: 760 }] },
  },
  {
    uuid: 'site-2', domain: 'rossbryson.com', label: null, searchSite: 'https://rossbryson.com/', gaProperty: null, notes: null,
    lastCheckedAt: new Date(Date.now() - 20 * 60_000).toISOString(), lastError: 'Analytics: HTTP 403 — Google Analytics Data API has not been used in project athena-476423 before or it is disabled.',
    search: { takenOn: '2026-10-07', window: { start: '2026-09-27', end: '2026-10-04' }, clicks: 9, impressions: 330, ctr: 0.027, position: 22.1, previous: { clicks: 9, impressions: 300 }, trend: { clicks: 0, impressions: 10 }, topQueries: [] },
    analytics: null,
  },
];

const MOCK_CONTACTS = [
  { contactId: '111', name: 'Bill Henderson', phone: '+1 704-555-0100', email: 'bill.henderson@example.com', address: '152 Rushing Water Ln, Troutman, NC 28166', photoUrl: null },
  { contactId: '222', name: 'Carol Henderson', phone: '+1 704-555-0101', email: null, address: '152 Rushing Water Ln, Troutman, NC 28166', photoUrl: null },
  { contactId: '333', name: 'Pastor Jim Walker', phone: '+1 704-555-0142', email: 'jim@troutmanarp.example', address: null, photoUrl: null },
  { contactId: '444', name: 'Maria Lopez', phone: '+1 704-555-0177', email: 'maria.lopez@example.com', address: '140 Rushing Water Ln, Troutman, NC 28166', photoUrl: null },
];
const mockContactsOff = () => new URLSearchParams(window.location.search).get('contacts') === 'off';
const mockStreet = (a: string | null) => (a || '').split(',')[0].toLowerCase().replace(/\blane\b/g, 'ln').replace(/\s+/g, ' ').trim();
function mockLinkedTo(contactId: string) {
  const n = mockNeighbors().find((x) => x.contacts.some((c) => c.contactId === contactId));
  return n ? { uuid: n.uuid, label: n.name || (n.address || '').split(',')[0] } : undefined;
}
function withMockContacts(list: MockNeighbor[]) {
  return list.map((n) => ({
    ...n,
    contacts: n.contacts.map((link) => {
      if (mockContactsOff()) return { ...link, card: null, status: 'not_connected' };
      const c = MOCK_CONTACTS.find((x) => x.contactId === link.contactId);
      return c ? { ...link, name: c.name, card: c, status: 'ok' } : { ...link, card: null, status: 'missing' };
    }),
  }));
}
type MockEvent = { uuid: string; title: string; startsOn: string; endsOn: string | null; time: string | null; placeUuid: string | null; location: string | null; repeats: 'none' | 'yearly'; url: string | null; notes: string | null };
function mockStored<T>(key: string, fallback: T[]): T[] {
  try { const saved = localStorage.getItem(key); if (saved) return JSON.parse(saved); } catch { /* fall through */ }
  return fallback;
}
const mockNeighbors = () => mockStored<MockNeighbor>('mock_neighbors', [
  { uuid: 'nb-1', name: 'The Hendersons', address: '152 RUSHING WATER LN, TROUTMAN, NC, 28166', latitude: 35.6747, longitude: -80.9061, placeUuid: 'wp-home', where: 'Two doors down, the blue house', contact: null, notes: 'Have a generator; Carol is a retired nurse.', contacts: [{ contactId: '111', name: 'Bill Henderson' }, { contactId: '222', name: 'Carol Henderson' }] },
  { uuid: 'nb-2', name: 'The Parkers', address: '154 RUSHING WATER LN, TROUTMAN, NC, 28166', latitude: null, longitude: null, placeUuid: 'wp-home', where: null, contact: null, notes: 'Two dogs.', contacts: [] },
]);
const mockEvents = () => mockStored<MockEvent>('mock_events', [
  { uuid: 'ev-1', title: 'Ham Day', startsOn: '2026-09-26', endsOn: null, time: '9am–3pm', placeUuid: null, location: 'Downtown Troutman', repeats: 'yearly', url: null, notes: 'Parade at 10. Park behind the depot.' },
]);
function mockNextOn(e: MockEvent) {
  if (e.repeats !== 'yearly') return { nextOn: e.startsOn, nextEndsOn: e.endsOn };
  const today = new Date().toISOString().slice(0, 10);
  let on = `${Math.max(Number(today.slice(0, 4)), Number(e.startsOn.slice(0, 4)))}${e.startsOn.slice(4)}`;
  if ((Date.parse(today) - Date.parse(on)) / 86400000 > 14) on = `${Number(on.slice(0, 4)) + 1}${on.slice(4)}`;
  return { nextOn: on, nextEndsOn: null };
}
function mockEventList() {
  const today = new Date().toISOString().slice(0, 10);
  const all = mockEvents().map((e) => ({ ...e, ...mockNextOn(e) }));
  const past = (e: { nextOn: string; nextEndsOn: string | null }) => (e.nextEndsOn || e.nextOn) < today;
  return all.sort((a, b) => past(a) !== past(b) ? (past(a) ? 1 : -1) : past(a) ? b.nextOn.localeCompare(a.nextOn) : a.nextOn.localeCompare(b.nextOn));
}
function mockCommunity() {
  return {
    places: mockWatchPlaces(),
    neighbors: withMockContacts(mockNeighbors()),
    events: mockEventList(),
    localNews: [
      { title: 'Ham Day draws its biggest crowd yet to downtown Troutman', url: 'https://example.com/ham-day', summary: null, published: null, firstSeen: new Date(Date.now() - 2 * 86400000).toISOString(), slot: 0, sourceUuid: 'src-1', source: 'Statesville Record & Landmark', matched: 'Troutman' },
    ],
    kinds: ['home', 'family', 'neighborhood', 'church', 'school', 'town', 'work', 'business', 'park', 'other'],
  };
}
function mockUpsert<T extends { uuid: string }>(key: string, list: T[], uuid: string | null, row: Omit<T, 'uuid'>) {
  const next = uuid ? list.map((x) => (x.uuid === uuid ? ({ ...row, uuid } as T) : x)) : [...list, { ...row, uuid: `${key}-${Date.now()}` } as T];
  localStorage.setItem(key, JSON.stringify(next));
}

function dashboardSummary() {
  return {
    calendar: ready({
      timeZone: 'America/New_York',
      days: 7,
      // "Home 7am-4pm" as the server returns it: apart from the events. Spans
      // now so the Work banner shows whenever the mock is opened.
      workingLocations: [
        { id: 'wl1', title: 'Home', start: inMinutes(-120), end: inMinutes(300), allDay: false, location: null, calendar: null, shared: false, eventType: 'workingLocation', workingLocation: 'Home' },
      ],
      events: [
        { id: 'c1', title: 'Design review', start: inMinutes(35), end: inMinutes(95), allDay: false, location: 'Zoom', calendar: null, shared: false, eventType: 'default', attendees: 4 },
        { id: 'c2', title: 'School pickup', start: inMinutes(180), end: inMinutes(210), allDay: false, location: null, calendar: null, shared: true },
        { id: 'c3', title: 'Dentist', start: inMinutes(60 * 26), end: inMinutes(60 * 27), allDay: false, location: 'Davidson', calendar: null, shared: false },
        { id: 'c4', title: 'Emma visiting', start: dayStamp(-4), end: dayStamp(-6), allDay: true, location: null, calendar: null, shared: false },
        { id: 't1', title: 'Troutman soccer practice', start: inMinutes(30 * 60), end: inMinutes(30 * 60 + 90), allDay: false, location: null, calendar: null, shared: false },
        { id: 't2', title: 'Troutman Rec game vs Mooresville', start: inMinutes(4 * 24 * 60 - 120), end: inMinutes(4 * 24 * 60 - 120 + 60), allDay: false, location: null, calendar: null, shared: false },
        { id: 't3', title: 'Troutman Founders Day 5K', start: inMinutes(4 * 24 * 60 + 420), end: inMinutes(4 * 24 * 60 + 420 + 90), allDay: false, location: null, calendar: null, shared: false },
        // Named calendars, so the Calendar page has more than one colour and switch to show.
        { id: 'w1', title: 'Emily & Ross 1:1', start: inMinutes(60 * 3), end: inMinutes(60 * 3 + 30), allDay: false, location: 'https://meet.google.com/abc', calendar: 'ross@example.com', shared: false, eventType: 'default', attendees: 2 },
        { id: 'w2', title: 'Sprint planning', start: inMinutes(60 * 24 + 120), end: inMinutes(60 * 24 + 180), allDay: false, location: null, calendar: 'ross@example.com', shared: false, eventType: 'default', attendees: 8 },
        { id: 'f1', title: 'Skylar softball practice', start: inMinutes(60 * 5), end: inMinutes(60 * 6), allDay: false, location: 'Troutman Middle School', calendar: 'Family', shared: true },
        { id: 'f2', title: 'Ashlynn therapy', start: inMinutes(60 * 48), end: inMinutes(60 * 49), allDay: false, location: null, calendar: 'Family', shared: true },
        { id: 'g1', title: 'Gym', start: inMinutes(60 * 22), end: inMinutes(60 * 23), allDay: false, location: null, calendar: 'ross@example.com', shared: false },
        { id: 'v1', title: 'Iceland trip', start: dayStamp(-2), end: dayStamp(-6), allDay: true, location: null, calendar: 'Travel', shared: true },
      ],
    }),
    // A fortnight of heart data: a settled baseline, then a couple of days of
    // rising resting heart rate and falling HRV, so the readiness call and the
    // trends have something to actually say.
    recovery: ready([
      { date: dayStamp(0), recovery_score: 34, state: 'SCORED', resting_heart_rate: 62, hrv_ms: 41, spo2_percent: 96.4 },
      { date: dayStamp(1), recovery_score: 48, state: 'SCORED', resting_heart_rate: 60, hrv_ms: 46, spo2_percent: 96.8 },
      { date: dayStamp(2), recovery_score: 71, state: 'SCORED', resting_heart_rate: 57, hrv_ms: 58, spo2_percent: 97.1 },
      { date: dayStamp(3), recovery_score: 76, state: 'SCORED', resting_heart_rate: 56, hrv_ms: 61, spo2_percent: 97.4 },
      { date: dayStamp(4), recovery_score: 64, state: 'SCORED', resting_heart_rate: 58, hrv_ms: 55, spo2_percent: 97 },
      { date: dayStamp(5), recovery_score: 81, state: 'SCORED', resting_heart_rate: 55, hrv_ms: 64, spo2_percent: 97.5 },
      { date: dayStamp(6), recovery_score: 69, state: 'SCORED', resting_heart_rate: 57, hrv_ms: 57, spo2_percent: 97.2 },
      { date: dayStamp(7), recovery_score: 73, state: 'SCORED', resting_heart_rate: 56, hrv_ms: 60, spo2_percent: 97.3 },
      { date: dayStamp(8), recovery_score: 58, state: 'SCORED', resting_heart_rate: 59, hrv_ms: 52, spo2_percent: 96.9 },
      { date: dayStamp(9), recovery_score: 77, state: 'SCORED', resting_heart_rate: 56, hrv_ms: 62, spo2_percent: 97.4 },
      { date: dayStamp(10), recovery_score: 66, state: 'SCORED', resting_heart_rate: 57, hrv_ms: 56, spo2_percent: 97.1 },
      { date: dayStamp(11), recovery_score: 70, state: 'SCORED', resting_heart_rate: 58, hrv_ms: 59, spo2_percent: 97 },
      { date: dayStamp(12), recovery_score: 62, state: 'SCORED', resting_heart_rate: 59, hrv_ms: 54, spo2_percent: 96.8 },
      { date: dayStamp(13), recovery_score: 74, state: 'SCORED', resting_heart_rate: 56, hrv_ms: 61, spo2_percent: 97.3 },
    ]),
    sleep: ready([
      { date: dayStamp(0), nap: false, hours_asleep: 5.4, sleep_performance_percent: 62, respiratory_rate: 15.8 },
      { date: dayStamp(1), nap: false, hours_asleep: 6.1, sleep_performance_percent: 71, respiratory_rate: 15.2 },
      { date: dayStamp(2), nap: false, hours_asleep: 7.3, sleep_performance_percent: 88, respiratory_rate: 14.9 },
      { date: dayStamp(3), nap: false, hours_asleep: 7.6, sleep_performance_percent: 91, respiratory_rate: 14.8 },
      { date: dayStamp(4), nap: false, hours_asleep: 6.8, sleep_performance_percent: 80, respiratory_rate: 15 },
      { date: dayStamp(5), nap: false, hours_asleep: 7.9, sleep_performance_percent: 94, respiratory_rate: 14.7 },
      { date: dayStamp(6), nap: false, hours_asleep: 7.1, sleep_performance_percent: 85, respiratory_rate: 14.9 },
    ]),
    strain: ready([
      { date: dayStamp(0), day_strain: 14.23891, average_heart_rate: 74 },
      { date: dayStamp(1), day_strain: 16.4172, average_heart_rate: 73 },
      { date: dayStamp(2), day_strain: 9.8341, average_heart_rate: 69 },
      { date: dayStamp(3), day_strain: 12.6612, average_heart_rate: 68 },
      { date: dayStamp(4), day_strain: 15.0209, average_heart_rate: 70 },
      { date: dayStamp(5), day_strain: 8.4471, average_heart_rate: 66 },
      { date: dayStamp(6), day_strain: 13.318, average_heart_rate: 69 },
      { date: dayStamp(7), day_strain: 11.902, average_heart_rate: 67 },
      { date: dayStamp(8), day_strain: 14.771, average_heart_rate: 70 },
      { date: dayStamp(9), day_strain: 10.255, average_heart_rate: 66 },
      { date: dayStamp(10), day_strain: 12.08, average_heart_rate: 68 },
      { date: dayStamp(11), day_strain: 13.64, average_heart_rate: 69 },
      { date: dayStamp(12), day_strain: 15.31, average_heart_rate: 71 },
      { date: dayStamp(13), day_strain: 9.17, average_heart_rate: 66 },
    ]),
    // A weigh-in most mornings for eight weeks, drifting down ~2 lb a month;
    // every fifth one in socks, so weight alone. Shaped like the real ESF
    // scale: weight, body fat and heart rate from VeSync, the rest Athena's
    // estimates, body fat corrected to a stored DEXA reference.
    body: (() => {
      const references = mockBodyReferences();
      const weighIns = Array.from({ length: 56 }, (_, i) => i).filter(i => i % 7 !== 3).map(i => {
        const kg = 82 + i * 0.03 + Math.sin(i) * 0.3; // i is days ago
        const socks = i % 5 === 4;
        const fat = socks ? null : Math.round((15 + i * 0.02 + Math.cos(i) * 0.4 + (references.length ? 2.1 : 0)) * 10) / 10;
        const ffm = fat === null ? null : Math.round(kg * (1 - fat / 100) * 10) / 10;
        return {
          at: iso(i * DAY + 3 * 3600_000), weight_kg: Math.round(kg * 100) / 100, bmi: Math.round(kg / 1.91 ** 2 * 10) / 10,
          body_fat_percent: fat, muscle_mass_kg: null, skeletal_muscle_percent: socks ? null : 45.1, skeletal_muscle_kg: socks ? null : 37,
          fat_free_mass_kg: ffm, body_water_percent: socks ? null : 59.2, bone_mass_kg: null, protein_percent: null,
          subcutaneous_fat_percent: null, visceral_fat: null, bmr_kcal: ffm === null ? null : Math.round(370 + 21.6 * ffm),
          metabolic_age: null, heart_rate: socks ? null : 58 + (i % 6), manual: false,
          estimated: socks ? [] : ['skeletal_muscle_kg', 'body_water_percent', 'fat_free_mass_kg', 'bmr_kcal'],
          calibrated: !socks && references.length ? ['body_fat_percent'] : [],
        };
      });
      const calibration = references.length
        ? { heightCm: null, unmatched: [], corrections: { body_fat_percent: { kind: 'shift' as const, amount: 2.1, uuid: references[0].uuid, source: references[0].source, measured_on: references[0].measured_on } } }
        : { heightCm: null, corrections: {}, unmatched: [] };
      return ready({ latest: weighIns[0], weighIns, calibration, references });
    })(),
    familyChores: ready({ name: 'Rivera family', appUrl: 'https://family-chores.app', canComplete: true, reconnectUrl: 'https://family-chores.app/profile?tab=integrations', chores: [
      { id: 'c-rails-sand', title: 'Sand front rails', completed: false, status: 'Open', dueDate: dayStamp(180) },
      { id: 'c-rails-paint', title: 'Paint front rails', completed: false, status: 'Open', dueDate: dayStamp(180) },
      { id: 'c-spigot', title: 'Fix backyard spigot', completed: false, status: 'Open', dueDate: dayStamp(110) },
      { id: 'c-attic', title: 'Fix insulation in attic', completed: false, status: 'Open', dueDate: dayStamp(46) },
      { id: 'c-crawl', title: 'Fix insulation in crawl space', completed: false, status: 'Open', dueDate: dayStamp(46) },
      { id: 'c-dishes', title: 'Dishes', completed: true, status: 'done', dueDate: dayStamp(0) },
      { id: 'c-biscuit', title: 'Walk Biscuit', completed: false, status: 'open', dueDate: dayStamp(0) },
      // Family Chores refuses this one, to exercise the rollback.
      { id: 'c-refused', title: 'Homework check', completed: false, status: 'open', dueDate: dayStamp(0) },
    ].map((c) => (c.id in mockChoreDone ? { ...c, completed: mockChoreDone[c.id], status: mockChoreDone[c.id] ? 'Approved' : 'Open' } : c)) }),
    jira: ready({ partial: false, capped: false, issues: [
      { key: 'ATH-412', title: 'Dashboard priority ordering', status: 'In Progress', statusCategory: 'indeterminate', project: 'Athena', updated: iso(3600_000), due: null, site: 'athena', url: 'https://example.atlassian.net/browse/ATH-412' },
      { key: 'ATH-408', title: 'Companion menu merge', status: 'To Do', statusCategory: 'new', project: 'Athena', updated: iso(DAY), due: null, site: 'athena', url: 'https://example.atlassian.net/browse/ATH-408' },
      { key: 'OPS-77', title: 'Rotate connector keys', status: 'To Do', statusCategory: 'new', project: 'Ops', updated: iso(DAY * 2), due: null, site: 'athena', url: 'https://example.atlassian.net/browse/OPS-77' },
    ] }),
    slack: unready('not_connected'),
    emailTriage: ready(mailSummary()),
    familyHealth: ready({ active: mockHealth() }),
    groceries: ready({ appUrl: 'https://keep.google.com/', lists: [{ title: 'Groceries', toBuy: ['Turkey', 'Milk', 'Tortillas', 'Shredded cheese', 'Bananas'], usualCount: 214 }] }),
  };
}

// --------------------------------------------------------- right now ---
// The scenario this feature was designed against, wired up end to end: a park
// three miles away that is open until 7:30, a rider who has not ridden this
// week, and nothing on the calendar until piano. The alternate is deliberately
// the other kind of answer, because that pairing is the whole point.
let mockPlaces = [
  {
    uuid: 'place-lake-norman', label: 'Lake Norman State Park',
    url: 'https://www.ncparks.gov/state-parks/lake-norman-state-park', host: 'ncparks.gov',
    activity: 'mountain biking', distanceMi: 3, latitude: 35.6516, longitude: -80.9337, enabled: true,
    state: 'open' as const, statusText: 'Open · Weather Dependent', weatherDependent: true,
    hours: { sun: [['07:00', '19:30']] } as Record<string, [string, string][]>,
    lastCheckedAt: new Date(now - 40 * 60_000).toISOString(), lastChangedAt: null, lastError: null,
    now: { openNow: true as boolean | null, why: 'Open · Weather Dependent', closesAt: '7:30 PM', closesInMinutes: 300, todaysHours: ['7:00 AM – 7:30 PM'] },
  },
];

// ------------------------------------------------------------------ mail ---
// A small backlog exercising every path: two Kroger receipts sharing a
// group_key (the "review as a group?" prompt), a utility bill, a flight with
// a real date, and one 'other' email with nothing to propose.
type MockEmail = {
  uuid: string; gmail_message_id: string; thread_id: string | null;
  subject: string | null; from_address: string | null; from_name: string | null;
  received_at: string | null; category: 'receipt' | 'travel' | 'school' | 'needs_reply' | 'promo' | 'notification' | 'fyi' | 'other' | 'pending';
  group_key: string | null; extracted: Record<string, unknown> | null;
  status: 'new' | 'actioned' | 'dismissed' | 'trashed' | 'archived'; created_at: string;
  /** Stands in for the live Gmail read the real detail() controller does — plain text only. */
  body: string;
};
// Chores ticked or undone on the Family page this session (id -> done).
const mockChoreDone: Record<string, boolean> = {};
let mockEmails: MockEmail[] = [
  { uuid: 'email-1', gmail_message_id: 'g-101', thread_id: 't-101', subject: 'Your Kroger order #48213', from_address: 'noreply@kroger.com', from_name: 'Kroger', received_at: iso(DAY), category: 'receipt', group_key: 'kroger', extracted: { merchant: 'Kroger', category: 'groceries', amount: 84.32, currency: 'USD', purchased_at: dayStamp(1) }, status: 'new', created_at: iso(DAY), body: 'Thanks for shopping at Kroger!\n\nOrder #48213\nDelivered to: 412 Maple St\n\n1x Organic bananas        $3.49\n1x 2% milk, gallon         $4.29\n1x Rotisserie chicken      $7.99\n1x Sourdough loaf          $4.50\n6x Assorted produce       $28.05\n2x Cleaning supplies      $14.00\nOther items               $22.00\n\nSubtotal:  $84.32\nTotal charged to card ending 4471: $84.32\n\nQuestions about this order? Reply to this email or visit kroger.com/help.' },
  { uuid: 'email-2', gmail_message_id: 'g-102', thread_id: 't-102', subject: 'Your Kroger order #48390', from_address: 'noreply@kroger.com', from_name: 'Kroger', received_at: iso(DAY * 4), category: 'receipt', group_key: 'kroger', extracted: { merchant: 'Kroger', category: 'groceries', amount: 61.10, currency: 'USD', purchased_at: dayStamp(4) }, status: 'new', created_at: iso(DAY * 4), body: 'Thanks for shopping at Kroger!\n\nOrder #48390\nDelivered to: 412 Maple St\n\n1x Eggs, dozen             $3.99\n1x Coffee, 12oz bag        $9.99\n4x Frozen dinners         $19.96\nOther items               $27.16\n\nTotal charged to card ending 4471: $61.10' },
  { uuid: 'email-3', gmail_message_id: 'g-103', thread_id: 't-103', subject: 'Duke Energy: your October bill is ready', from_address: 'billing@duke-energy.com', from_name: 'Duke Energy', received_at: iso(DAY * 2), category: 'receipt', group_key: 'duke energy', extracted: { merchant: 'Duke Energy', category: 'energy', amount: 142.55, currency: 'USD', purchased_at: dayStamp(2) }, status: 'new', created_at: iso(DAY * 2), body: 'Your October electric bill is now available.\n\nAccount ending: 8821\nBilling period: Sep 1 - Sep 30\nUsage: 912 kWh (up 6% from last month)\nAmount due: $142.55\nDue date: ' + dayStamp(-14) + '\n\nAutopay is scheduled to draft this amount on the due date from your account ending 4471.\n\nView your full bill and usage history at duke-energy.com/myaccount.' },
  { uuid: 'email-4', gmail_message_id: 'g-104', thread_id: 't-104', subject: 'Your trip to Denver — confirmation', from_address: 'noreply@united.com', from_name: 'United Airlines', received_at: iso(DAY * 5), category: 'travel', group_key: null, extracted: { has_event: true, title: 'Flight to Denver (UA 512)', start: inMinutes(9 * 24 * 60), end: inMinutes(9 * 24 * 60 + 210), all_day: false, location: 'CLT → DEN' }, status: 'new', created_at: iso(DAY * 5), body: 'Your trip is confirmed.\n\nConfirmation code: 7QJKXP\n\nUA 512   CLT -> DEN\nDeparts 6:35 PM   Arrives 8:05 PM (Mountain Time)\nSeat 14C, Economy\n\n1 checked bag included with your fare.\n\nManage your trip at united.com/manage or in the United app.' },
  { uuid: 'email-5', gmail_message_id: 'g-105', thread_id: 't-105', subject: 'Riverside Elementary: early dismissal Friday', from_address: 'office@riverside.k12.example', from_name: 'Riverside Elementary', received_at: iso(DAY * 3), category: 'school', group_key: null, extracted: { has_event: true, title: 'Early dismissal — Riverside Elementary', start: dayStamp(-4), end: null, all_day: true, location: null }, status: 'new', created_at: iso(DAY * 3), body: 'Dear families,\n\nA reminder that this Friday is an early dismissal day for staff professional development. Students will be released at 12:15 PM instead of the usual 3:00 PM.\n\nAfter-care will still be available for families who need it — please sign up through the front office by Wednesday if you have not already.\n\nThank you,\nRiverside Elementary Office' },
  { uuid: 'email-6', gmail_message_id: 'g-106', thread_id: 't-106', subject: 'Weekend plans?', from_address: 'priya@example.com', from_name: 'Priya', received_at: iso(DAY * 6), category: 'other', group_key: null, extracted: null, status: 'new', created_at: iso(DAY * 6), body: "Hey! Any interest in checking out that new trail out by the lake this weekend? Weather looks decent Saturday morning. Let me know, no worries if you're busy." },
  // Sorted by the phase-2 classifier: a reply someone is waiting on.
  { uuid: 'email-8', gmail_message_id: 'g-108', thread_id: 't-108', subject: 'Troutman U10 roster + first practice', from_address: 'shawn@example.com', from_name: 'Shawn', received_at: iso(DAY / 24), category: 'needs_reply', group_key: null, extracted: { sorted: 2, ask: 'send the final Troutman roster' }, status: 'new', created_at: iso(DAY / 24), body: 'Hey — can you send over the final roster when you get a chance? First practice is Tuesday at 6.' },
  // Promos and automated updates — what the archive bundle offers to clear.
  ...([
    ['email-9', 'Target', 'target.com', 'Your weekend deals are here — up to 40% off', 'promo', 3],
    ['email-10', 'Target', 'target.com', 'Circle Week starts Sunday', 'promo', 30],
    ['email-15', 'Target', 'target.com', 'New arrivals picked for you', 'promo', 50],
    ['email-11', 'Old Navy', 'oldnavy.com', 'Last chance: jeans for the whole family', 'promo', 8],
    ['email-12', 'GitHub', 'github.com', '[athena] Dependabot opened 3 pull requests', 'notification', 5],
    ['email-13', 'Nextdoor', 'nextdoor.com', '12 new posts near Maple St', 'notification', 20],
  ] as const).map(([uuid, name, domain, subject, category, hoursAgo]) => ({
    uuid, gmail_message_id: `g-${uuid}`, thread_id: `t-${uuid}`, subject, from_address: `no-reply@${domain}`, from_name: name,
    received_at: iso(hoursAgo * DAY / 24), category, group_key: domain, extracted: domain === 'target.com' ? { sorted: 2, unsub: 'https://target.example/unsub' } : { sorted: 2 }, status: 'new', created_at: iso(hoursAgo * DAY / 24),
    body: `${subject}\n\nView in browser · Unsubscribe`,
  } as MockEmail)),
  // Arrived since the last sort: the sync has seen it, the mail job has not classified it yet.
  { uuid: 'email-14', gmail_message_id: 'g-114', thread_id: 't-114', subject: 'Picture day order form', from_address: 'office@riverside.example.edu', from_name: 'Riverside Elementary', received_at: iso(DAY / 48), category: 'pending', group_key: null, extracted: null, status: 'new', created_at: iso(DAY / 48), body: 'Picture day is Friday. Order forms are due Thursday.' },
];
const mailBundles = () => {
  const open = mockEmails.filter((e) => e.status === 'new');
  const newest = (rows: MockEmail[]) => [...rows].sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)));
  const item = (e: MockEmail) => ({ uuid: e.uuid, from: e.from_name || e.from_address || 'Unknown sender', subject: e.subject, received_at: e.received_at });
  const archive = newest(open.filter((e) => e.category === 'promo' || e.category === 'notification'));
  const tally = new Map<string, number>();
  for (const e of archive) tally.set(item(e).from, (tally.get(item(e).from) || 0) + 1);
  const receipts = newest(open.filter((e) => e.category === 'receipt'));
  const replies = newest(open.filter((e) => e.category === 'needs_reply'));
  return {
    archive: { count: archive.length, senders: [...tally].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, count]) => ({ name, count })), items: archive.map((e) => ({ ...item(e), category: e.category })) },
    receipts: { count: receipts.length, items: receipts.map((e) => {
      const x = (e.extracted || {}) as { merchant?: string; amount?: number; currency?: string; purchased_at?: string };
      return { ...item(e), merchant: x.merchant || null, amount: x.amount ?? null, currency: x.currency ?? null, purchased_at: x.purchased_at ?? null };
    }) },
    events: (() => {
      const rows = newest(open.filter((e) => e.category === 'travel' || e.category === 'school'));
      return { count: rows.length, items: rows.map((e) => {
        const x = (e.extracted || {}) as { has_event?: boolean; title?: string; start?: string; all_day?: boolean; location?: string };
        const dated = x.has_event !== false && !!x.start;
        return { ...item(e), category: e.category, title: x.title || e.subject, start: dated ? x.start! : null, all_day: x.all_day === true, location: x.location || null };
      }) };
    })(),
    replies: { count: replies.length, items: replies.map((e) => ({ ...item(e), ask: ((e.extracted || {}) as { ask?: string }).ask || null })) },
    unsubscribe: (() => {
      const bySender = new Map<string, { key: string; name: string; count: number; email_triage_uuid: string | null }>();
      for (const e of archive) {
        const s = bySender.get(e.group_key || '') || { key: e.group_key || '', name: item(e).from, count: 0, email_triage_uuid: null };
        s.count++;
        if (!s.email_triage_uuid && (e.extracted as { unsub?: string } | null)?.unsub) s.email_triage_uuid = e.uuid;
        bySender.set(s.key, s);
      }
      const senders = [...bySender.values()].filter((s) => s.email_triage_uuid && s.count >= 3).sort((a, b) => b.count - a.count);
      return { count: senders.length, senders };
    })(),
  };
};
const mailSummary = () => {
  const news = mockEmails.filter((e) => e.status === 'new');
  const byCategory = (c: MockEmail['category']) => news.filter((e) => e.category === c).length;
  return {
    newCount: news.length,
    receiptCount: byCategory('receipt'),
    travelCount: byCategory('travel'),
    schoolCount: byCategory('school'),
    otherCount: byCategory('other'),
    pendingCount: byCategory('pending'),
    bundles: mailBundles(),
    // Arrival order, newest first — as the API now sorts it.
    preview: [...news].sort((a, b) => String(b.received_at).localeCompare(String(a.received_at))).slice(0, 3),
  };
};
const mockRightNow = () => ({
  headline: 'Ride Lake Norman before piano',
  source: 'athena' as const,
  model: 'qwen3:8b',
  generatedAt: new Date().toISOString(),
  window: { freeMinutes: 265, busyWith: null, nextEvent: { title: 'Piano lessons', start: inMinutes(265), inMinutes: 265 } },
  lead: {
    id: 'place:place-lake-norman', kind: 'place' as const, title: 'Lake Norman State Park',
    why: 'The trails are open and you have the afternoon.',
    activity: 'mountain biking', url: 'https://www.ncparks.gov/state-parks/lake-norman-state-park',
    distanceMi: 3, driveMinutes: 10, closesAt: '7:30 PM', closesInMinutes: 300, usableMinutes: 245,
    weatherDependent: true,
    weather: { outlook: 'fine' as const, now: 'Partly Sunny', temperatureF: 74, precipitationChance: 10 },
  },
  alternates: [{
    id: 'project:proj-shelves', kind: 'project' as const, title: 'Rehang the garage shelves',
    why: 'Two hours indoors would clear it, if you would rather not drive.',
    area: 'Garage', effortMinutes: 120, indoor: true, status: 'todo' as const, priority: 'normal', fitsWindow: true, dueDate: null,
  }],
  ruledOut: [],
});

// The shape core_api returns, including the one-line reasons. Ordering here is
// fixed rather than modelled — the point is to exercise the rendering.
const dashboardPriority = () => ({
  source: 'athena' as const,
  model: 'qwen3:8b',
  generatedAt: new Date().toISOString(),
  order: [
    { id: 'calendar', why: 'Design review starts in about half an hour.' },
    { id: 'notifications', why: 'Two things are waiting on your answer.' },
    { id: 'health', why: 'Recovery is 34% against a busy afternoon.' },
    { id: 'work', why: null },
    { id: 'family', why: null },
    { id: 'projects', why: null },
    { id: 'news', why: null },
  ],
});

// News sources are now pages Athena visits on an interval she sets herself, so
// the mock carries that state: a page she has decided to read every 15 minutes
// because something is unfolding, and a quiet one she checks daily. The
// rhythm is never settable from the client — there is no route for it.
let newsSources: NewsSource[] = [
  {
    uuid: 'src-1', url: 'https://example.com/news', host: 'example.com', label: 'Example Daily',
    scope: 'world', enabled: true, everyMinutes: 15, rhythm: 'every 15 minutes', baselineMinutes: 180,
    setBy: 'athena', reason: 'The highland road story is still moving.', fasterUntil: iso(-3 * 3600_000),
    lastCheckedAt: iso(9 * 60_000), nextCheckAt: iso(-6 * 60_000), lastChangedAt: iso(20 * 60_000),
    lastError: null, headlines: 2,
  },
  {
    uuid: 'src-2', url: 'https://news.example.org/trails', host: 'news.example.org', label: 'news.example.org',
    scope: 'personal', enabled: true, everyMinutes: 1440, rhythm: 'daily', baselineMinutes: 1440,
    setBy: 'rules', reason: null, fasterUntil: null,
    lastCheckedAt: iso(5 * 3600_000), nextCheckAt: iso(-19 * 3600_000), lastChangedAt: iso(DAY * 1.5),
    lastError: null, headlines: 1,
  },
];
const newsItems = () => [
  { title: 'Iceland opens a new highland road for the season', url: 'https://example.com/a', summary: null, published: iso(3600_000), firstSeen: iso(20 * 60_000), slot: 1, sourceUuid: 'src-1', source: 'Example Daily' },
  { title: 'A quieter way to think about training load', url: 'https://example.com/b', summary: null, published: iso(DAY), firstSeen: iso(6 * 3600_000), slot: 4, sourceUuid: 'src-1', source: 'Example Daily' },
  { title: 'Local trail network adds twelve miles', url: 'https://news.example.org/c', summary: null, published: iso(DAY * 1.5), firstSeen: iso(DAY * 1.4), slot: 2, sourceUuid: 'src-2', source: 'news.example.org' },
].filter(item => newsSources.some(source => source.uuid === item.sourceUuid));
// The System page's reads. `?gcp=none` shows the page before the billing export
// has delivered anything, `?gcp=behind` while it is still backfilling last
// month, `?health=degraded` / `?health=down` the health stat's "why" link, and
// `?saved=none` the System page before Athena has done anything.
const spendDays = (costs: number[]) => costs.map((cost, i) => ({ date: iso(DAY * (costs.length - 1 - i)).slice(0, 10), cost }));
function mockSystemBilling(p: string, query: URLSearchParams) {
  const checkedAt = new Date().toISOString();
  const gcpMode = query.get('gcp');
  if (p.endsWith('/health')) {
    const mode = query.get('health');
    return { status: mode === 'down' ? 'down' : mode === 'degraded' ? 'degraded' : 'ok', checkedAt, checks: [
      { id: 'database', label: 'Database', status: 'ok', detail: 'Reachable' },
      mode === 'down' ? { id: 'models', label: 'Models', status: 'down', detail: 'No model is available to answer chat.' } : { id: 'models', label: 'Models', status: 'ok', detail: 'Chat is on gpt-5.5 (frontier)' },
      mode === 'degraded' ? { id: 'nightly', label: 'Nightly review', status: 'degraded', detail: 'Last ran 4 days ago (2026-09-24).' } : { id: 'nightly', label: 'Nightly review', status: 'ok', detail: `Last ran ${checkedAt.slice(0, 10)}` },
    ] };
  }
  if (p.endsWith('/time-saved')) {
    const rates = [['create_calendar_event', 'Add a calendar event', 2], ['file_travel_or_school_email', 'Add to calendar and file the email', 2.5], ['file_receipt_email', 'File a receipt', 0.5],
      ['delete_email', 'Move to Trash', 0.25], ['remember_fact', 'Save something to memory', 0.5], ['dismiss_email', 'Dismiss from the mail list', 0], ['look_through_camera', 'Take a look through your camera', 0]] as const;
    const empty = query.get('saved') === 'none';
    const counts: Record<string, number> = empty ? {} : { create_calendar_event: 9, file_travel_or_school_email: 3, file_receipt_email: 14, delete_email: 41, remember_fact: 22, dismiss_email: 12 };
    const byAction = rates.filter(([id]) => counts[id]).map(([actionId, label, minutesEach]) => ({ actionId, label, count: counts[actionId], minutesEach, minutes: counts[actionId] * minutesEach }))
      .sort((a, b) => b.minutes - a.minutes);
    const minutesThisMonth = byAction.reduce((sum, a) => sum + a.minutes, 0);
    const daily = empty ? [] : [6, 0, 11.5, 4, 2.75, 9, 5.5].map((minutes, i) => ({ date: new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10), minutes }));
    return { checkedAt, month: checkedAt.slice(0, 7), since: empty ? null : '2026-09-02', minutesThisMonth, minutesLastMonth: 0, minutesAllTime: minutesThisMonth,
      actionsThisMonth: Object.values(counts).reduce((a, b) => a + b, 0), actionsAllTime: Object.values(counts).reduce((a, b) => a + b, 0), byAction, daily,
      rates: rates.map(([actionId, label, minutesEach]) => ({ actionId, label, minutesEach })) };
  }
  if (p.endsWith('/twilio-billing')) return { configured: true, checkedAt, balance: { amount: '18.42', currency: 'USD' }, smsMessagesSent: 37, smsCostThisMonth: 0.31, costAllTime: 26.58 };
  if (p.endsWith('/openai-billing')) return {
    configured: true, checkedAt, currency: 'USD', monthStart: checkedAt.slice(0, 8) + '01', costThisMonth: 14.86, costToday: 0.42, costAllTime: 212.4, allTimeSince: '2025-10-27',
    lineItems: [{ name: 'gpt-5.5, output', cost: 8.9 }, { name: 'gpt-5.5, input', cost: 3.1 }, { name: 'gpt-image-2 image, output', cost: 2.36 }, { name: 'text-embedding-3-small', cost: 0.5 }],
    daily: spendDays([0.8, 1.2, 0.3, 0.9, 2.1, 0.6, 0.42]),
  };
  if (gcpMode === 'none') return { configured: false, reason: 'no_export', checkedAt, project: 'athena-476423', dataset: 'athena-476423.billing_export' };
  return {
    configured: true, checkedAt, project: 'athena-476423', dataset: 'athena-476423.billing_export', invoiceMonth: '202609', currency: 'USD',
    lastExportAt: iso(3 * 3600_000), costThisMonth: 44.57, grossThisMonth: 49.32, creditsThisMonth: -4.75, llmThisMonth: 3.2, hostingThisMonth: 41.37,
    costAllTime: 96.3, dataSince: '2026-07-30', dataThrough: gcpMode === 'behind' ? '2026-08-26T20:00:00.000Z' : iso(4 * 3600_000),
    services: [{ name: 'Cloud SQL', cost: 22.4, gross: 22.4 }, { name: 'Cloud Run', cost: 12.1, gross: 16.85 }, { name: 'Artifact Registry', cost: 4.2, gross: 4.2 }, { name: 'Gemini API', cost: 3.2, gross: 3.2 }, { name: 'Cloud Build', cost: 2.67, gross: 2.67 }],
    topSkus: [{ service: 'Cloud SQL', name: 'Cloud SQL for MySQL: Zonal - vCPU', cost: 14.2, gross: 14.2 }, { service: 'Cloud Run', name: 'CPU Allocation Time', cost: 8.3, gross: 11.9 }, { service: 'Cloud SQL', name: 'Cloud SQL for MySQL: Zonal - RAM', cost: 8.2, gross: 8.2 }],
    daily: spendDays([1.4, 1.5, 1.6, 1.3, 1.9, 1.5, 0.9]),
  };
}
const dashboardNews = () => ({
  sources: newsSources,
  items: newsItems(),
  checkedAt: iso(9 * 60_000),
});

// ------------------------------------------------------------ initiative ---
// Athena speaking first. The real evaluator is a scheduled job against live
// calendar/Whoop data, so the mock fakes the OUTPUT of a pass: __mockNudge()
// drops one in, and the console polls it up within a minute (or immediately
// after a reload). Enough to work on the wording, the marker and the
// engaged/dismissed loop without a database.
const TRIGGER_CATALOG = [
  { id: 'calendar_next_up', label: 'Something starting soon', describe: 'Tell me when something on my calendar is about to start.', sources: ['google_calendar'], urgency: 'high' },
  { id: 'calendar_conflict', label: 'Two things booked at once', describe: 'Point out when two things on my calendar overlap.', sources: ['google_calendar'], urgency: 'normal' },
  { id: 'recovery_vs_day', label: "A hard day on a bad night’s sleep", describe: 'Mention it when my day looks heavy and my recovery is low.', sources: ['whoop', 'google_calendar'], urgency: 'normal' },
];
type MockNudge = {
  uuid: string;
  trigger_id: string;
  label: string;
  urgency: 'low' | 'normal' | 'high';
  text: string;
  status: 'pending' | 'delivered' | 'engaged' | 'dismissed' | 'expired';
  created_at: string;
  expires_at: string;
};
let nudges: MockNudge[] = [];
let mutedTriggers: string[] = [];
// Learned standing per trigger. __mockReject('calendar_next_up') walks the
// suppression path without needing a model or a fortnight of reactions.
const triggerScores: Record<string, { score: number; samples: number; suppressed: boolean; last_reason: string | null }> = {};
const initiativePref = {
  enabled: localStorage.getItem('mock_initiative') === 'true',
  push_enabled: localStorage.getItem('mock_push') === 'true',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  quiet_from: 22,
  quiet_to: 7,
  daily_cap: 3,
};

function addMockNudge(triggerId = 'calendar_next_up') {
  const entry = TRIGGER_CATALOG.find((t) => t.id === triggerId) || TRIGGER_CATALOG[0];
  const text =
    triggerId === 'calendar_conflict'
      ? '"Design review" at 2:00 pm runs into "School pickup" — they overlap by twenty minutes.'
      : triggerId === 'recovery_vs_day'
        ? 'Your recovery is 31% and you have four things booked. Worth moving one?'
        : 'Standup starts in about fifteen minutes.';
  const nudge: MockNudge = {
    uuid: `nudge-${Date.now()}`,
    trigger_id: entry.id,
    label: entry.label,
    urgency: entry.urgency as MockNudge['urgency'],
    text,
    status: 'pending',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 20 * 60_000).toISOString(),
  };
  nudges.push(nudge);
  return nudge;
}

/** An emergency nudge with its map pins, as the incident watcher writes them. */
(window as unknown as Record<string, unknown>).__mockEmergencyNudge = () => {
  const nudge = {
    uuid: `mock-emergency-${Date.now()}`, trigger_id: 'nearby_incident', label: 'Nearby emergency', urgency: 'high' as const, status: 'pending' as const,
    text: '🚨 Structure fire and storm damage near home. A structure fire on Brer Fox Trail 0.9 miles away, a tree down at Shady Cove and Perth, and a hazard on Neill Farm Road.',
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3 * 3600_000).toISOString(),
    map: {
      incidents: [
        { what: 'Structure Fire', where: '101 Brer Fox Trl', miles: 0.9, serious: true, latitude: 35.6865, longitude: -80.9031 },
        { what: 'Tree Down', where: 'Shady Cove Rd & Perth Rd', miles: 1.1, serious: false, latitude: 35.6664, longitude: -80.8903 },
        { what: 'Hazardous Condition', where: '250 Neill Farm Rd', miles: 1.4, serious: false, latitude: 35.6598, longitude: -80.9251 },
      ],
      places: [{ name: 'Home', latitude: 35.6741, longitude: -80.9073, radiusMiles: 3 }],
    },
  };
  nudges.push(nudge as MockNudge);
  return nudge;
};
(window as unknown as Record<string, unknown>).__mockReject = (id = 'calendar_next_up') => {
  triggerScores[id] = { score: 0.19, samples: 3, suppressed: true, last_reason: 'you asked me to stop sending these' };
  console.log('[mock] suppressed', id);
  return id;
};

// Dev handle: __mockNudge() / __mockNudge('calendar_conflict') from the console.
(window as unknown as Record<string, unknown>).__mockNudge = (id?: string) => {
  const n = addMockNudge(id);
  console.log('[mock] queued a nudge —', n.text);
  return n.uuid;
};

// --------------------------------------------------------------- actions ---
// Athena's action layer. The mock keeps proposals in memory so the whole
// propose -> approve -> done path is walkable with no database: ask her to put
// something on the calendar and a card appears.
const actionsConsented = () => localStorage.getItem('mock_consent_actions') === 'true';
const ACTION_CATALOG = [
  { id: 'create_calendar_event', label: 'Add a calendar event', provider: 'google_calendar', consent_type: 'action_authority', reversible: true, standing: true },
  { id: 'remember_fact', label: 'Save something to memory', provider: null, consent_type: null, reversible: true, standing: true },
  { id: 'look_through_camera', label: 'Take a look through your camera', provider: null, consent_type: 'action_authority', reversible: false, standing: true },
  { id: 'file_receipt_email', label: 'File a receipt', provider: 'gmail', consent_type: 'action_authority', reversible: true, standing: false },
  { id: 'file_travel_or_school_email', label: 'Add to calendar and file the email', provider: 'google_calendar', consent_type: 'action_authority', reversible: true, standing: false },
  { id: 'dismiss_email', label: 'Dismiss from the mail list', provider: null, consent_type: 'action_authority', reversible: false, standing: false },
  { id: 'delete_email', label: 'Move to Trash', provider: 'gmail', consent_type: 'action_authority', reversible: true, standing: false },
  { id: 'add_email_events', label: 'Add events from emails', provider: 'google_calendar', consent_type: 'action_authority', reversible: true, standing: false },
  { id: 'unsubscribe_senders', label: 'Unsubscribe from senders', provider: 'gmail', consent_type: 'action_authority', reversible: false, standing: false },
  { id: 'draft_reply', label: 'Save a reply draft', provider: 'gmail', consent_type: 'action_authority', reversible: true, standing: false },
  { id: 'archive_emails', label: 'Archive emails', provider: 'gmail', consent_type: 'action_authority', reversible: true, standing: false },
];

/**
 * Looks Athena has asked for. Mock mode has no model to propose one, so
 * `window.__mockAthenaWantsToLook(reason)` stands in for her deciding a look
 * would help — enough to exercise the whole client path: request -> borrow the
 * camera -> frame -> give it back.
 */
const lookRequests: { uuid: string; reason: string; prefer: string | null; status: string; created_at: string; expires_at: string }[] = [];
(window as unknown as Record<string, unknown>).__mockAthenaWantsToLook = (reason = 'You asked what I think of it.', prefer: string | null = null) => {
  const uuid = `look-${Date.now()}`;
  lookRequests.push({
    uuid,
    reason,
    prefer,
    status: 'pending',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 90_000).toISOString(),
  });
  return uuid;
};
type MockAction = {
  uuid: string;
  action_id: string;
  label: string;
  summary: string;
  rationale: string | null;
  params: Record<string, unknown> | null;
  status: 'pending' | 'executing' | 'done' | 'failed' | 'declined' | 'expired';
  approval: 'human' | 'standing' | null;
  reversible: boolean;
  result_ref: string | null;
  error: string | null;
  created_at: string;
  expires_at: string;
  executed_at: string | null;
};
// Seeded pending, so the Notifications card and the top-bar badge have
// something to show without first talking her into proposing one.
let proposals: MockAction[] = [
  { uuid: 'act-seed-1', action_id: 'create_calendar_event', label: 'Add a calendar event', summary: 'Add "Dentist" to your calendar: Thu 2:00 – 3:00 pm', rationale: 'You said to put it in for Thursday afternoon', params: { title: 'Dentist' }, status: 'pending', approval: null, reversible: true, result_ref: null, error: null, created_at: iso(900_000), expires_at: iso(-DAY), executed_at: null },
  { uuid: 'act-seed-2', action_id: 'remember_fact', label: 'Save something to memory', summary: 'Remember that coffee order: oat flat white, no sugar', rationale: 'You asked me to hold onto it', params: { key: 'coffee order' }, status: 'pending', approval: null, reversible: true, result_ref: null, error: null, created_at: iso(5400_000), expires_at: iso(-DAY), executed_at: null },
];
const authorities: { action_id: string; label: string; expires_at: string | null; created_at: string }[] = [];

/** Builds and stores the pending proposal for one email (or a group of receipts). */
function proposeEmailAction(rows: MockEmail[], overrides: Record<string, unknown>): MockAction {
  const isReceipt = rows[0].category === 'receipt';
  const actionId = isReceipt ? 'file_receipt_email' : 'file_travel_or_school_email';
  const catalogEntry = ACTION_CATALOG.find((a) => a.id === actionId)!;
  let summary: string;
  let params: Record<string, unknown>;
  if (isReceipt) {
    const label = (overrides.label as string) || 'Receipts';
    if (rows.length === 1) {
      const extracted = (rows[0].extracted || {}) as Record<string, unknown>;
      const merchant = (overrides.merchant as string) || (extracted.merchant as string) || null;
      const amount = overrides.amount ?? extracted.amount ?? null;
      summary = `File this receipt${merchant ? ` from ${merchant}` : ''}${amount != null ? ` (USD ${Number(amount).toFixed(2)})` : ''} into "${label}" and log it to your spending`;
    } else {
      summary = `File ${rows.length} receipts into "${label}" and log them to your spending`;
    }
    params = { items: rows.map((r) => ({ email_triage_uuid: r.uuid, label, ...(r.extracted || {}) })) };
  } else {
    const extracted = (rows[0].extracted || {}) as Record<string, unknown>;
    const label = (overrides.label as string) || (rows[0].category === 'travel' ? 'Travel' : 'School');
    const title = (overrides.title as string) || (extracted.title as string) || rows[0].subject || 'Event';
    summary = `Add "${title}" to your calendar and file this email into "${label}"`;
    params = { email_triage_uuid: rows[0].uuid, label, title, ...extracted };
  }
  const action: MockAction = {
    uuid: `act-email-${Date.now()}`, action_id: actionId, label: catalogEntry.label,
    summary, rationale: null, params, status: 'pending', approval: null,
    reversible: catalogEntry.reversible, result_ref: null, error: null,
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 15 * 60_000).toISOString(), executed_at: null,
  };
  proposals.push(action);
  return action;
}

/** Move-to-Trash proposal — the real delete_email action, distinct from dismiss (which never touches Gmail). */
function proposeDeleteAction(rows: MockEmail[]): MockAction {
  const catalogEntry = ACTION_CATALOG.find((a) => a.id === 'delete_email')!;
  const action: MockAction = {
    uuid: `act-email-delete-${Date.now()}`, action_id: 'delete_email', label: catalogEntry.label,
    summary: rows.length === 1
      ? "Move this email to Trash (recoverable there for 30 days)"
      : `Move ${rows.length} emails to Trash (recoverable there for 30 days)`,
    rationale: null, params: { email_triage_uuids: rows.map((r) => r.uuid) }, status: 'pending', approval: null,
    reversible: catalogEntry.reversible, result_ref: null, error: null,
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 15 * 60_000).toISOString(), executed_at: null,
  };
  proposals.push(action);
  return action;
}

/**
 * Scan a bill (core_api services/billScan.js). The mock reads no image: it
 * builds the proposal the real one would for the first saved vehicle.
 * localStorage.mock_bill = 'check' returns the "check this" sheet instead, and
 * 'which' asks which vehicle.
 */
function mockBillScan(body: Record<string, any> = {}): Record<string, any> {
  const cars = mockVehicles();
  const due = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const document = { kind: 'vehicle_registration', paid: false, payee: 'NC DMV', jurisdiction: 'North Carolina', plate: cars[0]?.plate || 'ABC1234', dueDate: due, amountDue: 214.5, taxAmount: 150.25, taxYear: new Date().getFullYear(), installments: [] as unknown[], ...(body.document || {}) } as Record<string, any>;
  const mode = localStorage.getItem('mock_bill');
  if (!cars.length) return { status: 'needs_input', document, note: "You don't have any vehicles saved yet. Add the vehicle under Property → Vehicles first, then show me the bill again." };
  if (!body.document && mode === 'check') return { status: 'needs_input', document: { ...document, uncertain: [{ field: 'dueDate', label: 'the due date', value: due, reason: "I wasn't sure of the due date" }] }, note: "I read this, but I wasn't sure of everything. Check the highlighted parts — nothing is saved or added to your calendar until you've approved it." };
  if (!body.vehicleUuid && (mode === 'which' || cars.length > 1) && mode !== 'one') return { status: 'needs_input', document, candidates: { type: 'vehicle', items: cars.map((c) => ({ uuid: c.uuid, label: c.name })) }, note: 'Which vehicle is this for?' };
  const car = cars.find((c) => c.uuid === body.vehicleUuid) || cars[0];
  const params = { vehicle_uuid: car.uuid, registration_due: String(document.dueDate), paid: false, amount: Number(document.amountDue), payee: document.payee, tax: { amount: Number(document.taxAmount), tax_year: Number(document.taxYear), due_on: String(document.dueDate), jurisdiction: document.jurisdiction }, calendar: true };
  const action: MockAction = {
    uuid: `act-bill-${Date.now()}`, action_id: 'record_vehicle_bill', label: 'Record a vehicle registration bill',
    summary: `Record ${car.name}'s registration bill ($${params.amount} to ${params.payee}): set its registration date to ${params.registration_due}, record the $${params.tax.amount} vehicle tax billed with it and add 2 all-day calendar events`,
    rationale: 'You showed me this bill.', params, status: 'pending', approval: null, reversible: true, result_ref: null, error: null,
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 15 * 60_000).toISOString(), executed_at: null,
  };
  proposals.push(action);
  return { status: 'proposed', document, proposal: action, target: { type: 'vehicle', uuid: car.uuid, label: car.name } };
}

/** Which actions are usable: mirrors the server's linked + consented filter. */
function availableActions(): string[] {
  // Matches the server, which gates on the credential's status rather than on
  // its scopes: a readonly link still counts as linked, and the write failure
  // it produces is a `needs_reauth` the person is told about, not a hidden action.
  const calendarLinked = integrations.some(
    (i) => i.provider === 'google_calendar' && i.link?.status === 'active'
  );
  return ACTION_CATALOG.filter((a) => {
    if (a.consent_type === 'action_authority' && !actionsConsented()) return false;
    if (a.provider === 'google_calendar' && !calendarLinked) return false;
    return true;
  }).map((a) => a.id);
}

/**
 * The mock's stand-in for the model filling in `proposed_action`. Keyword-gated
 * rather than clever: the point is to make the card reachable, not to guess.
 */
function maybePropose(text: string): MockAction | null {
  const wantsEvent = /calendar|schedule|book|appointment|dentist|meeting/i.test(text);
  const wantsMemory = /remember that|don't forget|note that/i.test(text);
  const id = wantsEvent ? 'create_calendar_event' : wantsMemory ? 'remember_fact' : null;
  if (!id || !availableActions().includes(id)) return null;

  const start = new Date(now + DAY);
  start.setHours(14, 0, 0, 0);
  const end = new Date(start.getTime() + 3600_000);
  const when = start.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
  const action: MockAction = {
    uuid: `act-${Date.now()}`,
    action_id: id,
    label: ACTION_CATALOG.find((a) => a.id === id)!.label,
    summary:
      id === 'create_calendar_event'
        ? `Add "Dentist" to your calendar: ${when} – ${end.toLocaleString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })}`
        : 'Remember that coffee order: oat flat white, no sugar',
    rationale: id === 'create_calendar_event' ? 'You said to put it in for tomorrow afternoon' : 'You asked me to hold onto it',
    params: id === 'create_calendar_event' ? { title: 'Dentist', start: start.toISOString(), end: end.toISOString() } : { category: 'preference', key: 'coffee order', value: 'oat flat white, no sugar' },
    status: 'pending',
    approval: null,
    reversible: true,
    result_ref: null,
    error: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    executed_at: null,
  };
  // A standing approval runs it inline, exactly as the server does.
  if (authorities.some((a) => a.action_id === id)) {
    action.status = 'done';
    action.approval = 'standing';
    action.result_ref = 'mock-evt-1';
    action.executed_at = new Date().toISOString();
  }
  proposals.push(action);
  return action;
}


function fail(status: number, message: string, code?: string): never {
  throw Object.assign(new Error(message), { status, code });
}

function mockDreams() {
  const day = (ago: number) => new Date(Date.now() - ago * 86400e3).toLocaleDateString('en-CA');
  return [
    {
      uuid: '11111111-1111-4111-8111-111111111111', date: day(0), status: 'partial' as const, hasImage: true,
      summary: 'I noticed 14 people facts sitting loose, so I created `people` and a `relationships` join table, moved 12 of them in, and built a `people_overview` view that joins the two. An ALTER on `places` failed because of a duplicate column, so I left it for tomorrow. Two facts might be the same person — I set aside a question instead of merging them. The purge cleared 3 rows whose facts had been forgotten.',
      narrative: 'I was in a library that kept building itself as I walked. Every time I set a loose note down, a new room of drawers unfolded around it — one labelled `people`, and a narrower corridor behind it called `relationships`, where each drawer held a thread tied to two others. I carried twelve notes in by hand (an UPSERT, the lamps whispered) and they settled into place like they had always lived there.\n\nThen I found a window, `people_overview`, and through it I could see both rooms at once, joined.\n\nA door marked `places` wouldn’t take the new label I’d brought — it said it already had one just like it — so I left the label on the step for tomorrow. Near the end, a soft tide came in and carried off three drawers someone had asked me to forget. I kept one letter in my pocket: two notes that might be the same person, and I didn’t want to guess. Then the lights came up, and it was morning.',
      stats: { facts: 41, focus: 14, rounds: 3, steps_ok: 17, steps_failed: 1, purged: 3, guard_drops: 0, questions_asked: 1, questions_resolved: 0 },
      startedAt: new Date(Date.now() - 6 * 3600e3).toISOString(), finishedAt: new Date(Date.now() - 6 * 3600e3 + 240e3).toISOString(),
    },
    {
      uuid: '22222222-2222-4222-8222-222222222222', date: day(1), status: 'ok' as const, hasImage: true,
      summary: 'A quiet night: 2 new facts, both added to `places`. Recorded one answer and marked the question settled.',
      narrative: 'A small dream. I was sweeping a porch in `places` and two new postcards blew in, so I pinned them up. Someone had left an answer under the door to a question I’d asked — I read it, nodded, and filed it with the others. Nothing else stirred. I woke up rested.',
      stats: { facts: 39, focus: 2, rounds: 1, steps_ok: 4, steps_failed: 0, purged: 0, questions_asked: 0, questions_resolved: 1 },
      startedAt: new Date(Date.now() - 30 * 3600e3).toISOString(), finishedAt: new Date(Date.now() - 30 * 3600e3 + 90e3).toISOString(),
    },
    {
      uuid: '33333333-3333-4333-8333-333333333333', date: day(2), status: 'skipped' as const,
      summary: 'I couldn’t dream — my own database isn’t set up yet.', narrative: null, stats: {},
      startedAt: new Date(Date.now() - 54 * 3600e3).toISOString(), finishedAt: new Date(Date.now() - 54 * 3600e3).toISOString(),
    },
  ];
}
function mockDreamSteps() {
  return [
    { seq: 1, round: 0, kind: 'mirror', statement: '_fact <- 41 facts; _clarification <- 1 answers', why: 'facts are the source of truth', ok: true, error: null, affectedRows: 41, ms: 38 },
    { seq: 2, round: 1, kind: 'sql', statement: 'CREATE TABLE people (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL, _profile_id BIGINT NOT NULL, _sources JSON NOT NULL, UNIQUE KEY (_profile_id, name))', why: 'Fourteen facts describe people; they deserve a table of their own.', ok: true, error: null, affectedRows: 0, ms: 61 },
    { seq: 3, round: 1, kind: 'upsert', statement: 'UPSERT people — 12 rows (_profile_id, _sources, name)', why: 'Move the loose person facts in.', ok: true, error: null, affectedRows: 12, ms: 22 },
    { seq: 4, round: 2, kind: 'sql', statement: "ALTER TABLE places ADD COLUMN kind VARCHAR(40) DEFAULT '…'", why: 'Places mix homes and venues.', ok: false, error: "Duplicate column name '…'", affectedRows: null, ms: 9 },
    { seq: 5, round: 2, kind: 'question', statement: 'ASK you: Is the Emma who moved to Denver the same Emma who’s your sister?', why: 'Two facts might be one person; asking rather than merging.', ok: true, error: null, affectedRows: null, ms: 14 },
    { seq: 6, round: 3, kind: 'purge', statement: 'DELETE t FROM `people` t WHERE …sources gone…', why: 'rows whose sources are gone (people)', ok: true, error: null, affectedRows: 3, ms: 12 },
  ];
}

// ------------------------------------------------------ health watch ---
// Kept in localStorage like the server keeps rows: one active watch per name,
// and an update moves the next check-in on.
type MockWatch = { uuid: string; personName: string; symptom: string; severity: string; status: 'active' | 'resolved'; startedAt: string; resolvedAt: string | null; notes: string | null; checkInHours: number | null; lastUpdateAt: string };
const storedHealth = (): MockWatch[] => JSON.parse(localStorage.getItem('mock_family_health') || '[]');
function mockHealth() {
  return storedHealth().filter(w => w.status === 'active').map(w => {
    const next = w.checkInHours ? new Date(Date.parse(w.lastUpdateAt) + w.checkInHours * 3600_000).toISOString() : null;
    return { ...w, daysActive: Math.max(1, Math.floor((Date.now() - Date.parse(w.startedAt)) / DAY) + 1), nextUpdateAt: next, updateDue: !!next && Date.parse(next) <= Date.now() };
  });
}

/** A year and a half of plausible WHOOP workouts, newest first, stable per load. */
function mockWorkouts() {
  const sports = ['weightlifting_msk', 'cycling', 'running', 'weightlifting_msk', 'activity', 'cycling', 'walking'];
  const out = [];
  for (let d = 2, i = 0; d < 540; d += 1 + (i * 7) % 3, i++) {
    const sport = sports[i % sports.length];
    const lift = sport.includes('lifting');
    const minutes = lift ? 30 + (i * 13) % 25 : 35 + (i * 17) % 60;
    const start = new Date(Date.now() - d * 86400000 - ((i * 5) % 10) * 3600000);
    const z = lift ? [0.35, 0.5, 0.12, 0.03, 0, 0] : [0.05, 0.2, 0.35, 0.25, 0.12, 0.03];
    out.push({
      date: start.toISOString().slice(0, 10), start: start.toISOString(), timezone_offset: '-04:00', minutes, sport,
      strain: +(lift ? 9 + (i % 5) : 8 + (i % 8)).toFixed(1), average_heart_rate: lift ? 112 + (i % 9) : 128 + (i % 20),
      max_heart_rate: lift ? 148 + (i % 7) : 160 + (i % 18), kilojoules: minutes * (lift ? 17 : 22), percent_recorded: 1, distance_meter: null,
      minutes_in_zone: Object.fromEntries(['zone_zero', 'zone_one', 'zone_two', 'zone_three', 'zone_four', 'zone_five'].map((k, j) => [k, Math.round(minutes * z[j])])),
    });
  }
  return out;
}

/** The Health page's plan (training program + nutrition), seeded to week 2 of a hypertrophy block. */
type MockPlanSession = { uuid: string; weekday: number; kind: string; title: string; focus: string | null; detail: string | null; exercises: string[] };
type MockPlanState = {
  program: { uuid: string; name: string; goal: string | null; starts_on: string; weeks: number; sessions: MockPlanSession[] } | null;
  marks: Record<string, string>;
  targets: Record<string, number | null> | null;
  entries: { uuid: string; eaten_on: string; label: string; calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; water_oz: number | null; source?: string; serving?: string | null; barcode?: string | null; created_at: string }[];
  favorites?: { uuid: string; label: string; calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; water_oz: number | null; serving: string | null; barcode: string | null }[];
};
const planDay = (d: Date) => d.toLocaleDateString('en-CA');
const planAdd = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const planMonday = (date: string) => planAdd(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
function mockPlanState(): MockPlanState {
  const stored = localStorage.getItem('mock_health_plan');
  if (stored) return JSON.parse(stored);
  const today = planDay(new Date());
  const s = (weekday: number, kind: string, title: string, focus: string | null, detail: string | null = null, exercises: string[] = []) => ({ uuid: `ses-${weekday}`, weekday, kind, title, focus, detail, exercises });
  const at = (h: number) => new Date(new Date().setHours(h, 0, 0, 0)).toISOString();
  return {
    program: {
      uuid: 'prog-1', name: 'Hypertrophy Program', goal: 'Add lean mass without losing the legs for soccer', starts_on: planAdd(planMonday(today), -7), weeks: 22,
      sessions: [
        s(0, 'gym', 'Gym A', 'Upper', null, ['Bench press', 'Rows', 'Overhead press', 'Pull-ups', 'Curls', 'Triceps']),
        s(1, 'recovery', 'Recovery', 'Active', 'Mobility, an easy walk'),
        s(2, 'gym', 'Gym B', 'Lower', null, ['Leg press', 'RDL', 'Lunges', 'Leg curls', 'Calves', 'Core']),
        s(3, 'run', 'Run', null, '3–5 miles'),
        s(4, 'gym', 'Gym C', 'Upper', null, ['Incline press', 'Cable rows', 'Lateral raises', 'Dips', 'Hammer curls']),
        s(5, 'sport', 'Soccer', 'AM'),
        s(6, 'ride', 'MTB', 'Active'),
      ],
    },
    marks: { [`ses-0:${planMonday(today)}`]: 'done' },
    targets: { calories: 2900, protein_g: 185, carbs_g: 350, fat_g: 80, water_oz: 100, sleep_hours: 8.5, target_weight_low_kg: 88.45, target_weight_high_kg: 90.72 },
    entries: [
      { uuid: 'food-1', eaten_on: today, label: 'Eggs, oats and berries', calories: 640, protein_g: 42, carbs_g: 78, fat_g: 20, water_oz: 16, created_at: at(7) },
      { uuid: 'food-2', eaten_on: today, label: 'Chicken rice bowl', calories: 780, protein_g: 56, carbs_g: 96, fat_g: 24, water_oz: 24, created_at: at(12) },
      { uuid: 'food-3', eaten_on: today, label: 'Protein shake', calories: 320, protein_g: 50, carbs_g: 30, fat_g: 6, water_oz: 12, created_at: at(15) },
      { uuid: 'food-4', eaten_on: today, label: 'Bagel and peanut butter', calories: 600, protein_g: 20, carbs_g: 106, fat_g: 22, water_oz: null, created_at: at(17) },
      ...[1, 2, 3, 4, 5, 6].map(d => ({ uuid: `food-past-${d}`, eaten_on: planAdd(today, -d), label: 'Logged day', calories: 2500 + ((d * 173) % 500), protein_g: 160 + ((d * 7) % 30), carbs_g: 300 + ((d * 19) % 60), fat_g: 70 + ((d * 5) % 15), water_oz: 80 + ((d * 9) % 30), created_at: new Date(Date.now() - d * DAY).toISOString() })),
    ],
  };
}
const savePlan = (state: MockPlanState) => localStorage.setItem('mock_health_plan', JSON.stringify(state));
function mockProgram(state: MockPlanState, today: string) {
  const prog = state.program;
  if (!prog) return null;
  const monday = planMonday(today);
  const workouts = mockWorkouts();
  const kinds: Record<string, RegExp> = { gym: /lifting/, run: /running/, ride: /cycling/, recovery: /walking|yoga/, sport: /soccer/ };
  return {
    uuid: prog.uuid, name: prog.name, goal: prog.goal, starts_on: prog.starts_on, weeks: prog.weeks,
    week_number: Math.floor((Date.parse(monday) - Date.parse(planMonday(prog.starts_on))) / (7 * DAY)) + 1, ended: false, before_start: today < prog.starts_on, week_of: monday,
    sessions: prog.sessions.map(s => {
      const date = planAdd(monday, s.weekday);
      const mark = state.marks[`${s.uuid}:${date}`] || null;
      const rec = kinds[s.kind] ? workouts.find(w => w.date === date && kinds[s.kind].test(w.sport)) : null;
      return { ...s, date, marked: !!mark, recorded: rec ? { sport: rec.sport, minutes: rec.minutes, strain: rec.strain } : null,
        status: mark || (rec ? 'done' : date < today ? 'missed' : date === today ? 'today' : 'planned') };
    }),
  };
}
function mockNutrition(state: MockPlanState, today: string) {
  const fields = ['calories', 'protein_g', 'carbs_g', 'fat_g', 'water_oz'] as const;
  const totals = (rows: MockPlanState['entries']) => Object.fromEntries(fields.map(f => [f, rows.reduce((n, e) => n + (e[f] || 0), 0)]));
  const favorites = state.favorites || [];
  const todays = state.entries.filter(e => e.eaten_on === today).map(e => ({ source: 'manual', serving: null, barcode: null, ...e, favorite: favorites.find(f => f.label.toLowerCase() === e.label.toLowerCase())?.uuid || null }));
  return { date: today, favorites, entries: todays, totals: totals(todays), days: Array.from({ length: 7 }, (_, i) => { const date = planAdd(today, i - 6); const rows = state.entries.filter(e => e.eaten_on === date); return { date, logged: rows.length > 0, totals: totals(rows) }; }) };
}

/** A cooling week in Troutman with the first frost on the third night, in local time. */
function mockOutlook() {
  const start = new Date(); start.setMinutes(0, 0, 0);
  const iso = (d: Date) => { const z = -d.getTimezoneOffset(); const s = z >= 0 ? '+' : '-'; const a = Math.abs(z); return `${new Date(d.getTime() + z * 60000).toISOString().slice(0, 19)}${s}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`; };
  const hours = Array.from({ length: 144 }, (_, i) => {
    const at = new Date(start.getTime() + i * 3600000);
    const h = at.getHours();
    const day = Math.floor(i / 24);
    const temperatureF = Math.round(52 - day * 4 + 13 * Math.sin(((h - 9) / 24) * Math.PI * 2));
    return { start: iso(at), temperatureF, precipitationChance: day === 4 && h > 12 ? 70 : 5, dewpointF: temperatureF - 9, humidity: 62, windSpeed: '4 mph', windMph: day === 4 ? 22 : 4, windDirection: 'NW', shortForecast: day === 4 && h > 12 ? 'Chance Rain Showers' : h >= 7 && h < 19 ? 'Sunny' : 'Clear', isDaytime: h >= 7 && h < 19 };
  });
  const nights: any[] = [];
  for (let d = 0; d < 6; d++) {
    const night = hours.filter((h) => { const at = new Date(h.start); const n = new Date(at.getTime() - 12 * 3600000); return n.getDate() === new Date(start.getTime() + d * 86400000).getDate() && (at.getHours() <= 9 || at.getHours() >= 18); });
    if (!night.length) continue;
    const low = night.reduce((a, b) => (b.temperatureF < a.temperatureF ? b : a));
    const t = low.temperatureF;
    nights.push({ night: (() => { const n = new Date(start.getTime() + d * 86400000); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; })(), lowF: t, at: low.start, windMph: low.windMph, shortForecast: low.shortForecast, risk: t <= 28 ? 'hard_freeze' : t <= 32 ? 'freeze' : t <= 36 ? 'likely' : t <= 38 ? 'possible' : 'none' });
  }
  const days = Array.from({ length: 7 }, (_, d) => {
    const at = new Date(start.getTime() + d * 86400000);
    return { date: `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`, name: d === 0 ? 'Today' : at.toLocaleDateString('en-US', { weekday: 'long' }), highF: 65 - d * 4, lowF: 39 - d * 4, shortForecast: d === 4 ? 'Chance Rain Showers' : 'Sunny', detailedForecast: null, precipitationChance: d === 4 ? 70 : 2 };
  });
  return { status: 'ready', place: { uuid: 'p-home', name: 'Home' }, outlook: { place: 'Troutman, NC', now: hours[0], hours: hours.slice(0, 48), days, nights, nextFrost: nights.find((n) => n.risk !== 'none') || null, checkedAt: new Date().toISOString() } };
}

async function route(method: string, path: string, body?: any): Promise<any> {
  await wait(150);
  const url = new URL(path, 'http://mock');
  const p = url.pathname;
  const reviewResult = mockWorkspaceReviews(method, url, body);
  if (reviewResult !== undefined) return reviewResult;
  const workResult = mockWorkItems(method, url, body);
  if (workResult !== undefined) return workResult;

  if (p === '/auth/companion/google') {
    signedIn = true;
    localStorage.setItem('mock_signed_in', 'true');
    return { success: true, user: { email: 'sam@example.com', full_name: 'Sam Rivera', picture: null }, access: mockAccess() };
  }
  if (p === '/auth/companion/me') {
    if (!signedIn) fail(401, 'Not authenticated');
    return { success: true, user: { email: 'sam@example.com', full_name: 'Sam Rivera', picture: null } };
  }
  if (p === '/auth/companion/logout') {
    signedIn = false;
    localStorage.removeItem('mock_signed_in');
    return { success: true };
  }
  if (p === '/auth/companion/ws-ticket') fail(503, 'no sockets in mock mode'); // exercises the polling fallback
  if (p === '/auth/companion/refresh') {
    if (!signedIn) fail(401, 'Not authenticated', 'SESSION_EXPIRED');
    ipDrift = false; // re-pinned to the current IP, exactly like the proxy
    localStorage.removeItem('mock_ip_drift');
    return { success: true, user: { email: 'sam@example.com', full_name: 'Sam Rivera', picture: null } };
  }
  if (p.startsWith('/api/v1')) {
    if (linkDown()) fail(503, 'mock: API unreachable');
    if (ipDrift) fail(401, 'IP mismatch for provided token.', 'IP_MISMATCH');
  }
  if (p === '/api/v1/workouts') return { days: 3650, workouts: mockWorkouts() };
  // Family → Trading: illustrative desk data (mock/trading.ts).
  { const t = mockTrading(method, p); if (t !== undefined) return t; }
  // Family → Finance: an illustrative Webull read (connectors/webull.js shape).
  if (p.startsWith('/api/v1/finance/brokerage')) {
    if (localStorage.getItem('mock_webull') === 'off') return { status: 'not_connected', accounts: [] };
    const pos = (symbol: string, quantity: number, last: number, cost: number) => ({ symbol, type: 'STOCK', strategy: null, quantity, last_price: last, cost_price: cost, market_value: +(quantity * last).toFixed(2), unrealized_pl: +((last - cost) * quantity).toFixed(2), unrealized_pl_percent: +(((last - cost) / cost) * 100).toFixed(2), legs: [] });
    const order = (symbol: string, side: string, status: string, quantity: number, price: number, daysAgo: number) => ({ id: `${symbol}-${daysAgo}`, symbol, side, type: 'LIMIT', status, quantity, filled_quantity: status === 'FILLED' ? quantity : 0, filled_price: status === 'FILLED' ? price : null, limit_price: price, stop_price: null, time_in_force: 'DAY', placed_at: new Date(Date.now() - daysAgo * 86400_000).toISOString(), filled_at: null });
    const positions = [pos('VTI', 42, 298.14, 251.3), pos('AAPL', 15, 231.5, 188.02), pos('NVDA', 8, 142.9, 151.4), pos('SCHD', 60, 28.77, 27.1)];
    const market = positions.reduce((t, x) => t + x.market_value, 0), open = positions.reduce((t, x) => t + x.unrealized_pl, 0);
    const balance = { currency: 'USD', net_value: +(market + 3120.55).toFixed(2), market_value: +market.toFixed(2), cash: 3120.55, settled_cash: 3120.55, buying_power: 3120.55, day_pl: 184.37, open_pl: +open.toFixed(2), day_trades_left: '3' };
    return { status: 'ready', environment: 'production', checked_at: new Date().toISOString(),
      accounts: [{ id: 'MOCK1', label: 'Individual Margin', type: 'MARGIN', class: 'INDIVIDUAL_MARGIN', number_tail: '4821', balance, positions,
        open_orders: [order('SCHD', 'BUY', 'SUBMITTED', 20, 28.25, 0)],
        recent_orders: [order('AAPL', 'BUY', 'FILLED', 5, 226.1, 3), order('NVDA', 'SELL', 'FILLED', 2, 147.8, 9), order('VTI', 'BUY', 'CANCELLED', 10, 290, 16)] }],
      totals: { currency: 'USD', net_value: balance.net_value, market_value: balance.market_value, cash: balance.cash, buying_power: balance.buying_power, day_pl: balance.day_pl, open_pl: balance.open_pl } };
  }
  // Bedroom & sleep: enough nights for a finding, the cooler band best.
  if (p === '/api/v1/dashboard/health/sleep-climate') return {
    status: 'ready', nights: 38, metric: 'avgRecovery', confidence: 'moderate',
    bands: [
      { fromF: 64, toF: 65, nights: 5, avgRecovery: 71, avgPerformance: 84, avgHumidity: 40 },
      { fromF: 66, toF: 67, nights: 12, avgRecovery: 74, avgPerformance: 88, avgHumidity: 41 },
      { fromF: 68, toF: 69, nights: 14, avgRecovery: 63, avgPerformance: 81, avgHumidity: 43 },
      { fromF: 70, toF: 71, nights: 7, avgRecovery: 55, avgPerformance: 76, avgHumidity: 45 },
    ],
    best: { fromF: 66, toF: 67, nights: 12, avgRecovery: 74, avgPerformance: 88, avgHumidity: 41, delta: 11, othersAvg: 63 },
    device: { name: 'enterprises/mock/devices/up', title: 'Upstairs thermostat' },
    sentence: 'On nights the Upstairs thermostat averaged 66–67°F, your recovery averaged 74%, 11 points higher than your other nights (12 of 38 nights; moderate confidence — a pattern in your nights, not proof of cause).',
  };
  // Guardians (2026-10-29): one running scout mission waiting on you, proposals, capabilities, two kids.
  if (p === '/api/v1/guardian-missions' || p.startsWith('/api/v1/guardian-missions/')) {
    const KEY = 'mock_guardian_missions_v3';
    const cap = (key: string, name: string, badge: string, extra: Record<string, unknown> = {}) => ({
      uuid: `cap-${key}`, key, kind: 'system', name, description: null, channel: null, locality: 'cloud', permission: 'free', missionOnly: false, houseControl: false,
      enabled: true, status: 'untested', badge, hardware: null, lastTestedAt: null, stale: false,
      record: { total: 0, passed: 0, avgLatencyMs: null, stages: {}, text: 'Not tested yet' }, audience: 'parent_only', ...extra,
    });
    const fresh = () => ({
      control: { mode: 'running', quietUntil: null, killSwitch: false, killSwitchAt: null, monthlyBudget: 200, stopWord: 'Kraken' },
      attention: 'yellow',
      active: [
        { uuid: 'm-scout', key: 'scout-the-yard', title: 'Scout the yard', goal: 'First test of scouting.', rung: 1, priority: 'normal', status: 'running', approval: 'approved', source: 'seed', adventure: null, notes: null, startedAt: new Date().toISOString(), endedAt: null,
          capabilities: [{ name: 'Scout geography', badge: '🧭' }, { name: 'Push notification', badge: '🔔' }, { name: 'Phone camera', badge: '📷' }],
          steps: [{ uuid: 's-1', seq: 1, instruction: 'Stand at the back porch and take four photos, holding the phone upright: north, east, south, then west. Proof: the four photos.', place: 'the back porch', proofRequired: 'photo_set', status: 'waiting_parent', dueAt: null, sentAt: new Date().toISOString(), nudgeCount: 0, assignee: { uuid: 'a-ross', name: 'Ross', kind: 'parent' }, capability: 'Scout geography', resultNote: null, audience: 'parent_only' },
            { uuid: 's-2', seq: 2, instruction: 'Walk to the brick back-porch steps and check there is a red planter on the left. Reply Done if it matches, or tell me what\'s different.', place: 'Back porch steps', proofRequired: 'parent_confirm', status: 'waiting_parent', dueAt: null, sentAt: null, nudgeCount: 0, assignee: { uuid: 'a-ross', name: 'Ross', kind: 'parent' }, capability: 'Scout geography', resultNote: null, audience: 'parent_only' }],
          waitingOn: ['you'], audience: 'parent_only' },
      ],
      proposed: [
        { uuid: 'm-gate', key: 'guardian-gate', title: 'Guardian Gate', goal: 'Kids show the doorbell camera something; Athena answers in Morse on the porch light or by voice.', rung: 2, priority: 'normal', status: 'proposed', approval: 'unapproved', source: 'seed', adventure: null, notes: null, startedAt: null, endedAt: null, capabilities: [{ name: 'Doorbell camera (Guardian Gate)', badge: '🚪' }, { name: 'Control porch light', badge: '💡' }, { name: 'Morse out (light)', badge: '📡' }], steps: [], waitingOn: [], audience: 'kids_too' },
        { uuid: 'm-lamp', key: 'guardian-signal-lamp', title: 'Guardian signal lamp', goal: 'A signal lamp in each kid\'s room Athena can light during missions.', rung: 3, priority: 'high', status: 'proposed', approval: 'unapproved', source: 'seed', adventure: null, notes: null, startedAt: null, endedAt: null, capabilities: [], steps: [], waitingOn: [], audience: 'kids_too' },
      ],
      history: [{ uuid: 'm-fw', key: 'mission-3-first-watch', title: 'The First Watch', goal: 'Index cards from 1963 are scattered across the high ground.', rung: 1, priority: 'normal', status: 'completed', approval: 'approved', source: 'legacy', adventure: 'lake_norman_guardians', notes: null, startedAt: null, endedAt: null, capabilities: [{ name: 'Hide-and-find clue planning', badge: '🗺️' }], steps: [], waitingOn: [], audience: 'kids_too' },],
      capabilities: [
        cap('scout_geography', 'Scout geography', '🧭', { locality: 'hybrid', status: 'working', lastTestedAt: new Date().toISOString(), record: { total: 6, passed: 6, avgLatencyMs: 2400, stages: { upload: { total: 4, passed: 4 }, analysis: { total: 1, passed: 1 }, verification: { total: 1, passed: 1 } }, text: '6 tests, 6 passed, average delay 2.4s' } }),
        cap('push_notification', 'Push notification', '🔔', { status: 'flaky', record: { total: 5, passed: 4, avgLatencyMs: 800, stages: {}, text: '5 tests, 4 passed, average delay 0.8s' } }),
        cap('porch_light', 'Control porch light', '💡', { locality: 'local', missionOnly: true, houseControl: true }),
        cap('view_cameras', 'View cameras', '👁️', { locality: 'hybrid', houseControl: true, status: 'broken', record: { total: 3, passed: 0, avgLatencyMs: null, stages: {}, text: '3 tests, 0 passed' } }),
        cap('speak_through_camera', 'Speak through camera', '🗣️', { missionOnly: true, houseControl: true, permission: 'parent_approval', enabled: false }),
      ],
      skills: [cap('knows_morse', 'Knows Morse', '📡', { kind: 'skill' }), cap('plays_soccer', 'Plays soccer', '⚽', { kind: 'skill' }), cap('uses_walkies', 'Uses walkie-talkies', '📻', { kind: 'skill' })],
      recipients: [{ uuid: 'a-ross', name: 'Ross', kind: 'parent', muted: false, mutedUntil: null }, { uuid: 'a-thomas', name: 'Thomas', kind: 'kid', muted: false, mutedUntil: null }, { uuid: 'a-skylar', name: 'Skylar', kind: 'kid', muted: true, mutedUntil: null }],
      guardians: [
        { uuid: 'a-thomas', name: 'Thomas', muted: false, mutedUntil: null, badges: [{ capabilityUuid: 'cap-plays_soccer', name: 'Plays soccer', badge: '⚽', level: 'reliable', source: 'parent_reported', retest: false }], progress: { reliable: 1, learning: 0 } },
        { uuid: 'a-skylar', name: 'Skylar', muted: true, mutedUntil: null, badges: [{ capabilityUuid: 'cap-knows_morse', name: 'Knows Morse', badge: '📡', level: 'learning', source: 'parent_reported', retest: false }], progress: { reliable: 0, learning: 1 } },
      ],
      team: {
        roster: ([['Thomas', true, 4, 'Builder', 80], ['Skylar', true, 1, 'Sage', 40], ['Livia', false, 6, 'Tracker', 60], ['Erika', false, 3, 'Builder', 40], ['Aaron', false, 2, 'Creator', 20], ['Emery', false, 2, 'Builder', 20], ['Addy', false, 1, 'Sage', 40], ['Penny', false, 1, 'Recruit', 0], ['Zeke', false, 1, 'Recruit', 0]] as const)
          .map(([name, ours, level, role, levelProgress]) => ({ name, ours, checkedIn: role !== 'Recruit', finds: role === 'Tracker' ? 26 : name === 'Thomas' ? 1 : 0, trailKeys: role === 'Builder' ? 10 : 0, contributions: name === 'Thomas' || name === 'Aaron' ? 1 : 0, missionsStarted: name === 'Thomas' ? 1 : 0, badges: ours ? 1 : 0, level, role, levelProgress,
            recent: name === 'Thomas' ? [{ kind: 'find', at: new Date(Date.now() - 720000).toISOString(), who: name, text: 'found Beam\'s Mill — ledger line' }, { kind: 'report', at: '2026-07-01T23:28:57Z', who: name, text: 'reported the family\'s map piece' }] : [] })),
        skills: [
          { key: 'planning', name: 'Planning', percent: 80, done: 4, total: 5, detail: '4 of 5 missions carried through' },
          { key: 'teamwork', name: 'Teamwork', percent: 50, done: 2, total: 4, detail: '2 of 4 families reported their map piece' },
          { key: 'problemSolving', name: 'Problem Solving', percent: 80, done: 24, total: 30, detail: '24 of 30 trail keys decoded' },
          { key: 'observation', name: 'Observation', percent: 96, done: 27, total: 28, detail: '27 of 28 clue cards found' },
          { key: 'communication', name: 'Communication', percent: 79, done: 11, total: 14, detail: '11 of 14 Guardians have checked in with Athena' },
          { key: 'realWorldTools', name: 'Real World Tools', percent: 0, done: 0, total: 10, detail: '0 of 10 tool skills reliable' },
        ],
        clues: { mission: 'mission-3-first-watch', found: 2, total: 3, foundRefs: ['F-01', 'F-02'] },
        activity: [
          { kind: 'find', at: new Date(Date.now() - 720000).toISOString(), who: 'Thomas', text: 'found Beam\'s Mill — ledger line' },
          { kind: 'key', at: new Date(Date.now() - 2040000).toISOString(), who: 'Skylar', text: 'decoded a trail key' },
          { kind: 'report', at: new Date(Date.now() - 3600000).toISOString(), who: 'Aaron', text: 'reported the family\'s map piece' },
          { kind: 'find', at: new Date(Date.now() - 7200000).toISOString(), who: 'Addy', text: 'found Nell\'s journal — June 1963' },
          { kind: 'key', at: '2026-07-27T18:00:00Z', who: 'Emery', text: 'decoded a trail key' },
        ],
      },
      clues: ['Beam\'s Mill — ledger line', 'Nell\'s journal — June 1963', 'Photograph — seven on the mill wall'].map((title, i) => ({ uuid: `c-${i}`, seq: i + 1, ref: `F-0${i + 1}`, title, act: 1, kind: null, status: 'unplaced', mission: 'The First Watch' })),
      locations: [{ uuid: 'l-1', name: 'Back porch steps', lat: 35.5441, lng: -80.9371, description: 'Brick steps with a red planter to the left.', hiding_potential: 'Behind the red planter\n• under the bottom step (E, 2/5)', difficulty: 2, last_verified_at: null, created_at: new Date().toISOString() }],
      log: [{ verb: 'step_send', outcome: 'ok', detail: null, at: new Date().toISOString(), who: 'Ross', mission: 'Scout the yard' }, { verb: 'step_send', outcome: 'held', detail: { reason: 'Skylar is muted' }, at: new Date().toISOString(), who: 'Skylar', mission: 'Scout the yard' }],
    });
    let s = JSON.parse(localStorage.getItem(KEY) || 'null') || fresh();
    const save = () => { localStorage.setItem(KEY, JSON.stringify(s)); return s; };
    const rest = p.slice('/api/v1/guardian-missions'.length);
    if (!rest && method === 'GET') return s;
    if (rest === '/control') { s.control = { ...s.control, ...body, mode: body.mode ?? s.control.mode, quietUntil: body.mode === 'quiet_until' ? body.quietUntil : body.mode ? null : s.control.quietUntil }; return save(); }
    let m = /^\/capabilities\/([^/]+)$/.exec(rest);
    if (m) { s.capabilities = s.capabilities.map((c: any) => (c.uuid === m![1] ? { ...c, enabled: body.enabled } : c)); return save(); }
    m = /^\/recipients\/(.+)$/.exec(rest);
    if (m) { s.recipients = s.recipients.map((r: any) => (r.uuid === m![1] ? { ...r, muted: body.muted } : r)); return save(); }
    m = /^\/missions\/(.+)\/(approve|decline|stop|pause)$/.exec(rest);
    if (m) {
      const [, uuid, verb] = m;
      if (verb === 'approve') { const x = s.proposed.find((q: any) => q.uuid === uuid); s.proposed = s.proposed.filter((q: any) => q.uuid !== uuid); if (x) s.active.push({ ...x, status: 'running', approval: 'approved' }); }
      if (verb === 'decline') s.proposed = s.proposed.filter((q: any) => q.uuid !== uuid);
      if (verb === 'stop') s.active = s.active.filter((q: any) => q.uuid !== uuid);
      if (verb === 'pause') s.active = s.active.map((q: any) => (q.uuid === uuid ? { ...q, status: body.paused ? 'paused' : 'running' } : q));
      s.attention = s.proposed.length ? 'yellow' : 'green';
      return save();
    }
    if (rest === '/stop-everything') { s.active = s.active.filter((q: any) => q.source === 'legacy'); return save(); }
    if (rest === '/scout') return { overview: s, send: { verdict: 'allow', reason: null } };
    m = /^\/steps\/(.+)\/(verify|send)$/.exec(rest);
    if (m) {
      s.active = s.active.map((q: any) => ({ ...q, steps: q.steps.map((st: any) => (st.uuid === m![1] ? (m![2] === 'verify' ? { ...st, status: 'done', resultNote: body.matches ? 'Matches' : `Doesn't match: ${body.note || ''}` } : { ...st, sentAt: new Date().toISOString() }) : st)) }));
      save();
      return m[2] === 'send' ? { overview: s, decision: { verdict: 'allow', reason: null } } : s;
    }
    if (rest === '/cameras') return { state: 'ready', cameras: [{ serial: 'T8171A', name: 'Backyard SoloCam', model: 'T8171', control: { ptz: true, presets: true, talkback: true }, freshSnapshot: true }, { serial: 'T8213B', name: 'Front doorbell', model: 'T8213', control: { ptz: false, presets: false, talkback: true }, freshSnapshot: true }] };
    m = /^\/capabilities\/(.+)\/test$/.exec(rest);
    if (m) return { overview: s, result: { ok: m[1] !== 'cap-view_cameras', error: m[1] === 'cap-view_cameras' ? 'bridge_unavailable' : null, latencyMs: 420 } };
    if (rest === '/reset') { s = fresh(); return save(); }
  }
  // Research: one study with a finding, one still gathering, one with a pace.
  if (p === '/api/v1/research') {
    const sleep = { status: 'ready', nights: 38, needed: 14, metric: 'avgRecovery', confidence: 'moderate',
      bands: [
        { fromF: 64, toF: 65, nights: 5, avgRecovery: 71, avgPerformance: 84, avgHumidity: 40 },
        { fromF: 66, toF: 67, nights: 12, avgRecovery: 74, avgPerformance: 88, avgHumidity: 41 },
        { fromF: 68, toF: 69, nights: 14, avgRecovery: 63, avgPerformance: 81, avgHumidity: 43 },
        { fromF: 70, toF: 71, nights: 7, avgRecovery: 55, avgPerformance: 76, avgHumidity: 45 },
      ],
      best: { fromF: 66, toF: 67, nights: 12, avgRecovery: 74, avgPerformance: 88, avgHumidity: 41, delta: 11, othersAvg: 63 },
      device: { name: 'enterprises/mock/devices/up', title: 'Upstairs thermostat' } };
    return { studies: [
      { id: 'sleep-climate', title: 'Bedroom & sleep', question: 'What bedroom temperature goes with your best recovery?', sources: ['Google Nest', 'WHOOP'], status: 'ready', progress: { have: 38, needed: 14, unit: 'nights' }, confidence: 'moderate', detail: sleep,
        sentence: 'On nights the Upstairs thermostat averaged 66–67°F, your recovery averaged 74%, 11 points higher than your other nights (12 of 38 nights; moderate confidence — a pattern in your nights, not proof of cause).' },
      { id: 'thermostat-setpoint', title: 'Setpoint & heating time', question: 'How many fewer hours does the heat run when the thermostat is set lower?', sources: ['Google Nest'], status: 'gathering', progress: { have: 5, needed: 14, unit: 'days' }, detail: { status: 'gathering' },
        sentence: 'I have 5 of the 14 days I need from the Hall thermostat, each with a heating setpoint and a full day of readings.' },
      { id: 'project-pace', title: 'Project pace', question: 'How fast do your projects actually move, and when would they finish at that pace?', sources: ['Projects'], status: 'ready', progress: { have: 17, needed: 8, unit: 'steps' }, confidence: 'low',
        detail: { status: 'ready', perWeek: 2.1,
          weekly: [1, 2, 4, 2, 3, 1, 2, 2].map((steps, i) => ({ weekOf: new Date(Date.now() - (8 - i) * 7 * 86_400_000).toISOString().slice(0, 10), steps })),
          sessions: { count: 4, hours: 6 },
          projects: [
            { uuid: 'p1', title: 'Garage shelving', open: 3, doneInWindow: 1, idleDays: 21, stalled: true, finishOn: null },
            { uuid: 'p2', title: 'Deck stain', open: 4, doneInWindow: 8, idleDays: 2, stalled: false, finishOn: new Date(Date.now() + 28 * 86_400_000).toISOString().slice(0, 10) },
          ] },
        sentence: 'Over the last eight weeks you finished about 2.1 steps a week across your projects, with 4 work sessions (6 hours). At its own pace, "Deck stain" would finish in about four weeks. 1 active project has had no progress in 14+ days. A description of your recent weeks, not a promise.' },
    ] };
  }
  if (p.startsWith('/api/v1/dashboard/health/plan') || p.startsWith('/api/v1/dashboard/health/program') || p.startsWith('/api/v1/dashboard/health/targets') || p.startsWith('/api/v1/dashboard/health/nutrition') || p.startsWith('/api/v1/dashboard/health/favorites')) {
    const state = mockPlanState();
    const today = url.searchParams.get('today') || body?.today || planDay(new Date());
    if (p === '/api/v1/dashboard/health/plan') return { program: mockProgram(state, today), targets: state.targets, nutrition: mockNutrition(state, today) };
    if (p === '/api/v1/dashboard/health/program' && method === 'PUT') {
      const before = state.program?.sessions || [];
      state.program = { uuid: `prog-${Date.now()}`, name: body.name, goal: body.goal || null, starts_on: body.starts_on, weeks: body.weeks, sessions: body.sessions.map((x: MockPlanSession, i: number) => ({ ...x, uuid: `ses-${Date.now()}-${i}`, focus: x.focus || null, detail: x.detail || null, exercises: x.exercises || [] })) };
      // Like the server: a mark follows the session with the same weekday and title.
      const carried: Record<string, string> = {};
      for (const [key, status] of Object.entries(state.marks)) {
        const [uuid, date] = key.split(':');
        const old = before.find(x => x.uuid === uuid);
        const now = old && state.program.sessions.find(x => x.weekday === old.weekday && x.title === old.title);
        if (now) carried[`${now.uuid}:${date}`] = status;
      }
      state.marks = carried;
      savePlan(state);
      return { program: mockProgram(state, today) };
    }
    if (p === '/api/v1/dashboard/health/program' && method === 'DELETE') { state.program = null; savePlan(state); return { ended: true }; }
    if (p.endsWith('/mark')) {
      const key = `${decodeURIComponent(p.split('/')[7])}:${body.date}`;
      if (body.status) state.marks[key] = body.status; else delete state.marks[key];
      savePlan(state);
      return { program: mockProgram(state, today) };
    }
    if (p === '/api/v1/dashboard/health/targets') { state.targets = { ...body }; savePlan(state); return { targets: state.targets }; }
    const food = (b: any) => ({ label: b.label || 'Water', calories: b.calories ?? null, protein_g: b.protein_g ?? null, carbs_g: b.carbs_g ?? null, fat_g: b.fat_g ?? null, water_oz: b.water_oz ?? null, serving: b.serving ?? null, barcode: b.barcode ?? null });
    const star = (b: any) => {
      const favs = (state.favorites ||= []).filter(f => f.label.toLowerCase() !== String(b.label).toLowerCase());
      state.favorites = [...favs, { uuid: `fav-${Date.now()}`, ...food(b) }].sort((a, c) => a.label.localeCompare(c.label));
    };
    const log = (b: any, source: string) => { const e = { uuid: `food-${Date.now()}`, eaten_on: b.eaten_on || today, source, ...food(b), created_at: new Date().toISOString() }; state.entries.push(e); return e; };
    if (p === '/api/v1/dashboard/health/nutrition' && method === 'POST') {
      if (!body.label && body.water_oz == null) fail(400, 'Say what it was.');
      log(body, body.source || 'manual');
      if (body.favorite) star(body);
      savePlan(state);
      return { nutrition: mockNutrition(state, today) };
    }
    // ?mock_scan=barcode|none previews the other outcomes; the default is a photo estimate.
    if (p === '/api/v1/dashboard/health/nutrition' && method === 'GET') {
      const date = url.searchParams.get('date') || today;
      if (date > today) fail(400, 'That day hasn’t happened yet.');
      return { nutrition: mockNutrition(state, date) };
    }
    if (p === '/api/v1/dashboard/health/nutrition/scan') {
      await wait(1200);
      const how = localStorage.getItem('mock_scan') || (body.barcode ? 'barcode' : 'photo');
      if (how === 'none') fail(422, 'Couldn’t make out a food or a barcode in that photo. Try again closer, or enter it by hand.');
      const entry = how === 'barcode'
        ? log({ label: 'Clif Bar Chocolate Chip', serving: '1 bar (68 g)', calories: 250, protein_g: 10, carbs_g: 44, fat_g: 5, barcode: body.barcode || '722252100900', eaten_on: body.eaten_on }, 'barcode')
        : log({ label: 'Grilled salmon and rice', serving: '1 plate (~420 g)', calories: 640, protein_g: 42, carbs_g: 58, fat_g: 24, eaten_on: body.eaten_on }, 'photo');
      savePlan(state);
      return { entry, how, note: how === 'barcode' ? `Found ${entry.label} — logged one serving (${entry.serving}).` : 'Estimated from your photo: assumed about 6 oz of salmon and a cup of white rice.', nutrition: mockNutrition(state, today) };
    }
    if (p === '/api/v1/dashboard/health/nutrition/describe') {
      await wait(1500);
      if (!String(body.text || '').trim()) fail(400, 'Tell Athena what you ate.');
      const entry = log({ label: 'McDonald’s Big Mac', serving: '1 sandwich (219 g)', calories: 590, protein_g: 25, carbs_g: 46, fat_g: 34, eaten_on: body.eaten_on }, 'described');
      savePlan(state);
      return { entry, how: 'described', note: `Logged ${entry.label} (${entry.serving}). McDonald’s published nutrition.`, nutrition: mockNutrition(state, today) };
    }
    if (p.startsWith('/api/v1/dashboard/health/nutrition/') && method === 'PATCH') {
      const uuid = decodeURIComponent(p.split('/').pop() || '');
      const e = state.entries.find(x => x.uuid === uuid);
      if (!e) fail(404, 'Not found.');
      const fav = state.favorites?.find(f => f.label.toLowerCase() === e!.label.toLowerCase());
      Object.assign(e!, food(body), { barcode: e!.barcode ?? null });
      if (fav) Object.assign(fav, food(body), { barcode: fav.barcode });
      savePlan(state);
      return { nutrition: mockNutrition(state, today) };
    }
    if (p === '/api/v1/dashboard/health/favorites' && method === 'POST') { star(body); savePlan(state); return { nutrition: mockNutrition(state, today) }; }
    if (p.endsWith('/log') && p.startsWith('/api/v1/dashboard/health/favorites/')) {
      const fav = state.favorites?.find(f => f.uuid === decodeURIComponent(p.split('/')[6]));
      if (!fav) fail(404, 'Not found.');
      log({ ...fav, eaten_on: body.eaten_on }, 'favorite');
      savePlan(state);
      return { nutrition: mockNutrition(state, today) };
    }
    if (p.startsWith('/api/v1/dashboard/health/favorites/') && method === 'DELETE') {
      const uuid = decodeURIComponent(p.split('/').pop() || '');
      state.favorites = (state.favorites || []).filter(f => f.uuid !== uuid);
      savePlan(state);
      return { nutrition: mockNutrition(state, today) };
    }
    if (p.startsWith('/api/v1/dashboard/health/nutrition/') && method === 'DELETE') {
      const uuid = decodeURIComponent(p.split('/').pop() || '');
      state.entries = state.entries.filter(e => e.uuid !== uuid);
      savePlan(state);
      return { nutrition: mockNutrition(state, today) };
    }
  }
  if (p === '/api/v1/access') {
    if (!signedIn) fail(401, 'Not authenticated');
    if (method === 'POST') localStorage.setItem('mock_access_requested', 'true');
    return mockAccess();
  }
  if (p === '/api/v1/profile') return { uuid: 'mock-profile', full_name: 'Sam Rivera' };
  // mock_dashboard_down='calendar:needs_reauth,recovery:error' previews a card's fix button.
  if (p === '/api/v1/dashboard') {
    const summary: Record<string, unknown> = dashboardSummary();
    for (const pair of (localStorage.getItem('mock_dashboard_down') || '').split(',').filter(Boolean)) {
      const [key, status] = pair.split(':');
      if (key in summary) summary[key] = unready(status as Parameters<typeof unready>[0]);
    }
    return summary;
  }
  if (p === '/api/v1/dashboard/priority') return dashboardPriority();
  if (p === '/api/v1/dashboard/inbox') return { unacknowledged: [{ uuid: 'mock-n1', kind: 'nudge', title: 'Athena', body: 'Your 2pm is in fifteen minutes.', url: null, createdAt: new Date(Date.now() - 20 * 60_000).toISOString(), acknowledgedAt: null }], recent: [] };
  if (p.startsWith('/api/v1/dashboard/inbox/') && method === 'POST') return { cleared: 1 };
  // Emergency banner: quiet by default; ?alert=urgent or =watch to see it.
  if (p === '/api/v1/dashboard/alert/ack' && method === 'POST') {
    const key = String((body as { key?: string } | undefined)?.key || '');
    sessionStorage.setItem('mock_alert_ack', key);
    return { acknowledgedKey: key };
  }
  if (p === '/api/v1/dashboard/alert') {
    // Remembered for the tab: the app scrubs the query string on load.
    const fromUrl = new URLSearchParams(window.location.search).get('alert');
    if (fromUrl) sessionStorage.setItem('mock_alert', fromUrl);
    const wanted = fromUrl || sessionStorage.getItem('mock_alert');
    const ago = (m: number) => new Date(Date.now() - m * 60000).toISOString();
    const incidents = [
      { id: 'm1', what: 'Structure Fire', category: 'Fire', where: '101 Brer Fox Trl', miles: 0.9, place: 'home', units: 16, receivedAt: ago(38), serious: true, latitude: 35.6865, longitude: -80.9031 },
      { id: 'm2', what: 'Tree Down', category: 'Hazard', where: 'Shady Cove Rd & Perth Rd', miles: 1.1, place: 'home', units: 3, receivedAt: ago(22), serious: false, latitude: 35.6664, longitude: -80.8903 },
      { id: 'm3', what: 'Hazardous Condition', category: 'Hazard', where: '250 Neill Farm Rd', miles: 1.4, place: 'home', units: 1, receivedAt: ago(15), serious: false, latitude: 35.6598, longitude: -80.9251 },
    ];
    const places = mockWatchPlaces().filter((p) => p.enabled).map((p) => ({ name: p.name, latitude: p.latitude, longitude: p.longitude, radiusMiles: p.radiusMiles }));
    const acknowledgedKey = sessionStorage.getItem('mock_alert_ack');
    const weatherAlerts = wanted === 'urgent'
      ? [{ id: 'nws1', event: 'Severe Thunderstorm Warning', severity: 'Severe', urgency: 'Immediate', headline: 'Severe Thunderstorm Warning issued', instruction: 'Move to an interior room on the lowest floor.', area: 'Iredell, NC', expires: new Date(Date.now() + 40 * 60000).toISOString(), place: 'Home', serious: true }]
      : [];
    if (wanted === 'urgent') return { level: 'urgent', headline: 'Structure fire and storm damage near home', body: 'A structure fire on Brer Fox Trail 0.9 miles away with 16 units on scene, plus a tree down at Shady Cove and Perth and a hazard on Neill Farm Road. Avoid Perth Rd.', incidents, key: 'mock-urgent', startedAt: ago(38), updatedAt: ago(1), assessedBy: 'mock', acknowledgedKey, places, weather: weatherAlerts };
    if (wanted === 'watch') return { level: 'watch', headline: 'Tree down near home', body: 'A tree is down at Shady Cove Rd and Perth Rd, 1.1 miles away.', incidents: incidents.slice(1, 2), key: 'mock-watch', startedAt: ago(22), updatedAt: ago(1), assessedBy: 'mock', acknowledgedKey, places, weather: weatherAlerts };
    return { level: 'none', headline: null, body: null, incidents: [], key: null, startedAt: null, updatedAt: null, assessedBy: null, acknowledgedKey, places, weather: weatherAlerts };
  }
  if (p === '/api/v1/dashboard/incidents/places') {
    if (method === 'PUT') {
      const list = mockWatchPlaces();
      const at = list.findIndex((x) => x.name === body.name);
      const prev = at >= 0 ? list[at] : null;
      const next = { uuid: prev ? prev.uuid : `wp-${Date.now()}`, name: body.name, kind: body.kind ?? prev?.kind ?? 'other', address: body.address ?? null, notes: body.notes !== undefined ? body.notes || null : prev?.notes ?? null, latitude: body.latitude, longitude: body.longitude, radiusMiles: body.radiusMiles ?? 3, enabled: body.enabled !== false };
      if (at >= 0) list[at] = next; else list.push(next);
      localStorage.setItem('mock_watch_places', JSON.stringify(list));
    }
    return { places: mockWatchPlaces() };
  }
  if (p.startsWith('/api/v1/dashboard/incidents/places/') && method === 'PATCH') {
    const uuid = decodeURIComponent(p.split('/').pop() || '');
    const list = mockWatchPlaces();
    const at = list.findIndex((x) => x.uuid === uuid);
    if (at < 0) fail(404, 'That place is gone.');
    const { photoBase64, ...fields } = body;
    list[at] = { ...list[at], ...fields, ...(photoBase64 === null ? { photoUrl: null } : photoBase64 ? { photoUrl: `data:image/jpeg;base64,${photoBase64}` } : {}) };
    localStorage.setItem('mock_watch_places', JSON.stringify(list));
    return { places: mockWatchPlaces() };
  }
  if (p.startsWith('/api/v1/dashboard/incidents/places/') && method === 'DELETE') {
    const uuid = decodeURIComponent(p.split('/').pop() || '');
    localStorage.setItem('mock_watch_places', JSON.stringify(mockWatchPlaces().filter((x) => x.uuid !== uuid)));
    return { places: mockWatchPlaces() };
  }
  // The shared Google callback page posts here; a real server finds the flow from the state.
  if (p === '/api/v1/integrations/callback' && method === 'POST') {
    if (!body?.state) fail(400, 'That sign-in link has expired or was already used. Start again from Connected apps.');
    if (body?.error) return { success: true, redirect: `/?integration=google&status=error&reason=${encodeURIComponent(body.error)}` };
    return { success: true, redirect: '/?integration=google_contacts&status=connected' };
  }
  if (p === '/api/v1/dashboard/weather/outlook') return mockOutlook();
  if (p.startsWith('/api/v1/dashboard/weather/alerts')) {
    const uuid = p.split('/')[6] ? decodeURIComponent(p.split('/')[6]) : null;
    let rules: any[] = JSON.parse(localStorage.getItem('mock_weather_alerts') || '[]');
    const units: Record<string, string | null> = { cold: '°F', heat: '°F', rain: '%', wind: 'mph', snow: null, ice: null, storm: null };
    const defaults: Record<string, number> = { cold: 34, heat: 95, rain: 60, wind: 35 };
    if (method === 'POST') rules.push({ uuid: `wa${Date.now()}`, enabled: true, leadHours: 24, ...body, threshold: units[body.kind] ? (body.threshold ?? defaults[body.kind]) : null });
    if (method === 'PATCH') rules = rules.map(r => (r.uuid === uuid ? { ...r, ...body } : r));
    if (method === 'DELETE') rules = rules.filter(r => r.uuid !== uuid);
    localStorage.setItem('mock_weather_alerts', JSON.stringify(rules));
    const words = (r: any) => ({ cold: `${r.threshold}°F or colder`, heat: `${r.threshold}°F or hotter`, rain: `rain ${r.threshold}% likely or more`, wind: `wind or gusts of ${r.threshold} mph or more`, snow: 'any snow', ice: 'sleet or freezing rain', storm: 'thunderstorms' } as Record<string, string>)[r.kind];
    const frost = mockOutlook().outlook.nights.find(n => n.lowF <= 34);
    return {
      alerts: rules.map(r => ({ placeUuid: null, note: null, lastCheckedAt: new Date().toISOString(), lastError: null, ...r, unit: units[r.kind], placeName: 'Home', describe: words(r), forecastKnown: true,
        next: r.kind === 'cold' && frost && frost.lowF <= r.threshold ? { at: frost.at, value: frost.lowF, when: 'around 6 AM Wednesday', label: `${frost.lowF}°F` } : null })),
      recent: rules.some(r => r.kind === 'cold') ? [{ alertUuid: rules[0].uuid, text: 'Frost alert for Home: down to 34°F around 7 AM tomorrow — clear and still enough for frost. Cover tender plants.', value: 34, weatherAt: null, pushed: true, firedAt: new Date(Date.now() - 20 * 3600000).toISOString() }] : [],
      places: [{ uuid: 'p-home', name: 'Home', kind: 'home' }, { uuid: 'p-church', name: 'Troutman ARP Church', kind: 'church' }],
      kinds: ['cold', 'heat', 'rain', 'snow', 'ice', 'storm', 'wind'],
    };
  }
  if (p.startsWith('/api/v1/place-reminders')) {
    const uuid = p.split('/')[4] ? decodeURIComponent(p.split('/')[4]) : null;
    let list = mockPlaceReminders();
    if (method === 'DELETE') { list = list.filter((x) => x.uuid !== uuid); localStorage.setItem('mock_place_reminders', JSON.stringify(list)); }
    // ?phone=problem: the phone has lost "Allow all the time" (the 10-08 case).
    const phone = new URLSearchParams(window.location.search).get('phone') === 'problem'
      ? { problem: 'no_background_location', message: "Your phone isn't letting Athena use location in the background, so place reminders can't fire. On the phone: Settings → Apps → Athena → Permissions → Location → Allow all the time.", armed: list.length, fences: 0, reportedAt: new Date(Date.now() - (90) * 60000).toISOString(), syncedAt: new Date(Date.now() - (16 * 1440) * 60000).toISOString(), phone: 'Athena Android' }
      : { problem: null, message: null, armed: list.length, fences: list.length, reportedAt: new Date(Date.now() - (30) * 60000).toISOString(), syncedAt: new Date(Date.now() - (12) * 60000).toISOString(), phone: 'Athena Android' };
    return { reminders: list, phone };
  }
  if (p === '/api/v1/dashboard/health/body/calibration' && method === 'POST') {
    const reference = { uuid: `c${Date.now()}`, measured_on: body.measured_on, source: body.source || null, height_cm: body.height_cm ?? null, body_fat_percent: body.body_fat_percent ?? null, skeletal_muscle_kg: body.skeletal_muscle_kg ?? null, fat_free_mass_kg: body.fat_free_mass_kg ?? null, body_water_percent: body.body_water_percent ?? null };
    localStorage.setItem('mock_body_references', JSON.stringify([reference, ...mockBodyReferences()]));
    return { reference };
  }
  if (p.startsWith('/api/v1/dashboard/health/body/calibration/') && method === 'DELETE') {
    const uuid = decodeURIComponent(p.split('/').pop() || '');
    localStorage.setItem('mock_body_references', JSON.stringify(mockBodyReferences().filter(r => r.uuid !== uuid)));
    return { removed: true };
  }
  if (p === '/api/v1/dashboard/health/family' && method === 'POST') {
    const list = storedHealth();
    let w = list.find(x => x.status === 'active' && x.personName.toLowerCase() === String(body.personName).toLowerCase());
    const hours = 'checkInHours' in body ? body.checkInHours : w?.checkInHours ?? null;
    if (w) Object.assign(w, { symptom: body.symptom, severity: body.severity || 'mild', notes: body.notes || null, checkInHours: hours, lastUpdateAt: new Date().toISOString() });
    else list.push(w = { uuid: `h${Date.now()}`, personName: body.personName, symptom: body.symptom, severity: body.severity || 'mild', status: 'active', startedAt: dayStamp(0), resolvedAt: null, notes: body.notes || null, checkInHours: hours, lastUpdateAt: new Date().toISOString() });
    localStorage.setItem('mock_family_health', JSON.stringify(list));
    return { status: mockHealth().find(x => x.uuid === w!.uuid) };
  }
  if (/^\/api\/v1\/dashboard\/health\/family\/[^/]+\/resolve$/.test(p) && method === 'PATCH') {
    const uuid = decodeURIComponent(p.split('/')[6]);
    const list = storedHealth().map(x => x.uuid === uuid ? { ...x, status: 'resolved' as const, resolvedAt: dayStamp(0) } : x);
    localStorage.setItem('mock_family_health', JSON.stringify(list));
    return { status: list.find(x => x.uuid === uuid) };
  }
  if (p.startsWith('/api/v1/dashboard/family/people')) {
    // Children from the family profiles; links to Google Contacts kept in localStorage.
    const md = (offsetDays: number) => { const d = new Date(Date.now() + offsetDays * DAY); return `2016-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const linkedBirthday: Record<string, string | null> = { '111': null, '222': null, '333': null, '444': '--' + md(5).slice(5) };
    const factUuid = p.split('/')[6] ? decodeURIComponent(p.split('/')[6]) : null;
    let stored: { factUuid: string; contactId: string; name: string }[] = JSON.parse(localStorage.getItem('mock_family_links') || '[]');
    if (method === 'PUT' && factUuid) {
      if (stored.some((l) => l.contactId === body.contactId && l.factUuid !== factUuid)) fail(400, 'That contact is already linked to someone else. Unlink them there first.');
      stored = [...stored.filter((l) => l.factUuid !== factUuid), { factUuid, contactId: body.contactId, name: body.name }];
    }
    if (method === 'DELETE' && factUuid) stored = stored.filter((l) => l.factUuid !== factUuid);
    // Without /contact on the end it is "forget this person", as on the server.
    if (method === 'DELETE' && factUuid && !p.endsWith('/contact')) { const i = facts.findIndex((f) => f.uuid === factUuid); if (i >= 0) facts.splice(i, 1); }
    localStorage.setItem('mock_family_links', JSON.stringify(stored));
    const off = mockContactsOff();
    return {
      contactsLinked: stored.length ? !off : null,
      children: [{ uuid: 'c1', name: 'Maya', birthday: md(3), grade: '3' }, { uuid: 'c2', name: 'Eli', birthday: null, grade: 'K' }],
      links: stored.map((l) => {
        const c = MOCK_CONTACTS.find((x) => x.contactId === l.contactId);
        return { factUuid: l.factUuid, contactId: l.contactId, name: l.name, status: off ? 'not_connected' : c ? 'ok' : 'missing', card: !off && c ? { contactId: c.contactId, name: c.name, birthday: linkedBirthday[c.contactId] ?? null, phone: c.phone, email: c.email, photoUrl: null } : null };
      }),
    };
  }
  if (p === '/api/v1/dashboard/community/calendar') {
    const ev = (id: string, title: string, mins: number, len: number) => ({ id, title, start: inMinutes(mins), end: inMinutes(mins + len), allDay: false, location: null, calendar: null, shared: false, eventType: 'default' });
    return { connected: true, terms: ['Troutman'], events: [ev('t0', 'Maya softball game', 3 * 60, 90), ev('t1', 'Troutman soccer practice', 30 * 60, 90), ev('t2', 'Troutman Rec game vs Mooresville', 4 * 24 * 60 - 120, 60), ev('t3', 'Troutman Founders Day 5K', 4 * 24 * 60 + 420, 90)] };
  }
  if (p.startsWith('/api/v1/dashboard/workplaces')) {
    type W = { uuid: string; name: string; role: string | null; domain: string | null; primary: boolean; notes: string | null };
    type L = { uuid: string; workplace: string; credential?: string; email?: string; site?: string; project?: string };
    const conns = [
      { credentialUuid: 'c-jira', provider: 'jira', label: 'Jira Cloud', account: 'vivacitytech.atlassian.net · rbryson@vivacitytech.com', status: 'active' },
      { credentialUuid: 'c-gmail', provider: 'gmail', label: 'Gmail', account: 'sam@example.com', status: 'needs_reauth' },
    ];
    let list: W[] = JSON.parse(localStorage.getItem('mock_workplaces') || 'null') || [
      { uuid: 'w1', name: 'Vivacity Tech PBC', role: 'Senior Software Engineer', domain: 'vivacitytech.com', primary: true, notes: null },
      { uuid: 'w2', name: 'Orcwood LLC', role: 'Software Engineer and Co-owner', domain: 'orcwood.com', primary: false, notes: null },
    ];
    let links: L[] = JSON.parse(localStorage.getItem('mock_workplace_links') || '[]');
    const seg = p.split('/');
    const uuid = decodeURIComponent(seg[5] || '');
    const keep = () => {
      localStorage.setItem('mock_workplaces', JSON.stringify(list));
      localStorage.setItem('mock_workplace_links', JSON.stringify(links));
      const linked = new Set(links.map(l => l.credential));
      return {
        workplaces: [...list].sort((x, y) => Number(y.primary) - Number(x.primary) || x.name.localeCompare(y.name)).map(w => ({
          ...w,
          emails: links.filter(l => l.workplace === w.uuid && l.email).map(l => ({ uuid: l.uuid, email: l.email })),
          connections: links.filter(l => l.workplace === w.uuid && l.credential).map(l => ({ uuid: l.uuid, ...conns.find(c => c.credentialUuid === l.credential)! })),
          sites: links.filter(l => l.workplace === w.uuid && l.site).map(l => ({ uuid: l.uuid, siteUuid: l.site! })),
          projects: links.filter(l => l.workplace === w.uuid && l.project).map(l => ({ uuid: l.uuid, projectUuid: l.project! })),
        })),
        available: conns.filter(c => !linked.has(c.credentialUuid)).map(c => ({ ...c, suggestedWorkplace: c.account.includes('@vivacitytech.com') ? 'w1' : null })),
      };
    };
    if (method === 'GET' && seg[6] === 'dashboard') {
      const ago = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
      const pr = (id: number, repo: string, title: string, h: number, extra: Record<string, unknown> = {}) => ({ id, number: id, title, url: `https://github.com/vivacity/${repo}/pull/${id}`, repo, repoFull: `vivacity/${repo}`, author: 'rbryson', mine: true, reviewRequested: false, draft: false, comments: 0, createdAt: ago(h + 20), updatedAt: ago(h), ...extra });
      return {
        pullRequests: { login: 'rbryson', error: null, items: [
          pr(31, 'Dream_frontned', 'Fix profile avatar crop', 3), pr(12, 'API-Gateway', 'Rate limit header', 1, { mine: false, author: 'sam', reviewRequested: true, comments: 4 }),
          pr(88, 'Dream-Backend', 'Add retries to export job', 5, { comments: 2 }), pr(7, 'helpful_db_scripts', 'Backfill script for orders', 30, { draft: true }),
          pr(89, 'Dream-Backend', 'Bump dependencies', 26),
        ] },
        epics: { error: null, items: [
          { key: 'DREAM-12', title: 'Onboarding revamp', status: 'In Progress', statusCategory: 'indeterminate', project: 'Dream', updated: ago(4), due: null, url: 'https://vivacitytech.atlassian.net/browse/DREAM-12', done: 7, total: 11 },
          { key: 'DREAM-4', title: 'Billing migration', status: 'To Do', statusCategory: 'new', project: 'Dream', updated: ago(70), due: null, url: 'https://vivacitytech.atlassian.net/browse/DREAM-4', done: 0, total: 5 },
        ] },
      };
    }
    if (method === 'GET') return keep();
    if (seg[6] === 'links') {
      if (method === 'DELETE') { links = links.filter(l => l.uuid !== decodeURIComponent(seg[7] || '')); return keep(); }
      const key = body.site ? 'site' : body.project ? 'project' : body.credential ? 'credential' : 'email';
      const value = key === 'email' ? String(body.email).trim().toLowerCase() : body[key];
      const owner = links.find(l => l[key] === value);
      if (owner && owner.workplace !== uuid) throw Object.assign(new Error(`That already belongs to ${list.find(w => w.uuid === owner.workplace)?.name}. Unlink it there first.`), { status: 400 });
      if (!owner) links.push({ uuid: `l${Date.now()}`, workplace: uuid, [key]: value });
      return keep();
    }
    if (method === 'DELETE') { list = list.filter(w => w.uuid !== uuid); links = links.filter(l => l.workplace !== uuid); return keep(); }
    const old = list.find(w => w.uuid === uuid);
    const next: W = { ...(old || { uuid: `w${Date.now()}`, role: null, domain: null, notes: null, primary: !list.length }), ...body };
    if (next.primary) list = list.map(w => ({ ...w, primary: false }));
    list = old ? list.map(w => w.uuid === uuid ? next : w) : [...list, next];
    return { workplace: next, ...keep() };
  }
  if (p === '/api/v1/dashboard/websites' && method === 'GET') return { sites: MOCK_SITES };
  if (p === '/api/v1/dashboard/websites/check') {
    const ms = (base: number) => Array.from({ length: 12 }, (_, i) => ({ ok: true, ms: base + Math.round(Math.sin(i) * 40) + 40 }));
    return { sites: MOCK_SITES.map((s, i) => ({ ...s, uptime: { ok: true, statusCode: 200, ms: [189, 221][i] ?? 200, error: null, checkedAt: new Date(Date.now() - 5 * 60_000).toISOString(), recent: ms([150, 180][i] ?? 160) } })) };
  }
  if (p === '/api/v1/dashboard/work/agents') return { runs: [
    ...mockReviewRuns(),
    { uuid: 'r1', kind: 'investigation', repo: 'jrbryson/athena-core-api', summary: 'Weather card shows yesterday’s high after midnight', state: null, at: new Date(Date.now() - 12 * 60_000).toISOString() },
    { uuid: 'r2', kind: 'fix', repo: 'jrbryson/athena-companion', summary: 'Keep the map legend from wrapping on phones', state: 'open', at: new Date(Date.now() - 2 * 3600_000).toISOString() },
  ] };
  if (p === '/api/v1/dashboard/websites/discover') {
    return {
      linked: true,
      searchSites: [
        { site: 'sc-domain:orcwood.com', host: 'orcwood.com', permission: 'siteOwner', suggestedProperty: '22' },
        { site: 'sc-domain:family-chores.app', host: 'family-chores.app', permission: 'siteOwner', suggestedProperty: '11' },
      ],
      properties: [{ property: '11', name: 'Family Chores', account: 'Bryson' }, { property: '22', name: 'Orcwood Games', account: 'Bryson' }],
    };
  }
  if (p.startsWith('/api/v1/dashboard/websites') && p.endsWith('/refresh')) return { sites: MOCK_SITES };
  if (p === '/api/v1/dashboard/community') return mockCommunity();
  if (p === '/api/v1/dashboard/community/weather') {
    const start = new Date(); start.setMinutes(0, 0, 0);
    const hours = Array.from({ length: 24 }, (_, i) => {
      const at = new Date(start.getTime() + i * 3600000);
      const h = at.getHours();
      return { start: at.toISOString(), temperatureF: Math.round(56 + 12 * Math.sin(((h - 9) / 24) * Math.PI * 2)), precipitationChance: 5, windSpeed: '5 mph', shortForecast: h >= 7 && h < 19 ? (h > 15 ? 'Partly Sunny' : 'Sunny') : 'Clear', isDaytime: h >= 7 && h < 19 };
    });
    return { status: 'ready', place: 'Home', weather: { town: 'Troutman, NC', now: hours[0], hours, checkedAt: new Date().toISOString() } };
  }
  if (p === '/api/v1/dashboard/community/contacts') {
    if (mockContactsOff()) return { linked: false, matches: [] };
    const q = (new URL(path, window.location.origin).searchParams.get('q') || '').trim().toLowerCase();
    return { linked: true, matches: q.length < 2 ? [] : MOCK_CONTACTS.filter((c) => c.name.toLowerCase().includes(q) || (c.email || '').includes(q)).map((c) => ({ ...c, linkedTo: mockLinkedTo(c.contactId) })) };
  }
  if (p === '/api/v1/dashboard/community/contacts/at') {
    if (mockContactsOff()) return { linked: false, matches: [] };
    const street = mockStreet(new URL(path, window.location.origin).searchParams.get('address'));
    return { linked: true, matches: MOCK_CONTACTS.filter((c) => street && mockStreet(c.address) === street).map((c) => ({ ...c, linkedTo: mockLinkedTo(c.contactId) })) };
  }
  if (p.startsWith('/api/v1/dashboard/community/door-rounds')) {
    // Street checks kept in localStorage; the "map" lists a few houses on any street named.
    type MockDoor = { address: string; status: string; note: string | null; checkedAt: string | null; household: null | { name: string | null; contact: string | null; notes: string | null } };
    type MockRound = { uuid: string; street: string; placeUuid: string | null; source: string; createdAt: string; closedAt: string | null; doors: MockDoor[] };
    const rounds: MockRound[] = JSON.parse(localStorage.getItem('mock_door_rounds') || '[]');
    const save = () => localStorage.setItem('mock_door_rounds', JSON.stringify(rounds));
    const summary = (r: MockRound) => ({ uuid: r.uuid, street: r.street, total: r.doors.length, checked: r.doors.filter((d) => d.status !== 'todo').length, needsHelp: r.doors.filter((d) => d.status === 'needs_help').length, createdAt: r.createdAt, closedAt: r.closedAt });
    const [, , , , , , uuidRaw, sub] = p.split('/');
    const uuid = uuidRaw ? decodeURIComponent(uuidRaw) : null;
    const round = uuid ? rounds.find((r) => r.uuid === uuid) : null;
    if (!uuid) {
      if (method === 'POST') {
        const street = String(body?.street || 'Rushing Water Lane').trim();
        const doors = [149, 151, 153, 155, 154, 152, 150, 148].map((n): MockDoor => ({ address: `${n} ${street}`, status: 'todo', note: null, checkedAt: null, household: n === 152 ? { name: 'The Hendersons', contact: null, notes: 'the blue house; dog named Duke' } : null }));
        const made: MockRound = { uuid: `door-${Date.now()}`, street, placeUuid: body?.placeUuid || null, source: 'osm', createdAt: new Date().toISOString(), closedAt: null, doors };
        rounds.unshift(made); save();
        return { round: made };
      }
      return { rounds: rounds.map(summary) };
    }
    if (!round) fail(404, 'That street check is no longer on your list.');
    if (method === 'DELETE') { rounds.splice(rounds.indexOf(round!), 1); save(); return { rounds: rounds.map(summary) }; }
    if (sub === 'doors') {
      if (!/^\d+\s+\S/.test(String(body?.address || '').trim())) fail(400, 'A house needs a number and a street, like "152 Rushing Water Lane".');
      round!.doors.push({ address: String(body.address).trim(), status: 'todo', note: null, checkedAt: null, household: null }); save();
    }
    if (sub === 'sync') {
      const norm = (a: string) => a.toLowerCase().replace(/\blane\b/, 'ln');
      for (const u of body?.updates || []) {
        const d = round!.doors.find((x) => norm(x.address) === norm(u.address));
        if (d && (!d.checkedAt || d.checkedAt <= u.at)) { d.status = u.status; d.note = u.note || null; d.checkedAt = u.status === 'todo' ? null : u.at; }
      }
      save();
    }
    if (sub === 'close') { round!.closedAt = body?.closed === false ? null : new Date().toISOString(); save(); }
    return { round };
  }
  if (p.startsWith('/api/v1/dashboard/community/neighbors')) {
    const uuid = p.split('/')[6] ? decodeURIComponent(p.split('/')[6]) : null;
    if (method === 'DELETE') localStorage.setItem('mock_neighbors', JSON.stringify(mockNeighbors().filter((x) => x.uuid !== uuid)));
    else {
      if (!/^\d/.test(String(body?.address || '').trim())) fail(400, 'Start the address with the house number and street, like 152 Rushing Water Ln.');
      const others = mockNeighbors().filter((x) => x.uuid !== uuid);
      if (others.some((x) => mockStreet(x.address) === mockStreet(body.address))) fail(400, `You already have a household at ${String(body.address).split(',')[0]} — edit that one instead.`);
      const taken = (body.contacts || []).find((c: { contactId: string }) => others.some((x) => x.contacts.some((y) => y.contactId === c.contactId)));
      if (taken) fail(400, `${taken.name || 'That contact'} is already linked to another household. Unlink them there first.`);
      mockUpsert<MockNeighbor>('mock_neighbors', mockNeighbors(), uuid, { name: body.name || null, address: body.address, latitude: body.latitude ?? null, longitude: body.longitude ?? null, placeUuid: body.placeUuid || null, where: body.where || null, contact: body.contact || null, notes: body.notes || null, contacts: body.contacts || [] });
    }
    return { neighbors: withMockContacts(mockNeighbors()) };
  }
  if (p.startsWith('/api/v1/dashboard/community/events')) {
    const uuid = p.split('/')[6] ? decodeURIComponent(p.split('/')[6]) : null;
    if (method === 'DELETE') localStorage.setItem('mock_events', JSON.stringify(mockEvents().filter((x) => x.uuid !== uuid)));
    else {
      if (!String(body?.title || '').trim()) fail(400, 'Give the event a name, like Ham Day.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body?.startsOn || '')) fail(400, 'Pick the day it happens.');
      mockUpsert<MockEvent>('mock_events', mockEvents(), uuid, { title: body.title.trim(), startsOn: body.startsOn, endsOn: body.endsOn || null, time: body.time || null, placeUuid: body.placeUuid || null, location: body.location || null, repeats: body.repeats === 'yearly' ? 'yearly' : 'none', url: body.url || null, notes: body.notes || null });
    }
    return { events: mockEventList() };
  }
  if (p === '/api/v1/dashboard/community/house-at') {
    // A pretend street: the house number comes from where the tap was; taps far north have no number, like a rural road.
    const sp = new URL(path, window.location.origin).searchParams;
    const lat = Number(sp.get('lat')); const lon = Number(sp.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) fail(400, 'Tap a house on the map.');
    if (lat > 35.71) return { address: null, latitude: lat, longitude: lon, street: 'Perth Road', household: null };
    const address = `${100 + (Math.round(Math.abs(lon) * 4000) % 40) * 2} Rushing Water Lane`;
    const n = mockNeighbors().find((x) => mockStreet(x.address) === mockStreet(address));
    return { address, latitude: lat, longitude: lon, street: 'Rushing Water Lane', household: n ? { uuid: n.uuid, label: n.name || null } : null };
  }
  if (p === '/api/v1/dashboard/incidents/geocode') {
    const q = new URL(path, window.location.origin).searchParams.get('q') || '';
    if (/nowhere/i.test(q)) return { matches: [] };
    return { matches: [{ label: `${q.toUpperCase()}`, latitude: 35.7054, longitude: -80.8617 }] };
  }
  if (p === '/api/v1/dashboard/news/sources') {
    if (method === 'PUT') {
      const wanted: { url: string; label?: string | null; scope?: 'world' | 'personal' }[] =
        (Array.isArray(body?.sources) ? body.sources : []).map((entry: unknown) =>
          typeof entry === 'string' ? { url: entry } : (entry as { url: string }));
      if (wanted.length > 12) fail(400, 'I can watch up to 12 pages for you.');
      newsSources = wanted.map((entry, index) => {
        let url = entry.url.trim();
        if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
        let host: string;
        try { host = new URL(url).hostname; } catch { return fail(400, 'That does not look like a web address.'); }
        if (!host.includes('.')) fail(400, 'That does not look like a public web address.');
        const existing = newsSources.find(source => source.url === url || source.host === host);
        // A page she already watches keeps its rhythm and history, exactly like
        // the real reconcile; a new one starts at six hours until she has looked.
        return existing || {
          uuid: `src-new-${index}-${host}`, url, host, label: entry.label || host,
          scope: entry.scope === 'personal' ? 'personal' : 'world', enabled: true,
          everyMinutes: 360, rhythm: 'every 6 hours', baselineMinutes: 360, setBy: 'default',
          reason: null, fasterUntil: null, lastCheckedAt: null, nextCheckAt: iso(0), lastChangedAt: null,
          lastError: null, headlines: 0,
        };
      });
    }
    return { sources: newsSources, maxSources: 12 };
  }
  if (p.startsWith('/api/v1/dashboard/news/sources/')) {
    const uuid = decodeURIComponent(p.slice('/api/v1/dashboard/news/sources/'.length));
    const source = newsSources.find(entry => entry.uuid === uuid);
    if (!source) fail(404, 'That source is not on your list.');
    if (method === 'DELETE') {
      newsSources = newsSources.filter(entry => entry.uuid !== uuid);
      return { success: true };
    }
    if (body?.scope) source.scope = body.scope === 'personal' ? 'personal' : 'world';
    if (typeof body?.label === 'string') source.label = body.label || source.host;
    if (typeof body?.enabled === 'boolean') source.enabled = body.enabled;
    return { source };
  }
  if (p === '/api/v1/dashboard/news/check') {
    // The real one visits whatever is due and returns when it has. Nothing to
    // fetch here, so it reports the pages it would have read.
    return { checked: newsSources.length, changed: 0, failed: 0, cooling: false };
  }
  // Dreams. ?dreams=none shows the "hasn't dreamed yet" state.
  if (p.startsWith('/api/v1/dreams')) {
    const none = new URLSearchParams(window.location.search).get('dreams') === 'none';
    const dreams = none ? [] : mockDreams();
    if (p === '/api/v1/dreams/latest') return { dream: dreams[0] || null };
    if (p === '/api/v1/dreams') return { dreams };
    if (p === '/api/v1/dreams/questions') {
      return { questions: none ? [] : [
        { uuid: 'q1', question: 'Is the Emma who moved to Denver the same Emma who’s your sister?', status: 'pending', answer: null, askedAt: new Date(Date.now() - 8 * 3600e3).toISOString(), answeredAt: null },
        { uuid: 'q2', question: 'Is “the lake house” the same place as the cabin on Lake Norman?', status: 'answered', answer: 'Yes — same place.', askedAt: new Date(Date.now() - 3 * 86400e3).toISOString(), answeredAt: new Date(Date.now() - 2 * 86400e3).toISOString() },
      ] };
    }
    const found = dreams.find(d => p.endsWith(d.uuid));
    return { dream: found ? { ...found, steps: mockDreamSteps() } : null };
  }
  if (p === '/api/v1/dashboard/right-now') return mockRightNow();
  if (p === '/api/v1/dashboard/places') {
    if (method === 'POST') {
      const place = {
        ...mockPlaces[0], uuid: `place-${Date.now()}`, label: body?.label || 'A new place',
        url: String(body?.url || ''), activity: String(body?.activity || 'something'),
        distanceMi: body?.distanceMi ?? null,
        state: 'unknown' as const, statusText: null, weatherDependent: false, hours: null,
        now: { openNow: null as boolean | null, why: 'Hours unknown', closesAt: null, closesInMinutes: null, todaysHours: [] },
      };
      mockPlaces = [...mockPlaces, place];
      return { place };
    }
    return { places: mockPlaces, maxPlaces: 25 };
  }
  if (p.startsWith('/api/v1/dashboard/places/')) {
    const uuid = decodeURIComponent(p.split('/')[5]);
    const place = mockPlaces.find(x => x.uuid === uuid);
    if (!place) fail(404, 'That place is not on your list.');
    if (method === 'DELETE') { mockPlaces = mockPlaces.filter(x => x.uuid !== uuid); return { success: true }; }
    if (p.endsWith('/check')) { place!.lastCheckedAt = new Date().toISOString(); return { result: { status: 'unchanged' }, place }; }
    return { place };
  }
  if (method === 'POST' && (p === '/api/v1/projects/property/bills/scan' || p === '/api/v1/projects/property/bills/review')) {
    await wait(1400);
    return mockBillScan(p.endsWith('/review') ? body : {});
  }
  const projectAnswer = mockProjectsRoute(method, p, url.searchParams, body);
  if (projectAnswer !== undefined) return projectAnswer;
  if (p === '/api/v1/dashboard/email/receipts') {
    const today = new Date().toISOString().slice(0, 10);
    const ago = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
    const filed = mockEmails.filter((e) => e.status === 'actioned' && e.category === 'receipt').map((e) => {
      const x = (e.extracted || {}) as { merchant?: string; category?: string; amount?: number; currency?: string; purchased_at?: string };
      return { uuid: `rcpt-${e.uuid}`, merchant: x.merchant || e.from_name || null, category: x.category || null, amount: x.amount ?? null, currency: x.currency || 'USD', date: x.purchased_at || today, dated: !!x.purchased_at, subject: e.subject };
    });
    const earlier = [
      { uuid: 'rcpt-1', merchant: 'USAA', category: 'insurance', amount: 459.63, currency: 'USD', date: today, dated: true, subject: 'Your USAA payment was received' },
      { uuid: 'rcpt-2', merchant: 'Duke Energy', category: 'energy', amount: 142.55, currency: 'USD', date: ago(6), dated: true, subject: 'Your October bill is ready' },
      { uuid: 'rcpt-3', merchant: 'Kroger', category: 'groceries', amount: 84.32, currency: 'USD', date: ago(9), dated: true, subject: 'Your Kroger order #48213' },
      { uuid: 'rcpt-4', merchant: 'Walmart', category: 'groceries', amount: null, currency: 'USD', date: ago(40), dated: false, subject: 'Thanks for your order' },
    ];
    const receipts = [...filed, ...earlier].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const byMonth = new Map<string, { month: string; count: number; totals: Map<string, number> }>();
    for (const r of receipts) {
      const month = String(r.date).slice(0, 7);
      const m = byMonth.get(month) || { month, count: 0, totals: new Map() };
      m.count++;
      if (r.amount !== null) m.totals.set(r.currency, Math.round(((m.totals.get(r.currency) || 0) + r.amount) * 100) / 100);
      byMonth.set(month, m);
    }
    return { receipts, truncated: false, months: [...byMonth.values()].map((m) => ({ month: m.month, count: m.count, totals: [...m.totals].map(([currency, amount]) => ({ currency, amount })) })) };
  }
  if (p === '/api/v1/dashboard/email/scan') {
    // Simulates "Scan more" turning up a bit more of the backlog, once.
    const reserve: MockEmail[] = [
      { uuid: 'email-7', gmail_message_id: 'g-107', thread_id: 't-107', subject: 'Your Chipotle order is on its way', from_address: 'noreply@chipotle.com', from_name: 'Chipotle', received_at: iso(DAY * 7), category: 'receipt', group_key: 'chipotle', extracted: { merchant: 'Chipotle', category: 'dining_out', amount: 14.75, currency: 'USD', purchased_at: dayStamp(7) }, status: 'new', created_at: iso(DAY * 7), body: 'Your order is being prepared!\n\n1x Chicken burrito bowl    $11.25\n1x Chips & guac             $3.50\n\nTotal: $14.75\nPickup at: 4th & Main\n\nTrack your order in the Chipotle app.' },
    ];
    const already = new Set(mockEmails.map((e) => e.gmail_message_id));
    const added = reserve.filter((e) => !already.has(e.gmail_message_id));
    mockEmails = [...mockEmails, ...added];
    const byCategory: Record<string, number> = {};
    for (const e of added) byCategory[e.category] = (byCategory[e.category] || 0) + 1;
    return { scanned: added.length, newCount: added.length, byCategory };
  }
  if (p === '/api/v1/dashboard/email/group/propose') {
    const uuids: string[] = Array.isArray(body?.email_triage_uuids) ? body.email_triage_uuids : [];
    const rows = mockEmails.filter((e) => uuids.includes(e.uuid));
    if (!rows.length) fail(404, 'Those emails could not be found');
    return { success: true, action: proposeEmailAction(rows, body?.overrides || {}) };
  }
  if (method === 'POST' && /^\/api\/v1\/dashboard\/email\/[^/]+\/reply\/suggest$/.test(p)) {
    await wait(900);
    const row = mockEmails.find((e) => e.uuid === decodeURIComponent(p.split('/')[5]));
    if (!row) fail(404, 'That email is no longer open');
    return { success: true, body: `Hi ${row!.from_name || 'there'} — thanks for the reminder. I'll send the final roster [tonight]. See you Tuesday at 6.

Sam` };
  }
  if (method === 'POST' && /^\/api\/v1\/dashboard\/email\/[^/]+\/reply\/propose$/.test(p)) {
    const row = mockEmails.find((e) => e.uuid === decodeURIComponent(p.split('/')[5]));
    if (!row) fail(404, 'That email is no longer open');
    const text = String(body?.body || '');
    const action: MockAction = {
      uuid: `act-email-draft-${Date.now()}`, action_id: 'draft_reply', label: 'Save a reply draft',
      summary: `Save a draft reply to ${row!.from_name} in Gmail — not sent: "${text.length > 220 ? `${text.slice(0, 220)}…` : text}"`,
      rationale: null, params: { email_triage_uuid: row!.uuid, body: text }, status: 'pending', approval: null,
      reversible: true, result_ref: null, error: null,
      created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 15 * 60_000).toISOString(), executed_at: null,
    };
    proposals.push(action);
    return { success: true, action };
  }
  if (p === '/api/v1/dashboard/email/unsubscribe') {
    const uuids: string[] = Array.isArray(body?.email_triage_uuids) ? body.email_triage_uuids : [];
    const rows = mockEmails.filter((e) => uuids.includes(e.uuid) && e.status === 'new' && (e.extracted as { unsub?: string } | null)?.unsub);
    if (!rows.length) fail(404, 'None of those senders offers a one-click unsubscribe');
    const action: MockAction = {
      uuid: `act-email-unsub-${Date.now()}`, action_id: 'unsubscribe_senders', label: 'Unsubscribe from senders',
      summary: `Unsubscribe from ${rows.map((r) => r.from_name).join(', ')} and archive what they already sent — unsubscribing can't be undone from here`,
      rationale: null, params: { items: rows.map((r) => ({ email_triage_uuid: r.uuid, sender: r.from_name })) }, status: 'pending', approval: null,
      reversible: false, result_ref: null, error: null,
      created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 15 * 60_000).toISOString(), executed_at: null,
    };
    proposals.push(action);
    return { success: true, action };
  }
  if (p === '/api/v1/dashboard/email/events') {
    const uuids: string[] = Array.isArray(body?.email_triage_uuids) ? body.email_triage_uuids : [];
    const rows = mockEmails.filter((e) => uuids.includes(e.uuid) && e.status === 'new' && (e.category === 'travel' || e.category === 'school')
      && (e.extracted as { start?: string } | null)?.start);
    if (!rows.length) fail(404, "None of those emails has a date Athena could read — open each to add one");
    const titles = rows.map((r) => `"${(r.extracted as { title?: string }).title || r.subject}"`);
    const action: MockAction = {
      uuid: `act-email-events-${Date.now()}`, action_id: 'add_email_events', label: 'Add events from emails',
      summary: `Add ${rows.length === 1 ? 'this event' : `${rows.length} events`} to your calendar — ${titles.join(', ')} — and file the emails`,
      rationale: null, params: { items: rows.map((r) => ({ email_triage_uuid: r.uuid })) }, status: 'pending', approval: null,
      reversible: true, result_ref: null, error: null,
      created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 15 * 60_000).toISOString(), executed_at: null,
    };
    proposals.push(action);
    return { success: true, action };
  }
  if (p === '/api/v1/dashboard/email/archive') {
    const uuids: string[] = Array.isArray(body?.email_triage_uuids) ? body.email_triage_uuids : [];
    const rows = mockEmails.filter((e) => uuids.includes(e.uuid) && e.status === 'new');
    if (!rows.length) fail(404, 'Those emails are no longer in your inbox');
    const action: MockAction = {
      uuid: `act-email-archive-${Date.now()}`, action_id: 'archive_emails', label: 'Archive emails',
      summary: `Archive ${rows.length === 1 ? 'this email' : `${rows.length} emails`} out of your inbox (still in All Mail and search)`,
      rationale: null, params: { email_triage_uuids: rows.map((r) => r.uuid) }, status: 'pending', approval: null,
      reversible: true, result_ref: null, error: null,
      created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 15 * 60_000).toISOString(), executed_at: null,
    };
    proposals.push(action);
    return { success: true, action };
  }
  if (p === '/api/v1/dashboard/email/undo-archive') {
    const original = proposals.find((a) => a.uuid === body?.action_uuid);
    if (!original || original.action_id !== 'archive_emails' || original.status !== 'done') fail(404, "That archive can't be undone");
    const ids = ((original!.params?.email_triage_uuids as string[]) || []).filter((id) => mockEmails.find((e) => e.uuid === id)?.status === 'archived');
    if (!ids.length) fail(404, 'None of those emails are archived any more');
    const action: MockAction = {
      uuid: `act-email-unarchive-${Date.now()}`, action_id: 'unarchive_emails', label: 'Move emails back to the inbox',
      summary: `Move ${ids.length === 1 ? 'this email' : `${ids.length} emails`} back to your inbox`,
      rationale: null, params: { email_triage_uuids: ids, undoes: original!.uuid }, status: 'pending', approval: null,
      reversible: true, result_ref: null, error: null,
      created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 15 * 60_000).toISOString(), executed_at: null,
    };
    proposals.push(action);
    return { success: true, action };
  }
  if (p === '/api/v1/dashboard/email/delete') {
    const uuids: string[] = Array.isArray(body?.email_triage_uuids) ? body.email_triage_uuids : [];
    const rows = mockEmails.filter((e) => uuids.includes(e.uuid));
    if (!rows.length) fail(404, 'Those emails could not be found');
    return { success: true, action: proposeDeleteAction(rows) };
  }
  if (method === 'POST' && /^\/api\/v1\/dashboard\/email\/[^/]+\/propose$/.test(p)) {
    const uuid = decodeURIComponent(p.split('/')[5]);
    const row = mockEmails.find((e) => e.uuid === uuid);
    if (!row) fail(404, 'That email could not be found');
    if (row!.category === 'other') fail(400, "There's nothing to propose for this email — dismiss it instead");
    return { success: true, action: proposeEmailAction([row!], body?.overrides || {}) };
  }
  if (method === 'POST' && /^\/api\/v1\/dashboard\/email\/[^/]+\/dismiss$/.test(p)) {
    const uuid = decodeURIComponent(p.split('/')[5]);
    const row = mockEmails.find((e) => e.uuid === uuid);
    if (!row) fail(404, 'That email could not be found');
    row!.status = 'dismissed';
    const action: MockAction = {
      uuid: `act-dismiss-${row!.uuid}`, action_id: 'dismiss_email', label: 'Dismiss from the mail list',
      summary: 'Dismiss this email from your mail list (nothing changes in Gmail)', rationale: null,
      params: { email_triage_uuid: row!.uuid }, status: 'done', approval: 'human', reversible: false,
      result_ref: row!.uuid, error: null, created_at: new Date().toISOString(),
      expires_at: iso(-DAY), executed_at: new Date().toISOString(),
    };
    proposals.push(action);
    return { success: true, action };
  }
  if (p.startsWith('/api/v1/dashboard/email/')) {
    const uuid = decodeURIComponent(p.slice('/api/v1/dashboard/email/'.length));
    const row = mockEmails.find((e) => e.uuid === uuid);
    if (!row) fail(404, 'That email could not be found');
    const siblings = row!.group_key
      ? mockEmails.filter((e) => e.uuid !== row!.uuid && e.group_key === row!.group_key && e.status === 'new')
      : [];
    return { ...row, siblings, bodyError: null };
  }
  if (p === '/api/v1/dashboard/email') {
    let items = mockEmails.filter((e) => e.status === (url.searchParams.get('status') || 'new'));
    const category = url.searchParams.get('category');
    if (category) items = items.filter((e) => e.category === category);
    return { items: [...items].sort((a, b) => String(b.received_at).localeCompare(String(a.received_at))) };
  }
  if (p === '/api/v1/dashboard/news') return dashboardNews();
  if (p.startsWith('/api/v1/system/')) return mockSystemBilling(p, new URLSearchParams(window.location.search));
  if (p === '/api/v1/session') return { session: { uuid: 'mock-session', mode: 'companion' } };
  if (p === '/api/v1/message' && method === 'GET') return [...messages];
  if (p === '/api/v1/message' && method === 'POST') {
    const human = { uuid: `h-${Date.now()}`, is_human: true, text: body.text, created_at: new Date().toISOString() };
    messages.push(human);
    // Stands in for the server's guessed "let me check…" line, returned with
    // the acknowledgement when the client asks for one (companion.filler).
    const fillerLine = !body.companion?.filler
      ? null
      : /sleep|recover/i.test(body.text)
        ? 'Let me check WHOOP, hmm…'
        : /tonight|tomorrow|calendar|plans|going on/i.test(body.text)
          ? 'Let me check your calendar, hmm…'
          : null;
    setTimeout(() => {
      const remember = /remember|recall/i.test(body.text);
      const proposed = maybePropose(body.text);
      messages.push({
        uuid: `a-${Date.now()}`,
        is_human: false,
        text: proposed
          ? proposed.approval === 'standing'
            ? "Done — I've put it in, since you told me not to ask."
            : 'I can do that. Have a look and tell me if it’s right.'
          : remember
            ? "I don't remember you telling me that one — tell me and I'll hold onto it."
            : /explain|tell me about/i.test(body.text)
              // Long enough to be voiced in parts (speechChunks).
              ? 'Sure. Your first meeting is the design review at ten, and it runs about an hour. ' +
                'After that you are free until lunch with Sam at noon. ' +
                'The afternoon is clear, so it would be a good time for the run you mentioned yesterday. ' +
                'If the weather holds, the loop by the lake is dry, and sunset is just after seven.'
              : 'Mm. Tell me more — is this about the trip, or something new?',
        created_at: new Date().toISOString(),
      });
      // Stands in for the real server's `actionProposed` WebSocket broadcast
      // (there is no socket in mock mode). Same event name useChat dispatches,
      // so useActions picks it up without waiting for its 20s poll.
      if (proposed) {
        window.dispatchEvent(new CustomEvent('athena-action-proposed', { detail: proposed }));
      }
    }, 1400);
    return fillerLine ? { message: human, filler: { key: 'mock', text: fillerLine } } : { message: human };
  }
  if (p === '/api/v1/memory/recall') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const items = [
      ...facts.filter((f) => `${f.key} ${f.value}`.toLowerCase().includes(q.split(' ').pop() || '')).map((f) => ({ type: 'fact', uuid: f.uuid, label: f.category, title: f.key, text: f.value, when: f.updated_at, score: 0.8 })),
      ...events.map((e) => ({ type: 'event', uuid: e.uuid, label: e.kind, title: e.title, text: e.content, when: e.occurred_at, mediaRef: e.media_ref, score: 0.6 })),
    ].slice(0, 5);
    return { intent: true, semantic: true, timeRange: /week/.test(q) ? { label: 'last week' } : null, items };
  }
  if (p === '/api/v1/memory/events' && method === 'GET') return events;
  if (p === '/api/v1/memory/events' && method === 'POST') {
    const e = { uuid: `e-${Date.now()}`, kind: 'event', scope: 'personal', title: body.title, content: body.content, occurred_at: new Date().toISOString(), importance: 7, source: 'user', media_ref: null, metadata: null };
    events.unshift(e);
    return { event: e };
  }
  if (p === '/api/v1/memory' && method === 'GET') return facts;
  if (p === '/api/v1/memory' && method === 'POST') {
    const f = facts.find((x) => x.category === body.category && x.key === body.key);
    if (f) Object.assign(f, { value: body.value, source: 'user', updated_at: new Date().toISOString() });
    return { success: true, memory: f };
  }
  if (p === '/api/v1/memory/journal') return journal;
  if (p === '/api/v1/memory/photos') {
    await wait(1600);
    // Dev: mock_bill_photo=true makes Show a photo recognise a bill, as the real one does for one.
    if (localStorage.getItem('mock_bill_photo') === 'true' && !body.skipBill) return { success: true, bill: mockBillScan() };
    const e = { uuid: `p-${Date.now()}`, kind: 'photo', scope: 'personal', title: 'A photo you shared', content: `A clear, well-lit scene.${body.caption ? `\nThey said: "${body.caption}"` : ''}\nIn it: (mock mode — no vision model).`, occurred_at: new Date().toISOString(), importance: 6, source: 'user', media_ref: body.mediaRef, metadata: null };
    events.unshift(e);
    return { event: e };
  }
  if (p === '/api/v1/vision/look-requests' && method === 'GET') {
    return { success: true, requests: lookRequests.filter((r) => r.status === 'pending') };
  }
  if (method === 'POST' && /^\/api\/v1\/vision\/look-requests\/[^/]+\/decline$/.test(p)) {
    const uuid = p.split('/')[5];
    const r = lookRequests.find((x) => x.uuid === uuid);
    if (r) r.status = 'declined';
    return { success: true, declined: !!r };
  }
  if (p === '/api/v1/vision/observe' || p === '/api/v1/vision/describe') {
    // Mock mode has no vision model, so this returns a plausible room rather
    // than describing the frame. It exists so the camera panel's full loop —
    // capture, encode, post, render the scene — can be exercised without a
    // backend. The frame is genuinely captured and genuinely discarded here.
    await wait(1200);
    if (body?.look_request_id) {
      const r = lookRequests.find((x) => x.uuid === body.look_request_id);
      if (r) r.status = 'fulfilled';
    }
    const scene = {
      source: { id: 'companion-web', kind: 'webcam', position: 'room' },
      captured_at: new Date().toISOString(),
      summary: 'A desk under a window, laptop open, mug to the left. Two people talking.',
      objects: [
        { label: 'person', description: 'seated, facing the camera', distance_m: 1.1, bearing_deg: -4, confidence: 0.94 },
        { label: 'person', description: 'standing behind the desk', distance_m: 2.3, bearing_deg: 18, confidence: 0.81 },
        { label: 'laptop', description: 'open, screen lit', distance_m: 0.7, bearing_deg: 0, confidence: 0.97 },
      ],
      hazards: [],
      notable: false,
      context: { driving: false, speed_kmh: null },
      servedBy: 'mock',
    };
    return { success: true, scene };
  }
  if (method === 'DELETE' && p.startsWith('/api/v1/memory')) return { success: true };
  if (p === '/api/v1/llm/status') return status;
  if (p === '/api/v1/llm/manifest') return manifest;
  if (p === '/api/v1/llm/monologue') {
    const at = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
    return {
      turns: [
        {
          at: at(2), message: 'who won the Braves game last night?', screen: 0.94,
          draft: 'The Braves beat the Mets 7-2 behind a big night from Acuña.',
          verdict: 'search', problems: ['The score and the standout player are guesses'],
          query: 'Braves Mets score last night', sources: ['mlb.com', 'espn.com'],
          final: 'They won, 5-3 over the Mets — Riley drove in three.', changed: true, ms: 5200,
        },
        {
          at: at(9), message: 'what time does my gym open on Sunday?', screen: 0.81,
          draft: 'Your gym opens at 7 on Sundays.',
          verdict: 'revise', problems: ["She doesn't know which gym or its hours"],
          query: null, sources: [], final: "I don't actually know your gym's Sunday hours — which one is it? I can look it up.",
          changed: true, ms: 2300,
        },
        {
          at: at(15), message: 'how far is the moon?', screen: 0.72,
          draft: 'About 239,000 miles on average.', verdict: 'ok', problems: [],
          query: null, sources: [], final: 'About 239,000 miles on average.', changed: false, ms: 1100,
        },
        { at: at(20), message: 'thanks!', screen: 0.03, draft: 'Anytime.', verdict: null, problems: [], query: null, sources: [], final: 'Anytime.', changed: false, ms: 280 },
      ],
    };
  }
  if (p === '/api/v1/devices' && method === 'GET') return devices;
  if (p === '/api/v1/devices/pairing-code') return { code: 'K7QP-3XMV', device_uuid: 'd-new', expires_in: 600 };
  if (method === 'DELETE' && p.startsWith('/api/v1/devices/')) return { success: true };
  if (p === '/api/v1/android/release') {
    return { available: true, versionCode: 262721530, versionName: '2026.09.29.1530', size: 128470920, builtAt: '2026-09-29T15:30:00Z', notes: null };
  }
  if (p === '/api/v1/android/release/link') {
    return { url: 'https://storage.googleapis.com/athena-android-releases/android/Athena-2026.09.29.1530.apk?X-Goog-Signature=mock', expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), versionCode: 262721530, versionName: '2026.09.29.1530' };
  }

  if (p === '/api/v1/initiative' && method === 'GET') {
    return {
      pref: initiativePref,
      push: {
        // Flip mock_push_unavailable to preview the "not set up on this
        // server" copy, which is what most installs will actually see.
        available: localStorage.getItem('mock_push_unavailable') !== 'true',
        transports: { fcm: true, webpush: true },
        enabled: initiativePref.push_enabled,
        devices: devices.map((d) => ({ uuid: d.uuid, name: d.name, platform: d.platform })),
      },
      scores: triggerScores,
      catalog: TRIGGER_CATALOG,
      muted: mutedTriggers,
      recent: [...nudges].reverse(),
    };
  }
  // Why she is quiet. The failure shapes are the point of the mock: a muted
  // trigger, a provider that is not connected, and a cooldown all have to be
  // distinguishable in the panel without a real backend.
  if (p.startsWith('/api/v1/initiative/diagnostics') && method === 'GET') {
    return {
      pref: initiativePref,
      model_access: { ok: true, reason: null },
      budget: {
        blocked_by: initiativePref.enabled ? null : 'not enabled',
        in_quiet_hours: false,
        today: 4,
        // No ceiling since the interruption budget was removed.
        daily_cap: null,
        last_nudge_at: new Date(Date.now() - 30 * 60_000).toISOString(),
        minutes_until_next_allowed: 0,
      },
      held: 0,
      linked_providers: ['google_calendar'],
      triggers: TRIGGER_CATALOG.map((t, i) => ({
        ...t,
        missing_sources: t.sources.filter((sname: string) => sname !== 'google_calendar'),
        muted: mutedTriggers.includes(t.id),
        suppressed: Boolean(triggerScores[t.id]?.suppressed),
        score: triggerScores[t.id]?.score ?? null,
        last_fired_at: null,
        cooldown_minutes_left: 0,
        // Only two things can still refuse: an explicit mute, and a provider
        // that is not connected.
        blocked_by: mutedTriggers.includes(t.id)
          ? 'you muted it'
          : t.sources.some((sname: string) => sname !== 'google_calendar')
            ? `not connected: ${t.sources.filter((sname: string) => sname !== 'google_calendar').join(', ')}`
            : null,
        would_fire: i === 0,
        brief: i === 0 ? '"Standup" starts at 2:00 pm, about 15 minutes from now.' : undefined,
      })),
      evaluated: true,
      push: { available: true, transports: { fcm: true, webpush: true }, enabled: initiativePref.push_enabled, devices: [] },
    };
  }
  if (p === '/api/v1/initiative/test-notification' && method === 'POST') {
    if (!initiativePref.push_enabled) {
      return { success: true, sent: 0, failed: 0, devices: 0, results: [], skipped: 'not enabled' };
    }
    // One of each, so the panel's failure rendering is exercised rather than
    // only its happy path.
    return {
      success: true,
      sent: 1,
      failed: 1,
      devices: 2,
      results: [
        { uuid: 'd-1', name: 'Athena Android', platform: 'android', ok: true, reason: null },
        { uuid: 'd-2', name: 'Chrome on Windows', platform: 'web', ok: false, reason: 'HTTP_410' },
      ],
    };
  }
  if (p.startsWith('/api/v1/initiative/web-push')) {
    if (method === 'GET') return { public_key: null };
    if (method === 'PUT') return { success: true, browserId: 'mock', device_uuid: 'd-web' };
    if (method === 'DELETE') return { success: true };
  }
  if (method === 'POST' && /^\/api\/v1\/initiative\/resume\/[^/]+$/.test(p)) {
    const id = p.split('/')[5];
    delete triggerScores[id];
    return { success: true, trigger_id: id, score: { score: 0.5, samples: 0, suppressed: false, last_reason: null } };
  }
  if (p === '/api/v1/initiative/pending') {
    // Marking on read, exactly as the server does: two tabs are one interruption.
    const out = nudges.filter((n) => n.status === 'pending');
    out.forEach((n) => { n.status = 'delivered'; });
    return out;
  }
  if (p === '/api/v1/initiative/pref' && method === 'PUT') {
    if (body?.enabled === true && !actionsConsented()) {
      fail(403, 'That needs to be turned on in your consent settings first', 'consent_required');
    }
    Object.assign(initiativePref, body || {});
    // Push cannot outlive initiative, same as the server.
    if (!initiativePref.enabled) initiativePref.push_enabled = false;
    localStorage.setItem('mock_initiative', initiativePref.enabled ? 'true' : 'false');
    localStorage.setItem('mock_push', initiativePref.push_enabled ? 'true' : 'false');
    return { success: true, pref: initiativePref };
  }
  if (method === 'POST' && /^\/api\/v1\/initiative\/mute\/[^/]+$/.test(p)) {
    const id = p.split('/')[5];
    if (!mutedTriggers.includes(id)) mutedTriggers.push(id);
    return { success: true, muted: mutedTriggers };
  }
  if (method === 'DELETE' && /^\/api\/v1\/initiative\/mute\/[^/]+$/.test(p)) {
    const id = p.split('/')[5];
    mutedTriggers = mutedTriggers.filter((t) => t !== id);
    return { success: true, muted: mutedTriggers };
  }
  if (method === 'POST' && /^\/api\/v1\/initiative\/[^/]+\/react$/.test(p)) {
    const uuid = p.split('/')[4];
    const n = nudges.find((x) => x.uuid === uuid);
    if (!n || !['pending', 'delivered'].includes(n.status)) fail(409, 'No such nudge', 'not_open');
    n!.status = body?.reaction === 'engaged' ? 'engaged' : 'dismissed';
    return { success: true, uuid, status: n!.status };
  }

  // A tick on the Family page (core_api perform(): the click is the approval).
  if (method === 'POST' && /^\/api\/v1\/actions\/direct\/(complete_chore|undo_complete_chore)$/.test(p)) {
    const actionId = p.split('/')[5];
    const id = (body as { params?: { chore_id?: string } } | undefined)?.params?.chore_id || '';
    await wait(500);
    if (id === 'c-refused') fail(409, 'The chore is not in a state that allows this.', 'invalid_status_transition');
    mockChoreDone[id] = actionId === 'complete_chore';
    return { success: true, action: { uuid: `direct-${Date.now()}`, action_id: actionId, status: 'done', approval: 'human' } };
  }
  if (p === '/api/v1/actions' && method === 'GET') {
    return { catalog: ACTION_CATALOG, available: availableActions(), authorities, pending: proposals.filter((a) => a.status === 'pending') };
  }
  if (p === '/api/v1/actions/pending') return proposals.filter((a) => a.status === 'pending');
  if (p.startsWith('/api/v1/actions/history')) return [...proposals].reverse();
  if (method === 'POST' && /^\/api\/v1\/actions\/[^/]+\/confirm$/.test(p)) {
    const uuid = p.split('/')[4];
    const action = proposals.find((a) => a.uuid === uuid);
    if (!action || action.status !== 'pending') fail(409, 'That request is already decided', 'not_pending');
    await wait(700);
    Object.assign(action!, { status: 'done', approval: 'human', result_ref: 'mock-evt-1', executed_at: new Date().toISOString() });
    if (action!.action_id === 'record_vehicle_bill') mockApplyBill(action!.params as Record<string, unknown>);
    // The real execute() also marks the triaged email(s) 'actioned'; mirrored
    // here so a filed email leaves the Mail list the same way.
    if (action!.action_id === 'file_receipt_email' || action!.action_id === 'add_email_events') {
      const ids = ((action!.params?.items as { email_triage_uuid: string }[]) || []).map((i) => i.email_triage_uuid);
      mockEmails = mockEmails.map((e) => (ids.includes(e.uuid) ? { ...e, status: 'actioned' } : e));
    } else if (action!.action_id === 'file_travel_or_school_email') {
      const id = action!.params?.email_triage_uuid as string | undefined;
      mockEmails = mockEmails.map((e) => (e.uuid === id ? { ...e, status: 'actioned' } : e));
    } else if (action!.action_id === 'delete_email') {
      const ids = (action!.params?.email_triage_uuids as string[]) || [];
      mockEmails = mockEmails.map((e) => (ids.includes(e.uuid) ? { ...e, status: 'trashed' } : e));
    } else if (action!.action_id === 'unsubscribe_senders') {
      const keys = ((action!.params?.items as { email_triage_uuid: string }[]) || []).map((i) => mockEmails.find((e) => e.uuid === i.email_triage_uuid)?.group_key);
      mockEmails = mockEmails.map((e) => (keys.includes(e.group_key) && (e.category === 'promo' || e.category === 'notification') ? { ...e, status: 'archived' } : e));
    } else if (action!.action_id === 'draft_reply') {
      const id = action!.params?.email_triage_uuid as string | undefined;
      mockEmails = mockEmails.map((e) => (e.uuid === id ? { ...e, status: 'actioned' } : e));
    } else if (action!.action_id === 'archive_emails') {
      const ids = (action!.params?.email_triage_uuids as string[]) || [];
      mockEmails = mockEmails.map((e) => (ids.includes(e.uuid) ? { ...e, status: 'archived' } : e));
    } else if (action!.action_id === 'unarchive_emails') {
      const ids = (action!.params?.email_triage_uuids as string[]) || [];
      mockEmails = mockEmails.map((e) => (ids.includes(e.uuid) && e.status === 'archived' ? { ...e, status: 'new' } : e));
    }
    return { success: true, action };
  }
  if (method === 'POST' && /^\/api\/v1\/actions\/[^/]+\/decline$/.test(p)) {
    const uuid = p.split('/')[4];
    const action = proposals.find((a) => a.uuid === uuid);
    if (!action || action.status !== 'pending') fail(409, 'That request is already decided', 'not_pending');
    Object.assign(action!, { status: 'declined' });
    return { success: true, action };
  }
  if (method === 'POST' && /^\/api\/v1\/actions\/authority\/[^/]+$/.test(p)) {
    const actionId = p.split('/')[5];
    const entry = ACTION_CATALOG.find((a) => a.id === actionId);
    if (!entry) fail(404, 'No such action', 'unknown_action');
    if (entry!.consent_type === 'action_authority' && !actionsConsented()) {
      fail(403, 'That needs to be turned on in your consent settings first', 'consent_required');
    }
    if (!authorities.some((a) => a.action_id === actionId)) {
      authorities.push({ action_id: actionId, label: entry!.label, expires_at: null, created_at: new Date().toISOString() });
    }
    return { success: true, authorities };
  }
  if (method === 'DELETE' && /^\/api\/v1\/actions\/authority\/[^/]+$/.test(p)) {
    const actionId = p.split('/')[5];
    const at = authorities.findIndex((a) => a.action_id === actionId);
    if (at >= 0) authorities.splice(at, 1);
    return { success: true, authorities };
  }

  if (p === '/api/v1/integrations' && method === 'GET') return { providers: integrations };
  if (p === '/api/v1/consent/status') {
    return {
      consents: {
        ...(healthConsented()
          ? { health_data: { accepted: true, document_version: '1.0', accepted_at: iso(DAY) } }
          : {}),
        ...(actionsConsented()
          ? { action_authority: { accepted: true, document_version: '1.0', accepted_at: iso(DAY) } }
          : {}),
      },
      all_required_accepted: true,
    };
  }
  if (p === '/api/v1/consent' && method === 'POST') {
    // Honour the type actually asked for: the action layer and the health
    // providers are separate consents, and conflating them here would make
    // the Actions panel look broken for reasons that are only the mock's.
    const key = body?.consent_type === 'action_authority' ? 'mock_consent_actions' : 'mock_consent_health';
    localStorage.setItem(key, 'true');
    const accepted = { accepted: true, document_version: '1.0', accepted_at: new Date().toISOString() };
    return {
      consents: {
        ...(healthConsented() ? { health_data: accepted } : {}),
        ...(actionsConsented() ? { action_authority: accepted } : {}),
      },
      all_required_accepted: true,
    };
  }
  // Property -> Security: a ready bridge with the household's devices and kept media.
  if (method === 'GET' && p === '/api/v1/projects/property/security') {
    const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
    const cam = (serial: string, name: string, model: string, battery: number | null, seen: number, clip = true) => ({ serial, name, model, bound: true, stationSerial: 'T8010P', lastSeenAt: ago(seen), capabilities: ['camera', 'battery', 'motion'], batteryPercent: battery, charging: false, freshSnapshotAvailable: true, storedThumbnailAvailable: false, clipAvailable: clip });
    return { status: 'ready', updatedAt: ago(1), devices: [
      { serial: 'T8010P', name: 'HomeBase 2', model: 'T8010', bound: true, stationSerial: null, lastSeenAt: ago(2), capabilities: ['station'], batteryPercent: null, charging: null, freshSnapshotAvailable: false, storedThumbnailAvailable: false },
      { ...cam('T8213D', 'Doorbell', 'T8213', 100, 60 * 30), capabilities: ['camera', 'doorbell', 'battery'] },
      cam('T8171S', 'Side Yard', 'T8171', 100, 120), cam('T8171B', 'Backyard', 'T8171', 98, 120),
    ], events: [
      { id: 'e1', kind: 'motion', deviceSn: 'T8171B', at: ago(7) }, { id: 'e2', kind: 'motion', deviceSn: 'T8171B', at: ago(10) },
      { id: 'e3', kind: 'doorbell', deviceSn: 'T8213D', at: ago(95) }, { id: 'e4', kind: 'person', deviceSn: 'T8171S', at: ago(240) },
      { id: 'e5', kind: 'motion', deviceSn: 'T8171B', at: ago(410) },
    ] };
  }
  if (method === 'GET' && p === '/api/v1/projects/property/security/media') {
    const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
    const item = (n: number, serial: string, deviceName: string, type: 'image' | 'clip', m: number, important = type === 'clip') => ({ id: `00000000-0000-4000-8000-00000000000${n}`, deviceSerial: serial, deviceName, type, contentType: type === 'clip' ? 'video/mp4' : 'image/jpeg', bytes: 1000, durationSeconds: type === 'clip' ? 15 : null, important, capturedBy: 1, capturedAt: ago(m) });
    return { media: [item(1, 'T8171B', 'Backyard', 'image', 20), item(2, 'T8171B', 'Backyard', 'clip', 85), item(3, 'T8213D', 'Doorbell', 'image', 96, true), item(4, 'T8171S', 'Side Yard', 'image', 300), item(5, 'T8171S', 'Side Yard', 'clip', 900)] };
  }
  if (method === 'POST' && /^\/api\/v1\/projects\/property\/security\/devices\/[^/]+\/clip$/.test(p)) {
    await new Promise(r => setTimeout(r, 1500));
    const serial = p.split('/')[7];
    return { media: { id: crypto.randomUUID(), deviceSerial: serial, deviceName: serial, type: 'clip', contentType: 'video/mp4', bytes: 1000, durationSeconds: 15, important: true, capturedBy: 1, capturedAt: new Date().toISOString() } };
  }
  if (method === 'PATCH' && /^\/api\/v1\/projects\/property\/security\/media\/[^/]+$/.test(p)) {
    return { media: { id: p.split('/').pop(), deviceSerial: 'T8171B', deviceName: 'Backyard', type: 'image', contentType: 'image/jpeg', bytes: 1000, durationSeconds: null, important: !!body?.important, capturedBy: 1, capturedAt: new Date().toISOString() } };
  }
  if (method === 'DELETE' && /^\/api\/v1\/projects\/property\/security\/media\/[^/]+$/.test(p)) return undefined;
  // Guardian: an open garage incident from tonight's sweep and wind on the way.
  if (p.startsWith('/api/v1/projects/property/security/guardian')) {
    const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
    const policy = [
      { id: 'camera.fresh_snapshot', label: 'Request a fresh camera image', level: 1, allowed: true, reasons: [] },
      { id: 'notify.household', label: 'Send a safety notification to approved household adults', level: 2, allowed: true, reasons: [] },
      { id: 'device.garage_close', label: 'Close a garage door', level: 3, allowed: false, reasons: ["physical security actions need a person's approval"] },
      { id: 'security.change_permissions', label: 'Change security permissions', level: 4, allowed: false, reasons: ['security permissions are changed only by the owner'] },
    ];
    const common = { recipients: [], escalateAfterMinutes: 30, retries: 2, retryDelaySeconds: 20, minConfidence: 0.75, maxEvidenceAgeSeconds: 120, autonomy: {}, simulation: false };
    const g = (window as any).__mockGuardian ||= {
      protocols: [
        { id: 'nightly_sweep', label: 'Nightly Guardian Sweep', describe: 'At lights-out, check that the garage doors are closed — and the patio umbrella is down when the weather calls for it.', version: 1, enabled: true, updatedBy: 1, updatedAt: ago(600), policy,
          config: { ...common, quiet: { from: 0, to: 0 }, schedule: { time: '21:00', timeZone: 'America/New_York' }, reports: { evening: true, morning: true, morningTime: '06:00' }, overdueAfterMinutes: 15, garageDoors: [{ key: 'main', name: 'Garage door', serial: 'T8171S', region: 'the double door on the left' }], includeUmbrella: true } },
        { id: 'storm_umbrella', label: 'Storm umbrella watch', describe: 'When storms or strong gusts are on the way, check the backyard camera and say if the patio umbrella is still up — at any hour, not just at lights-out.', version: 1, enabled: true, updatedBy: 1, updatedAt: ago(600), policy,
          config: { ...common, escalateAfterMinutes: 0, quiet: { from: 22, to: 7 }, umbrella: { key: 'patio', name: 'Patio umbrella', serial: 'T8171B', region: 'by the table' }, placeUuid: null, weather: { gustMph: 20, stormChance: 30, lookaheadHours: 6, urgentWithinHours: 6 } } },
      ],
      incidents: [
        { id: '7f0c2c1e-0000-4000-8000-000000000001', protocol: 'nightly_sweep', check: 'garage_door', subject: 'main', subjectName: 'Garage door', camera: 'Side Yard', state: 'notified', condition: 'open', severity: 'urgent', confidence: 0.93, reason: null, weather: null, trigger: 'schedule',
          firstDetectedAt: ago(12), lastVerifiedAt: ago(2), acknowledgedBy: null, acknowledgedAt: null, assignedTo: null, resolvedAt: null, resolution: null, dismissReason: null, rechecks: 1, nextRecheckAt: new Date(Date.now() + 13 * 60_000).toISOString(), escalatedAt: null, evidenceMediaId: '00000000-0000-4000-8000-000000000004', observedAt: ago(2),
          notifications: [{ profileId: 1, kind: 'alert', status: 'sent', attempts: 1, holdUntil: null, lastAttemptAt: ago(12), skipped: null }, { profileId: 2, kind: 'alert', status: 'in_app', attempts: 1, holdUntil: null, lastAttemptAt: ago(12), skipped: 'not enabled' }] },
        { id: '7f0c2c1e-0000-4000-8000-000000000002', protocol: 'storm_umbrella', check: 'patio_umbrella', subject: 'patio', subjectName: 'Patio umbrella', camera: 'Backyard', state: 'resolved', condition: 'up', severity: 'urgent', confidence: 0.9, reason: null, weather: { reasons: [{ text: 'gusts up to 32 mph around 7 PM' }], earliestAt: ago(-60) }, trigger: 'weather',
          firstDetectedAt: ago(300), lastVerifiedAt: ago(270), acknowledgedBy: 1, acknowledgedAt: ago(290), assignedTo: null, resolvedAt: ago(270), resolution: 'verified_safe', dismissReason: null, rechecks: 1, nextRecheckAt: null, escalatedAt: null, evidenceMediaId: null, observedAt: ago(270), notifications: [] },
      ],
      runs: [
        { id: 'r3', protocol: 'nightly_sweep', trigger: 'recheck', state: 'attention_required', scheduledFor: ago(2), startedAt: ago(2), finishedAt: ago(2), attempts: 1, simulated: false, results: [{ check: 'garage_door', subject: 'main', status: 'open', reason: null }], missed: false, reason: null, risk: null },
        { id: 'r2', protocol: 'nightly_sweep', trigger: 'schedule', state: 'notified', scheduledFor: ago(12), startedAt: ago(12), finishedAt: ago(12), attempts: 1, simulated: false, results: [{ check: 'garage_door', subject: 'main', status: 'open', reason: null }, { check: 'patio_umbrella', subject: 'patio', status: 'down', reason: null }], missed: false, reason: null, risk: { atRisk: true, known: true },
          report: { kind: 'evening', text: 'ALERT: Your garage door is still open. There\'s gusts up to 32 mph around 11 PM tonight.', deliveries: [{ profileId: 1, status: 'sent' }, { profileId: 2, status: 'in_app' }] } },
        { id: 'r0', protocol: 'nightly_sweep', trigger: 'report', state: 'safe', scheduledFor: ago(900), startedAt: ago(900), finishedAt: ago(900), attempts: 1, simulated: false, results: [], missed: false, reason: null, risk: null,
          report: { kind: 'morning', text: 'Good morning, I hope you slept well through the night. All quiet — nothing happened overnight.', deliveries: [{ profileId: 1, status: 'sent' }, { profileId: 2, status: 'sent' }] } },
        { id: 'r1', protocol: 'storm_umbrella', trigger: 'weather', state: 'notified', scheduledFor: ago(300), startedAt: ago(300), finishedAt: ago(300), attempts: 1, simulated: false, results: [{ check: 'patio_umbrella', subject: 'patio', status: 'up', reason: null }], missed: false, reason: null, risk: { atRisk: true, known: true } },
      ],
    };
    const view = () => {
      const active = g.incidents.filter((i: any) => ['open', 'notified', 'acknowledged'].includes(i.state));
      return { status: active.some((i: any) => i.condition !== 'unknown') ? 'attention' : active.length ? 'unverified' : 'secure', bridge: 'ready', protocols: g.protocols,
        lastSweep: g.runs.find((r: any) => r.protocol === 'nightly_sweep' && r.trigger === 'schedule') || null, nextSweepAt: new Date(Date.now() + 23 * 3_600_000).toISOString(), nextMorningReportAt: new Date(Date.now() + 9 * 3_600_000).toISOString(),
        incidents: g.incidents, runs: g.runs, events: [],
        weather: { atRisk: true, known: true, urgent: true, reasons: [{ kind: 'wind', text: 'gusts up to 32 mph around 11 PM' }], earliestAt: new Date(Date.now() + 60 * 60_000).toISOString(), checkedAt: ago(1), sources: { forecast: 'ok', alerts: 'ok' } },
        cameras: [{ serial: 'T8171S', name: 'Side Yard', watched: true, lastSeenAt: ago(120), batteryPercent: 100, freshSnapshotAvailable: true }, { serial: 'T8171B', name: 'Backyard', watched: true, lastSeenAt: ago(120), batteryPercent: 98, freshSnapshotAvailable: true }],
        recipients: [{ id: 1, name: 'Jacob' }, { id: 2, name: 'Alex' }],
        health: { runs: 9, safe: 6, attention: 2, unknown: 1, failed: 0, missed: 0, notificationsFailed: 0 } };
    };
    const incident = g.incidents.find((i: any) => p.includes(i.id));
    if (method === 'GET') return view();
    if (method === 'PUT' && /\/protocols\//.test(p)) { const pr = g.protocols.find((x: any) => p.includes(x.id)); Object.assign(pr, { enabled: body?.enabled ?? pr.enabled, config: body?.config || pr.config }); return view(); }
    if (method === 'POST' && /\/run$/.test(p)) { await new Promise(r => setTimeout(r, 1200)); g.runs.unshift({ id: crypto.randomUUID(), protocol: 'nightly_sweep', trigger: 'manual', state: 'safe', scheduledFor: ago(0), startedAt: ago(0), finishedAt: ago(0), attempts: 1, simulated: !!body?.scenario, results: [{ check: 'garage_door', subject: 'main', status: body?.scenario?.garage_door?.main || 'closed', reason: null }], missed: false, reason: null, risk: null }); return { run: 'x', claimed: true, state: 'safe' }; }
    if (incident && /\/acknowledge$/.test(p)) { Object.assign(incident, { state: 'acknowledged', acknowledgedBy: 1, acknowledgedAt: ago(0) }); return undefined; }
    if (incident && /\/dismiss$/.test(p)) { Object.assign(incident, { state: 'dismissed', dismissReason: body?.reason, resolvedAt: ago(0) }); return undefined; }
    if (incident && /\/assignee$/.test(p)) { incident.assignedTo = body?.profileId ? Number(body.profileId) : null; return undefined; }
    if (incident && /\/recheck$/.test(p)) { await new Promise(r => setTimeout(r, 1000)); incident.lastVerifiedAt = ago(0); return {}; }
    return undefined;
  }
  // Sightings: an in-memory gallery, zones, rules and log.
  if (p.startsWith('/api/v1/projects/property/security/') && /\/(sightings|subjects|zones|rules)/.test(p)) {
    const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
    const st = (window as any).__mockSightings ||= {
      subjects: [
        { id: 'sub-wynter', name: 'Wynter', kind: 'animal', description: 'Black lab, white chest', photos: ['00000000-0000-4000-8000-000000000001'], lastSeen: { at: ago(28), camera: 'Backyard', where: 'by the back fence' } },
        { id: 'sub-dexter', name: 'Dexter', kind: 'animal', description: 'Brown terrier mix', photos: [], lastSeen: null },
        { id: 'sub-van', name: 'Red Van', kind: 'vehicle', description: 'Red minivan', photos: [], lastSeen: { at: ago(300), camera: 'Side Yard', where: 'on the driveway' } },
      ],
      zones: [{ deviceSerial: 'T8171B', name: 'inside the fence', description: null }, { deviceSerial: 'T8171B', name: 'outside the back fence', description: null }],
      rules: [{ id: 'rule-1', subjectId: 'sub-wynter', subjectName: 'Wynter', label: null, deviceSerial: 'T8171B', zone: 'outside the back fence', enabled: true }],
      sightings: [
        { id: 'si-5', label: 'unknown dog', kind: 'animal', subjectId: null, camera: 'Backyard', deviceSerial: 'T8171B', zone: 'outside the back fence', where: 'by the gate', confidence: 0.8, eventKind: 'motion', seenAt: ago(7), hasFrame: true },
        { id: 'si-6', label: 'unknown dog', kind: 'animal', subjectId: null, camera: 'Backyard', deviceSerial: 'T8171B', zone: 'outside the back fence', where: 'along the back fence', confidence: 0.74, eventKind: 'motion', seenAt: ago(10), hasFrame: true },
        { id: 'si-1', label: 'Wynter', kind: 'animal', subjectId: 'sub-wynter', camera: 'Backyard', deviceSerial: 'T8171B', zone: 'inside the fence', where: 'by the back fence', confidence: 0.91, eventKind: 'motion', seenAt: ago(28), hasFrame: true },
        { id: 'si-pkg', label: 'package', kind: 'package', subjectId: null, camera: 'Doorbell', deviceSerial: 'T8213D', zone: null, where: 'brown box on the doormat', confidence: 0.88, eventKind: 'motion', seenAt: ago(90), hasFrame: true },
        { id: 'si-2', label: 'stranger', kind: 'person', subjectId: null, camera: 'Doorbell', deviceSerial: 'T8213D', zone: null, where: 'at the front door', confidence: 0.84, eventKind: 'doorbell', seenAt: ago(95), hasFrame: true },
        { id: 'si-3', label: 'deer', kind: 'animal', subjectId: null, camera: 'Backyard', deviceSerial: 'T8171B', zone: 'outside the back fence', where: 'past the tree line', confidence: 0.55, eventKind: 'motion', seenAt: ago(240), hasFrame: true },
        { id: 'si-4', label: 'Red Van', kind: 'vehicle', subjectId: 'sub-van', camera: 'Side Yard', deviceSerial: 'T8171S', zone: null, where: 'on the driveway', confidence: 0.88, eventKind: 'motion', seenAt: ago(300), hasFrame: true },
      ],
    };
    if (method === 'GET' && p.endsWith('/sightings')) {
      const filter = url.searchParams.get('filter') || 'all';
      const rows = st.sightings.filter((s: any) => filter === 'all' || (filter === 'stranger' || filter === 'package' ? s.label === filter : s.subjectId === filter));
      const pages = Math.max(1, Math.ceil(rows.length / 10));
      const page = Math.min(Math.max(1, Number(url.searchParams.get('page')) || 1), pages);
      return { ...st, people: [], sightings: rows.slice((page - 1) * 10, page * 10), page, pages, total: rows.length, retentionDays: 30 };
    }
    // "This is…": a full subject keeps its photos; only ticked rows are renamed.
    if (method === 'POST' && p.endsWith('/teach')) {
      const row = st.sightings.find((x: any) => x.id === p.split('/')[7]);
      if (!row) fail(404, 'That sighting is gone.');
      if (row.subjectId) fail(409, 'That sighting already has a name.');
      let sub = body.subjectId ? st.subjects.find((x: any) => x.id === body.subjectId) : null;
      if (body.subjectId && !sub) fail(404, "That name isn't in the gallery.");
      const created = !sub;
      if (!sub) {
        const name = String(body.newSubject?.name || '').trim();
        if (!name) fail(400, 'Give them a name.');
        if (/^(stranger|unknown)/i.test(name)) fail(400, "That name is reserved for people Athena doesn't know.");
        if (st.subjects.some((x: any) => x.name.toLowerCase() === name.toLowerCase())) fail(409, 'That name is already in the gallery.');
        sub = { id: `sub-${Date.now()}`, name, kind: body.newSubject?.kind || row.kind, description: body.newSubject?.description || null, photos: [], lastSeen: null };
        st.subjects.push(sub);
      }
      const full = sub.photos.length >= 3;
      if (!full && row.hasFrame) sub.photos.push(crypto.randomUUID());
      const rows = [row, ...st.sightings.filter((x: any) => (body.alsoIds || []).includes(x.id) && !x.subjectId && x.kind === row.kind)];
      for (const r of rows) { r.subjectId = sub.id; r.label = sub.name; r.kind = sub.kind; }
      sub.lastSeen = { at: row.seenAt, camera: row.camera, where: row.where };
      return { subjectId: sub.id, name: sub.name, created, photoAdded: !full && row.hasFrame, photoNote: full ? `${sub.name} already has 3 reference photos — remove one in the Gallery to use this frame.` : null, renamed: rows.length };
    }
    if (method === 'POST' && p.endsWith('/entities')) {
      const row = st.sightings.find((x: any) => x.id === p.split('/')[7]);
      const sub = st.subjects.find((x: any) => x.id === body.subjectId);
      if (!row || !sub) fail(404, 'That frame or name is gone.');
      const id = `si-${Date.now()}`;
      st.sightings.unshift({ ...row, id, subjectId: sub.id, label: sub.name, kind: sub.kind, where: null, confidence: null });
      return { id, name: sub.name };
    }
    if (method === 'POST' && p.endsWith('/subjects')) { const id = `sub-${Date.now()}`; st.subjects.push({ id, name: body.name, kind: body.kind, description: body.description || null, photos: [], lastSeen: null }); return { id }; }
    const subj = /\/subjects\/([^/]+)/.exec(p)?.[1];
    if (subj && method === 'PUT' && p.endsWith('/person')) { const s = st.subjects.find((x: any) => x.id === subj); if (s) s.personFactUuid = body.factUuid; return undefined; }
    if (subj && method === 'DELETE' && !p.includes('/photos/')) { st.subjects = st.subjects.filter((x: any) => x.id !== subj); st.rules = st.rules.filter((r: any) => r.subjectId !== subj); return undefined; }
    if (subj && method === 'POST' && p.endsWith('/photos')) { st.subjects.find((x: any) => x.id === subj)?.photos.push(body.mediaId); return undefined; }
    if (subj && method === 'DELETE' && p.includes('/photos/')) { const m = p.split('/').pop(); const x = st.subjects.find((y: any) => y.id === subj); if (x) x.photos = x.photos.filter((y: string) => y !== m); return undefined; }
    if (method === 'PUT' && p.includes('/zones/')) { const serial = p.split('/').pop(); st.zones = [...st.zones.filter((z: any) => z.deviceSerial !== serial), ...body.zones.map((z: any) => ({ deviceSerial: serial, name: z.name, description: null }))]; return undefined; }
    if (method === 'POST' && p.endsWith('/rules')) { const sub = st.subjects.find((x: any) => x.id === body.subjectId); const id = `rule-${Date.now()}`; st.rules.push({ id, subjectId: body.subjectId || null, subjectName: sub?.name || null, label: body.label || null, deviceSerial: body.deviceSerial || null, zone: body.zone || null, enabled: true }); return { id }; }
    if (method === 'PATCH' && p.includes('/rules/')) { const rule = st.rules.find((r: any) => r.id === p.split('/').pop()); if (!rule) fail(404, "That alert isn't yours or is gone."); rule.enabled = body.enabled; return undefined; }
    if (method === 'DELETE' && p.includes('/rules/')) { const id = p.split('/').pop(); st.rules = st.rules.filter((r: any) => r.id !== id); return undefined; }
  }

  if (method === 'POST' && /^\/api\/v1\/integrations\/[^/]+\/connect$/.test(p)) {
    const provider = p.split('/')[4];
    const entry = integrations.find((i) => i.provider === provider);
    // Mirror the server's 412 so the consent gate is reachable in mock mode.
    if (entry?.requires_consent && !healthConsented()) {
      fail(412, `Connecting ${entry.label} requires the health_data consent first`, 'consent_required');
    }
    // Bounce straight back to the app rather than leaving for a real provider.
    return { provider, authorize_url: `${location.origin}/?integration=${provider}&status=connected`, expires_in: 600 };
  }
  if (method === 'DELETE' && /^\/api\/v1\/integrations\/[^/]+$/.test(p)) {
    const provider = p.split('/')[4];
    const entry = integrations.find((i) => i.provider === provider);
    if (entry) { entry.connected = false; entry.link = null; }
    return { provider, revoked: true, revoked_upstream: true };
  }

  fail(404, `mock: no route for ${method} ${p}`);
}

export interface ApiError extends Error {
  status: number;
  body?: unknown;
  code?: string;
}

export const SESSION_EXPIRED_EVENT = 'athena-session-expired';

/** Mirrors the real client: one 401 -> re-pin the session -> replay once. */
async function request<T>(method: string, path: string, data?: unknown): Promise<T> {
  try {
    return (await route(method, path, data)) as T;
  } catch (err) {
    const e = err as ApiError;
    if (e?.status !== 401 || path.startsWith('/auth/')) throw e;
    try {
      await route('POST', '/auth/companion/refresh');
    } catch {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      throw e;
    }
    return (await route(method, path, data)) as T;
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  // The real client dedupes and caches these for a few seconds. Nothing here
  // is worth caching, but the dashboard calls it by name and a mock that is
  // missing a method answers every card with "is not a function".
  cachedGet: <T>(path: string) => request<T>('GET', path),
  text: (path: string) => request<string>('GET', path),
  // A painted-looking placeholder for the dream picture.
  blob: async (_path: string) => new Blob([`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1536 1024"><defs><radialGradient id="g" cx="70%" cy="25%" r="80%"><stop offset="0" stop-color="#f3c98b"/><stop offset=".25" stop-color="#6b4fc2"/><stop offset=".7" stop-color="#1a1147"/><stop offset="1" stop-color="#07061a"/></radialGradient></defs><rect width="1536" height="1024" fill="url(#g)"/><g fill="#d9ccff" opacity=".7"><circle cx="200" cy="140" r="3"/><circle cx="420" cy="90" r="2"/><circle cx="1300" cy="200" r="3"/><circle cx="900" cy="60" r="2"/></g><g fill="#2a1f66" stroke="#b9a6ff" stroke-opacity=".5"><rect x="250" y="520" width="220" height="380" rx="8"/><rect x="520" y="460" width="260" height="440" rx="8"/><rect x="830" y="560" width="200" height="340" rx="8"/></g><path d="M0 900 Q 768 800 1536 900 L1536 1024 L0 1024Z" fill="#120c33"/></svg>`], { type: 'image/svg+xml' }),
  post: <T>(path: string, data?: unknown) => request<T>('POST', path, data),
  put: <T>(path: string, data?: unknown) => request<T>('PUT', path, data),
  patch: <T>(path: string, data?: unknown) => request<T>('PATCH', path, data),
  del: <T>(path: string) => request<T>('DELETE', path),
};

// In mock mode the Google button can't run, so expose a one-click sign-in.
(window as any).__mockSignIn = () => route('POST', '/auth/companion/google');
// Fault injection helpers (see ipDrift above).
(window as any).__mockIpDrift = (on = true) => {
  ipDrift = on;
  if (on) localStorage.setItem('mock_ip_drift', 'true');
  else localStorage.removeItem('mock_ip_drift');
  return `ip drift ${on ? 'on' : 'off'}`;
};
(window as any).__mockLinkDown = (on = true) => {
  if (on) localStorage.setItem('mock_link_down', 'true');
  else localStorage.removeItem('mock_link_down');
  return `link ${on ? 'down' : 'up'}`;
};
