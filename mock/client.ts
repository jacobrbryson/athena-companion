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
    recovery: ready([
      { date: dayStamp(0), recovery_score: 34, state: 'SCORED' },
      { date: dayStamp(1), recovery_score: 71, state: 'SCORED' },
    ]),
    sleep: ready([{ date: dayStamp(0), nap: false, hours_asleep: 5.4, sleep_performance_percent: 62 }]),
    strain: ready([{ date: dayStamp(0), day_strain: 14.2 }]),
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
    gmail: ready({ account: 'sam@example.com', messages: [
      { id: 'g1', title: 'Re: Q4 planning doc', from: 'priya@example.com', date: iso(1800_000), url: 'https://mail.google.com/' },
      { id: 'g2', title: 'Your Iceland booking', from: 'noreply@example.com', date: iso(7200_000), url: 'https://mail.google.com/' },
    ] }),
  };
}

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
        enabled: initiativePref.push_enabled,
        devices: devices.filter((d) => d.platform !== 'web').map((d) => ({ uuid: d.uuid, name: d.name })),
      },
      scores: triggerScores,
      catalog: TRIGGER_CATALOG,
      muted: mutedTriggers,
      recent: [...nudges].reverse(),
    };
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
