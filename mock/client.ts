/**
 * DEV-ONLY mock of src/api/client.ts for `npm run dev:mock`.
 *
 * Lets the Companion UI run with no proxy_service, core_api, database or
 * Google sign-in: vite.mock.config.ts swaps this in for the real client.
 * Everything here is canned; nothing is persisted. Never imported by the
 * production build.
 */

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

const devices = [
  { uuid: 'd1', name: 'Pixel 9', platform: 'android', capabilities: { ramGb: 12, installed: [{ id: 'gemini-nano' }] }, last_seen_at: iso(3 * 60_000), created_at: iso(DAY * 5) },
];

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
  if (p === '/api/v1/session') return { session: { uuid: 'mock-session', mode: 'companion' } };
  if (p === '/api/v1/message' && method === 'GET') return [...messages];
  if (p === '/api/v1/message' && method === 'POST') {
    const human = { uuid: `h-${Date.now()}`, is_human: true, text: body.text, created_at: new Date().toISOString() };
    messages.push(human);
    setTimeout(() => {
      const remember = /remember|recall/i.test(body.text);
      messages.push({
        uuid: `a-${Date.now()}`,
        is_human: false,
        text: remember
          ? "I don't remember you telling me that one — tell me and I'll hold onto it."
          : 'Mm. Tell me more — is this about the trip, or something new?',
        created_at: new Date().toISOString(),
      });
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
  if (method === 'DELETE' && p.startsWith('/api/v1/memory')) return { success: true };
  if (p === '/api/v1/llm/status') return status;
  if (p === '/api/v1/llm/manifest') return manifest;
  if (p === '/api/v1/devices' && method === 'GET') return devices;
  if (p === '/api/v1/devices/pairing-code') return { code: 'K7QP-3XMV', device_uuid: 'd-new', expires_in: 600 };
  if (method === 'DELETE' && p.startsWith('/api/v1/devices/')) return { success: true };
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
