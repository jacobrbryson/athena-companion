/**
 * DEV-ONLY mock of src/api/client.ts for `npm run dev:mock`.
 *
 * Lets the Companion UI run with no proxy_service, core_api, database or
 * Google sign-in: vite.mock.config.ts swaps this in for the real client.
 * Everything here is canned; nothing is persisted. Never imported by the
 * production build.
 */

import type { NewsSource } from '../src/api/dashboard';

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
    provider: 'google_calendar',
    label: 'Google Calendar',
    scopes: ['calendar.readonly'],
    requires_consent: null,
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
    provider: 'strava',
    label: 'Strava',
    scopes: ['read', 'activity:read'],
    requires_consent: 'health_data',
    connected: false,
    link: null,
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
const ready = <T,>(data: T) => ({ status: 'ready' as const, data, checkedAt: new Date().toISOString() });
const unready = (status: 'not_connected' | 'needs_reauth' | 'consent_required' | 'error') =>
  ({ status, data: null, checkedAt: new Date().toISOString() });
const inMinutes = (m: number) => new Date(now + m * 60_000).toISOString();
const dayStamp = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString().slice(0, 10);

/** Watched places for the emergency watch, kept in localStorage like the rest of the mock. */
function mockWatchPlaces(): { uuid: string; name: string; address: string | null; latitude: number; longitude: number; radiusMiles: number; enabled: boolean }[] {
  try {
    const saved = localStorage.getItem('mock_watch_places');
    if (saved) return JSON.parse(saved);
  } catch { /* fall through */ }
  return [{ uuid: 'wp-home', name: 'Home', address: '148 RUSHING WATER LN, TROUTMAN, NC, 28166', latitude: 35.6741, longitude: -80.9073, radiusMiles: 3, enabled: true }];
}

function dashboardSummary() {
  return {
    calendar: ready({
      timeZone: 'America/New_York',
      days: 7,
      events: [
        { id: 'c1', title: 'Design review', start: inMinutes(35), end: inMinutes(95), allDay: false, location: 'Zoom', calendar: null, shared: false },
        { id: 'c2', title: 'School pickup', start: inMinutes(180), end: inMinutes(210), allDay: false, location: null, calendar: null, shared: true },
        { id: 'c3', title: 'Dentist', start: inMinutes(60 * 26), end: inMinutes(60 * 27), allDay: false, location: 'Davidson', calendar: null, shared: false },
        { id: 'c4', title: 'Emma visiting', start: dayStamp(-4), end: dayStamp(-6), allDay: true, location: null, calendar: null, shared: false },
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
    activity: ready({ days: 7, activities: [
      { name: 'Morning run', type: 'Run', start: iso(DAY), distance_mi: 4.2, moving_time_s: 2280 },
      { name: 'Lake loop ride', type: 'Ride', start: iso(DAY * 3), distance_mi: 18.6, moving_time_s: 4100 },
    ] }),
    familyChores: ready({ name: 'Rivera family', chores: [
      { title: 'Dishes', completed: true, status: 'done', dueDate: dayStamp(0) },
      { title: 'Walk Biscuit', completed: false, status: 'open', dueDate: dayStamp(0) },
      { title: 'Homework check', completed: false, status: 'open', dueDate: dayStamp(0) },
    ] }),
    jira: ready({ partial: false, issues: [
      { key: 'ATH-412', title: 'Dashboard priority ordering', status: 'In Progress', project: 'Athena', updated: iso(3600_000), due: null, site: 'athena', url: 'https://example.atlassian.net/browse/ATH-412' },
      { key: 'ATH-408', title: 'Companion menu merge', status: 'To Do', project: 'Athena', updated: iso(DAY), due: null, site: 'athena', url: 'https://example.atlassian.net/browse/ATH-408' },
      { key: 'OPS-77', title: 'Rotate connector keys', status: 'To Do', project: 'Ops', updated: iso(DAY * 2), due: null, site: 'athena', url: 'https://example.atlassian.net/browse/OPS-77' },
    ] }),
    slack: unready('not_connected'),
    emailTriage: ready(mailSummary()),
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
let mockProjects = [
  { uuid: 'proj-shelves', title: 'Rehang the garage shelves', detail: 'Brackets are already in the truck', area: 'Garage', status: 'todo' as const, priority: 'normal' as const, effortMinutes: 120, indoor: true, costEstimate: null, dueDate: null, blockedOn: null, source: 'import' },
  { uuid: 'proj-deck', title: 'Stain the deck', detail: null, area: 'Backyard', status: 'in_progress' as const, priority: 'high' as const, effortMinutes: 360, indoor: false, costEstimate: 140, dueDate: null, blockedOn: null, source: 'import' },
];

// ------------------------------------------------------------------ mail ---
// A small backlog exercising every path: two Kroger receipts sharing a
// group_key (the "review as a group?" prompt), a utility bill, a flight with
// a real date, and one 'other' email with nothing to propose.
type MockEmail = {
  uuid: string; gmail_message_id: string; thread_id: string | null;
  subject: string | null; from_address: string | null; from_name: string | null;
  received_at: string | null; category: 'receipt' | 'travel' | 'school' | 'other';
  group_key: string | null; extracted: Record<string, unknown> | null;
  status: 'new' | 'actioned' | 'dismissed' | 'trashed'; created_at: string;
  /** Stands in for the live Gmail read the real detail() controller does — plain text only. */
  body: string;
};
let mockEmails: MockEmail[] = [
  { uuid: 'email-1', gmail_message_id: 'g-101', thread_id: 't-101', subject: 'Your Kroger order #48213', from_address: 'noreply@kroger.com', from_name: 'Kroger', received_at: iso(DAY), category: 'receipt', group_key: 'kroger', extracted: { merchant: 'Kroger', category: 'groceries', amount: 84.32, currency: 'USD', purchased_at: dayStamp(1) }, status: 'new', created_at: iso(DAY), body: 'Thanks for shopping at Kroger!\n\nOrder #48213\nDelivered to: 412 Maple St\n\n1x Organic bananas        $3.49\n1x 2% milk, gallon         $4.29\n1x Rotisserie chicken      $7.99\n1x Sourdough loaf          $4.50\n6x Assorted produce       $28.05\n2x Cleaning supplies      $14.00\nOther items               $22.00\n\nSubtotal:  $84.32\nTotal charged to card ending 4471: $84.32\n\nQuestions about this order? Reply to this email or visit kroger.com/help.' },
  { uuid: 'email-2', gmail_message_id: 'g-102', thread_id: 't-102', subject: 'Your Kroger order #48390', from_address: 'noreply@kroger.com', from_name: 'Kroger', received_at: iso(DAY * 4), category: 'receipt', group_key: 'kroger', extracted: { merchant: 'Kroger', category: 'groceries', amount: 61.10, currency: 'USD', purchased_at: dayStamp(4) }, status: 'new', created_at: iso(DAY * 4), body: 'Thanks for shopping at Kroger!\n\nOrder #48390\nDelivered to: 412 Maple St\n\n1x Eggs, dozen             $3.99\n1x Coffee, 12oz bag        $9.99\n4x Frozen dinners         $19.96\nOther items               $27.16\n\nTotal charged to card ending 4471: $61.10' },
  { uuid: 'email-3', gmail_message_id: 'g-103', thread_id: 't-103', subject: 'Duke Energy: your October bill is ready', from_address: 'billing@duke-energy.com', from_name: 'Duke Energy', received_at: iso(DAY * 2), category: 'receipt', group_key: 'duke energy', extracted: { merchant: 'Duke Energy', category: 'energy', amount: 142.55, currency: 'USD', purchased_at: dayStamp(2) }, status: 'new', created_at: iso(DAY * 2), body: 'Your October electric bill is now available.\n\nAccount ending: 8821\nBilling period: Sep 1 - Sep 30\nUsage: 912 kWh (up 6% from last month)\nAmount due: $142.55\nDue date: ' + dayStamp(-14) + '\n\nAutopay is scheduled to draft this amount on the due date from your account ending 4471.\n\nView your full bill and usage history at duke-energy.com/myaccount.' },
  { uuid: 'email-4', gmail_message_id: 'g-104', thread_id: 't-104', subject: 'Your trip to Denver — confirmation', from_address: 'noreply@united.com', from_name: 'United Airlines', received_at: iso(DAY * 5), category: 'travel', group_key: null, extracted: { has_event: true, title: 'Flight to Denver (UA 512)', start: inMinutes(9 * 24 * 60), end: inMinutes(9 * 24 * 60 + 210), all_day: false, location: 'CLT → DEN' }, status: 'new', created_at: iso(DAY * 5), body: 'Your trip is confirmed.\n\nConfirmation code: 7QJKXP\n\nUA 512   CLT -> DEN\nDeparts 6:35 PM   Arrives 8:05 PM (Mountain Time)\nSeat 14C, Economy\n\n1 checked bag included with your fare.\n\nManage your trip at united.com/manage or in the United app.' },
  { uuid: 'email-5', gmail_message_id: 'g-105', thread_id: 't-105', subject: 'Riverside Elementary: early dismissal Friday', from_address: 'office@riverside.k12.example', from_name: 'Riverside Elementary', received_at: iso(DAY * 3), category: 'school', group_key: null, extracted: { has_event: true, title: 'Early dismissal — Riverside Elementary', start: dayStamp(-4), end: null, all_day: true, location: null }, status: 'new', created_at: iso(DAY * 3), body: 'Dear families,\n\nA reminder that this Friday is an early dismissal day for staff professional development. Students will be released at 12:15 PM instead of the usual 3:00 PM.\n\nAfter-care will still be available for families who need it — please sign up through the front office by Wednesday if you have not already.\n\nThank you,\nRiverside Elementary Office' },
  { uuid: 'email-6', gmail_message_id: 'g-106', thread_id: 't-106', subject: 'Weekend plans?', from_address: 'priya@example.com', from_name: 'Priya', received_at: iso(DAY * 6), category: 'other', group_key: null, extracted: null, status: 'new', created_at: iso(DAY * 6), body: "Hey! Any interest in checking out that new trail out by the lake this weekend? Weather looks decent Saturday morning. Let me know, no worries if you're busy." },
];
const mailSummary = () => {
  const news = mockEmails.filter((e) => e.status === 'new');
  const byCategory = (c: MockEmail['category']) => news.filter((e) => e.category === c).length;
  return {
    newCount: news.length,
    receiptCount: byCategory('receipt'),
    travelCount: byCategory('travel'),
    schoolCount: byCategory('school'),
    otherCount: byCategory('other'),
    preview: news.slice(0, 3),
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
    why: 'You ride most Sundays and haven’t this week — the trails are open and you have the afternoon.',
    activity: 'mountain biking', url: 'https://www.ncparks.gov/state-parks/lake-norman-state-park',
    distanceMi: 3, driveMinutes: 10, closesAt: '7:30 PM', closesInMinutes: 300, usableMinutes: 245,
    weatherDependent: true,
    weather: { outlook: 'fine' as const, now: 'Partly Sunny', temperatureF: 74, precipitationChance: 10 },
    rhythm: { activity: 'mountain biking', perWeek: 1.1, usualDay: 'Sunday', daysSince: 8, thisWeek: 0, isUsualDayToday: true },
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

async function route(method: string, path: string, body?: any): Promise<any> {
  await wait(150);
  const url = new URL(path, 'http://mock');
  const p = url.pathname;

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
  if (p === '/api/v1/access') {
    if (!signedIn) fail(401, 'Not authenticated');
    if (method === 'POST') localStorage.setItem('mock_access_requested', 'true');
    return mockAccess();
  }
  if (p === '/api/v1/profile') return { uuid: 'mock-profile', full_name: 'Sam Rivera' };
  if (p === '/api/v1/dashboard') return dashboardSummary();
  if (p === '/api/v1/dashboard/priority') return dashboardPriority();
  // Emergency banner: quiet by default; ?alert=urgent, =watch or =offline to see it.
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
    const feed = { ok: wanted !== 'offline', blocked: wanted === 'offline', lastOkAt: ago(wanted === 'offline' ? 9 : 1), error: wanted === 'offline' ? 'PulsePoint is blocking automated readers (AWS WAF challenge).' : null };
    // 'offline' = the 911 board blocked while the weather service still works.
    const sources = { calls: feed, weather: { ok: true, blocked: false, lastOkAt: ago(2), error: null } };
    const weatherAlerts = wanted === 'urgent' || wanted === 'offline'
      ? [{ id: 'nws1', event: 'Severe Thunderstorm Warning', severity: 'Severe', urgency: 'Immediate', headline: 'Severe Thunderstorm Warning issued', instruction: 'Move to an interior room on the lowest floor.', area: 'Iredell, NC', expires: new Date(Date.now() + 40 * 60000).toISOString(), place: 'Home', serious: true }]
      : [];
    if (wanted === 'urgent') return { level: 'urgent', headline: 'Structure fire and storm damage near home', body: 'A structure fire on Brer Fox Trail 0.9 miles away with 16 units on scene, plus a tree down at Shady Cove and Perth and a hazard on Neill Farm Road. Avoid Perth Rd.', incidents, key: 'mock-urgent', startedAt: ago(38), updatedAt: ago(1), assessedBy: 'mock', feed, sources, places, weather: weatherAlerts };
    if (wanted === 'watch') return { level: 'watch', headline: 'Tree down near home', body: 'A tree is down at Shady Cove Rd and Perth Rd, 1.1 miles away.', incidents: incidents.slice(1, 2), key: 'mock-watch', startedAt: ago(22), updatedAt: ago(1), assessedBy: 'mock', feed, sources, places, weather: weatherAlerts };
    return { level: 'none', headline: null, body: null, incidents: [], key: null, startedAt: null, updatedAt: null, assessedBy: null, feed, sources, places, weather: weatherAlerts };
  }
  if (p === '/api/v1/dashboard/incidents/places') {
    if (method === 'PUT') {
      const list = mockWatchPlaces();
      const at = list.findIndex((x) => x.name === body.name);
      const next = { uuid: at >= 0 ? list[at].uuid : `wp-${Date.now()}`, name: body.name, address: body.address ?? null, latitude: body.latitude, longitude: body.longitude, radiusMiles: body.radiusMiles ?? 3, enabled: body.enabled !== false };
      if (at >= 0) list[at] = next; else list.push(next);
      localStorage.setItem('mock_watch_places', JSON.stringify(list));
    }
    return { places: mockWatchPlaces() };
  }
  if (p.startsWith('/api/v1/dashboard/incidents/places/') && method === 'DELETE') {
    const uuid = decodeURIComponent(p.split('/').pop() || '');
    localStorage.setItem('mock_watch_places', JSON.stringify(mockWatchPlaces().filter((x) => x.uuid !== uuid)));
    return { places: mockWatchPlaces() };
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
  // ?rightnow=habit shows the suggestion built from nothing but Strava and a goal.
  if (p === '/api/v1/dashboard/right-now') {
    if (new URLSearchParams(window.location.search).get('rightnow') !== 'habit') return mockRightNow();
    return {
      ...mockRightNow(),
      headline: 'Get a ride in before piano',
      lead: {
        id: 'habit:cycling', kind: 'habit' as const, title: 'Cycling', activity: 'cycling',
        why: 'You ride about twice a week and haven’t since last Tuesday. It’s dry until evening.',
        weather: { outlook: 'fine' as const, now: 'Mostly Sunny', temperatureF: 71, precipitationChance: 10 },
        rhythm: { activity: 'cycling', perWeek: 1.8, usualDay: null, daysSince: 8, thisWeek: 0, isUsualDayToday: false },
      },
      alternates: [{
        id: 'goal:g1', kind: 'goal' as const, title: 'Learn spanish',
        why: 'Twenty minutes of practice fits even if the ride runs long.', detail: 'Conversational by summer',
      }],
    };
  }
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
  if (p === '/api/v1/dashboard/projects/import') {
    // The real parser lives in core_api; this stands in for its answer so the
    // preview-then-import flow can be exercised.
    const rows = String(body?.text || '').trim().split(/\r?\n/).filter(Boolean).slice(1);
    const projects = rows.map((row: string, i: number) => ({
      ...mockProjects[0], uuid: `proj-import-${i}`, title: row.split(/[,\t]/)[0], source: 'import',
    }));
    if (body?.dryRun) return { projects, created: 0, skipped: [], columns: ['title', 'area', 'status'], unmapped: [] };
    mockProjects = [...mockProjects, ...projects];
    return { projects, created: projects.length, skipped: [], columns: ['title', 'area', 'status'], unmapped: [] };
  }
  if (p === '/api/v1/dashboard/projects') {
    if (method === 'POST') {
      const project = { ...mockProjects[0], uuid: `proj-${Date.now()}`, ...body, status: 'todo' as const, source: 'manual' };
      mockProjects = [...mockProjects, project];
      return { project };
    }
    const counts = { todo: mockProjects.filter(x => x.status === 'todo').length, inProgress: mockProjects.filter(x => x.status === 'in_progress').length, blocked: 0, done: 0, open: mockProjects.length };
    return { projects: mockProjects, counts, maxProjects: 500 };
  }
  if (p.startsWith('/api/v1/dashboard/projects/')) {
    const uuid = decodeURIComponent(p.split('/')[5]);
    const project = mockProjects.find(x => x.uuid === uuid);
    if (!project) fail(404, 'That project is not on your list.');
    if (method === 'DELETE') { mockProjects = mockProjects.filter(x => x.uuid !== uuid); return { success: true }; }
    mockProjects = mockProjects.map(x => (x.uuid === uuid ? { ...x, ...body } : x));
    return { project: mockProjects.find(x => x.uuid === uuid) };
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
    return { items };
  }
  if (p === '/api/v1/dashboard/news') return dashboardNews();
  if (p === '/api/v1/session') return { session: { uuid: 'mock-session', mode: 'companion' } };
  if (p === '/api/v1/message' && method === 'GET') return [...messages];
  if (p === '/api/v1/message' && method === 'POST') {
    const human = { uuid: `h-${Date.now()}`, is_human: true, text: body.text, created_at: new Date().toISOString() };
    messages.push(human);
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
    return { message: human };
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
  if (p === '/api/v1/memory/journal') return journal;
  if (p === '/api/v1/memory/photos') {
    await wait(1600);
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
  if (p === '/api/v1/devices' && method === 'GET') return devices;
  if (p === '/api/v1/devices/pairing-code') return { code: 'K7QP-3XMV', device_uuid: 'd-new', expires_in: 600 };
  if (method === 'DELETE' && p.startsWith('/api/v1/devices/')) return { success: true };

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
    // The real execute() also marks the triaged email(s) 'actioned'; mirrored
    // here so a filed email leaves the Mail list the same way.
    if (action!.action_id === 'file_receipt_email') {
      const ids = ((action!.params?.items as { email_triage_uuid: string }[]) || []).map((i) => i.email_triage_uuid);
      mockEmails = mockEmails.map((e) => (ids.includes(e.uuid) ? { ...e, status: 'actioned' } : e));
    } else if (action!.action_id === 'file_travel_or_school_email') {
      const id = action!.params?.email_triage_uuid as string | undefined;
      mockEmails = mockEmails.map((e) => (e.uuid === id ? { ...e, status: 'actioned' } : e));
    } else if (action!.action_id === 'delete_email') {
      const ids = (action!.params?.email_triage_uuids as string[]) || [];
      mockEmails = mockEmails.map((e) => (ids.includes(e.uuid) ? { ...e, status: 'trashed' } : e));
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
