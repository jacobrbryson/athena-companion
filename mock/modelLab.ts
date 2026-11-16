/**
 * Mock for System → Models (/api/v1/llm/lab*) and the outage on /llm/status.
 *
 * Dev: localStorage.mock_outage = 'gemini-quota' shows the outage banner as
 * if Gemini were really out; starting a server drill in the tab does the same
 * until it ends or is stopped. localStorage.mock_lab_owner = 'false' shows
 * what a non-owner gets (a 403).
 */
const HOUR = 3_600_000;
let serverDrill: { scenario: string; label: string; startedAt: number; endsAt: number } | null = null;

const SCENARIOS = [
  { id: 'gemini-quota', label: 'Gemini out of quota' },
  { id: 'openai-down', label: 'OpenAI down' },
  { id: 'local-offline', label: 'Desktop (Ollama) offline' },
  { id: 'frontier-down', label: 'Every cloud model down' },
];

function ls(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function mockOutage() {
  if (serverDrill && serverDrill.endsAt <= Date.now()) serverDrill = null;
  const scenario = serverDrill?.scenario || ls('mock_outage');
  if (!scenario || scenario === 'local-offline') {
    return {
      level: 'ok', message: null, down: [], answering: { endpointId: 'gemini', tier: 'frontier', model: 'gemini-3.5-flash-lite', name: 'Gemini' }, lost: [],
      backupDown: scenario === 'local-offline' ? [{ endpointId: 'desk', name: 'the desktop model', tier: 'orcwood', reason: 'timeout', drill: serverDrill ? scenario : null, reopensInMs: 30_000 }] : [],
      drill: serverDrill ? { ...serverDrill, remainingMs: serverDrill.endsAt - Date.now() } : null,
    };
  }
  const all = scenario === 'frontier-down';
  return {
    level: 'degraded',
    message: `${all ? 'Gemini is out of quota; OpenAI is out of quota' : 'Gemini is out of quota'}. Athena is answering with the desktop model (slower). Unavailable: her voice, web search, some connected-service lookups${all ? ', making pictures' : ''}.`,
    down: [{ endpointId: 'gemini', name: 'Gemini', tier: 'frontier', reason: 'quota', drill: serverDrill ? scenario : null, reopensInMs: 42 * 60_000, since: Date.now() - 18 * 60_000 }],
    backupDown: [],
    answering: { endpointId: 'desk', tier: 'orcwood', model: 'qwen2.5:7b-instruct', name: 'the desktop model' },
    lost: ['her voice', 'web search', 'some connected-service lookups'],
    drill: serverDrill ? { ...serverDrill, remainingMs: serverDrill.endsAt - Date.now() } : null,
  };
}

const check = (rule: string, ok: boolean, detail: string) => ({ rule, ok, detail });

function preview(task: string, urgency: string, audience: string, chars: number, scenario: string | null) {
  const geminiOut = scenario === 'gemini-quota' || scenario === 'frontier-down' || ls('mock_outage') === 'gemini-quota' || serverDrill?.scenario === 'gemini-quota';
  const localOut = scenario === 'local-offline';
  const pinned = ['tts', 'search', 'tools', 'image', 'sing'].includes(task);
  if (pinned) {
    const chain = [{ endpointId: 'gemini', tier: 'frontier', model: task === 'tts' ? 'gemini-2.5-flash-preview-tts' : 'gemini-3.5-flash-lite', available: !geminiOut, drilled: geminiOut && scenario ? scenario : null, openReason: geminiOut ? 'quota' : null }];
    return { task, decision: { task, policy: 'smart', lead: { endpointId: 'gemini', why: 'only a cloud model can do this' }, local: [] }, chain, serving: geminiOut ? null : chain[0] };
  }
  const child = audience === 'child';
  const checks = [
    check('audience', !child, child ? 'child session: hosted models first' : 'adult session'),
    check('caller', true, 'no preference from the caller'),
    check('health', !localOut, localOut ? 'circuit open' : 'healthy'),
    check('fit', chars <= 24000, `${chars.toLocaleString()} of 24,000 prompt characters`),
    check('evidence', task !== 'vision', task === 'vision' ? 'vision: no recent eval of qwen2.5vl:7b' : task === 'extract' ? 'extraction: 2/2 vs frontier 100%' : 'reply-contract: 4/4 vs frontier 100%'),
    ...(task === 'chat' ? [check('evidence', true, 'recall-honesty: 2/2 vs frontier 100%')] : []),
    check('speed', urgency !== 'voice', urgency === 'voice' ? '4.1 s recent vs 3.5 s for voice' : urgency === 'background' ? 'background work: no time limit' : '2.2 s recent vs 9.0 s for interactive'),
  ];
  const lead = checks.every(c => c.ok);
  const excluded = task === 'extract' && child;
  const desk = { endpointId: 'desk', tier: 'orcwood', model: task === 'vision' ? 'qwen2.5vl:7b' : 'qwen2.5:7b-instruct', available: !localOut, drilled: localOut ? scenario : null, openReason: null };
  const gemini = { endpointId: 'gemini', tier: 'frontier', model: 'gemini-3.5-flash-lite', available: !geminiOut, drilled: geminiOut && scenario ? scenario : null, openReason: geminiOut ? 'quota' : null };
  const openai = { endpointId: 'openai', tier: 'frontier', model: 'gpt-5.4-mini', available: scenario !== 'frontier-down' && scenario !== 'openai-down', drilled: scenario === 'openai-down' || scenario === 'frontier-down' ? scenario : null, openReason: null };
  const chain = excluded ? [gemini, openai] : lead ? [desk, gemini, openai] : [gemini, openai, desk];
  const failed = checks.find(c => !c.ok);
  return {
    task,
    decision: {
      task, policy: 'smart', urgency,
      lead: { endpointId: chain[0].endpointId, why: lead ? 'local model passed every check' : `local model is the fallback: ${failed?.rule} (${failed?.detail})` },
      local: excluded ? [] : [{ endpointId: 'desk', model: desk.model, lead, checks }],
      ...(excluded ? { excluded: { endpoints: ['desk'], why: 'a child’s memory extraction never runs locally' } } : {}),
    },
    chain,
    serving: chain.find(c => c.available) || null,
  };
}

const evalRows = () => {
  const at = Date.now() - 7 * HOUR;
  return [
    { endpointId: 'desk', tier: 'orcwood', model: 'qwen2.5:7b-instruct', suite: 'reply-contract', passed: 4, total: 4, avgLatencyMs: 2200, at },
    { endpointId: 'desk', tier: 'orcwood', model: 'qwen2.5:7b-instruct', suite: 'recall-honesty', passed: 2, total: 2, avgLatencyMs: 2200, at },
    { endpointId: 'desk', tier: 'orcwood', model: 'qwen2.5:7b-instruct', suite: 'extraction', passed: 2, total: 2, avgLatencyMs: 2200, at },
    { endpointId: 'gemini', tier: 'frontier', model: 'gemini-3.5-flash-lite', suite: 'reply-contract', passed: 4, total: 4, avgLatencyMs: 700, at },
    { endpointId: 'gemini', tier: 'frontier', model: 'gemini-3.5-flash-lite', suite: 'recall-honesty', passed: 2, total: 2, avgLatencyMs: 700, at },
    { endpointId: 'gemini', tier: 'frontier', model: 'gemini-3.5-flash-lite', suite: 'extraction', passed: 2, total: 2, avgLatencyMs: 700, at },
  ];
};

const history = () => Array.from({ length: 10 }, (_, night) => evalRows().map(r => ({
  ...r, at: Date.now() - (10 - night) * 24 * HOUR, source: 'nightly',
  passed: r.endpointId === 'desk' && r.suite === 'reply-contract' && night < 4 ? 3 : r.passed,
}))).flat();

function stats(days: number) {
  const k = days === 1 ? 1 : 6.4;
  const row = (endpointId: string, tier: string, task: string, calls: number, errors: number, fallbackOk: number, p50: number, p95: number) =>
    ({ endpointId, tier, task, calls: Math.round(calls * k), ok: Math.round((calls - errors) * k), errors: Math.round(errors * k), invalid: tier === 'orcwood' ? Math.round(2 * k) : 0, fallbackOk: Math.round(fallbackOk * k), p50, p95 });
  const byTask = [
    row('gemini', 'frontier', 'chat', 212, 31, 0, 820, 2400),
    row('desk', 'orcwood', 'extract', 160, 0, 0, 1900, 3800),
    row('desk', 'orcwood', 'chat', 64, 1, 31, 2300, 5200),
    row('gemini', 'frontier', 'critique', 88, 6, 0, 600, 1500),
    row('desk', 'orcwood', 'json', 40, 0, 0, 1500, 2900),
    row('gemini', 'frontier', 'tts', 120, 18, 0, 1100, 2600),
  ];
  const roll = new Map<string, any>();
  for (const r of byTask) {
    const t = roll.get(r.endpointId) || { key: r.endpointId, tier: r.tier, calls: 0, ok: 0, errors: 0, invalid: 0, fallbackOk: 0, p50: r.p50, p95: r.p95 };
    t.calls += r.calls; t.ok += r.ok; t.errors += r.errors; t.invalid += r.invalid; t.fallbackOk += r.fallbackOk;
    roll.set(r.endpointId, t);
  }
  const ok = byTask.reduce((s, r) => s + r.ok, 0);
  const localOk = byTask.filter(r => r.tier === 'orcwood').reduce((s, r) => s + r.ok, 0);
  return {
    days,
    totals: { calls: byTask.reduce((s, r) => s + r.calls, 0), ok, fallbackOk: byTask.reduce((s, r) => s + r.fallbackOk, 0), localOk, localShare: +(localOk / ok).toFixed(3) },
    byEndpoint: [...roll.values()],
    byTask,
    incidents: [{ endpointId: 'gemini', startsAt: Date.now() - 30 * HOUR, endsAt: Date.now() - 22 * HOUR, errors: 412, quota: true }],
    savings: { calls: localOk, tokens: Math.round(localOk * 1450), usd: +(localOk * 0.00031).toFixed(2), estimate: true },
    tests: { smoke: 14, evals: 24 },
  };
}

function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function mockModelLab(method: string, url: URL, body: any): Promise<unknown> {
  const p = url.pathname;
  if (!p.startsWith('/api/v1/llm/lab')) return undefined;
  if (ls('mock_lab_owner') === 'false') fail(403, 'Only the owner can use the model lab');
  // Replay captured production payloads: set window.__REAL_LAB = { overview,
  // stats, evals, preview } before opening the tab. The mock's own data is
  // richer than a fresh production server's, which is how a missing field
  // once blanked the page in production only (2026-11-16).
  const real = (globalThis as { __REAL_LAB?: Record<string, unknown> }).__REAL_LAB;
  if (real && method === 'GET') {
    const key = p === '/api/v1/llm/lab' ? 'overview' : p.split('/').pop()!;
    if (key in real) return real[key];
  }

  if (p === '/api/v1/llm/lab') {
    return { owner: true, policy: 'smart', scenarios: SCENARIOS, maxDrillMinutes: 30, outage: mockOutage(),
      endpoints: [{ id: 'desk', tier: 'orcwood', chat: 'qwen2.5:7b-instruct' }, { id: 'gemini', tier: 'frontier', chat: 'gemini-3.5-flash-lite' }, { id: 'openai', tier: 'frontier', chat: 'gpt-5.4-mini' }] };
  }
  if (p === '/api/v1/llm/lab/stats') return stats(Number(url.searchParams.get('days')) || 1);
  if (p === '/api/v1/llm/lab/evals' && method === 'GET') return { latest: evalRows(), history: history() };
  if (p === '/api/v1/llm/lab/evals' && method === 'POST') { await wait(1500); return { latest: evalRows().map(r => ({ ...r, at: Date.now() })) }; }
  if (p === '/api/v1/llm/lab/preview') {
    const q = url.searchParams;
    return preview(q.get('task') || 'chat', q.get('urgency') || (q.get('task') === 'chat' ? 'interactive' : 'background'), q.get('audience') || 'adult', Number(q.get('chars')) || 2000, q.get('scenario'));
  }
  if (p === '/api/v1/llm/lab/ping') {
    await wait(600);
    return { endpoints: [{ endpointId: 'desk', baseUrl: 'https://bt-one.example.ts.net:8443/v1', viaTailnet: true, reachable: true, latencyMs: 84, models: ['qwen2.5:7b-instruct', 'qwen2.5vl:7b', 'nomic-embed-text'], missing: [], gate: 'enforced', error: null }] };
  }
  if (p === '/api/v1/llm/lab/drill/test') {
    await wait(1200);
    const scenario = String(body?.scenario || '');
    const label = SCENARIOS.find(s => s.id === scenario)?.label || scenario;
    const frontierGone = scenario === 'frontier-down' || scenario === 'gemini-quota';
    const voiceSlow = body?.urgency === 'voice';
    return {
      scenario, label, passed: true,
      reply: 'A warm shower and ten minutes with your phone in another room. Want me to set a wind-down reminder?',
      servedBy: frontierGone
        ? { endpointId: 'desk', tier: 'orcwood', model: 'qwen2.5:7b-instruct', fallback: true, why: 'fallback after gemini' + (scenario === 'frontier-down' ? ', openai' : '') }
        : { endpointId: voiceSlow ? 'gemini' : 'desk', tier: voiceSlow ? 'frontier' : 'orcwood', model: voiceSlow ? 'gemini-3.5-flash-lite' : 'qwen2.5:7b-instruct', fallback: scenario === 'local-offline' && !voiceSlow, why: voiceSlow ? 'local model is the fallback: speed (4.1 s recent vs 3.5 s for voice)' : 'local model passed every check' },
      attempts: frontierGone ? [{ endpointId: 'gemini', error: 'drill: Gemini 429 RESOURCE_EXHAUSTED (quota)', drill: true }, ...(scenario === 'frontier-down' ? [{ endpointId: 'openai', error: 'drill: frontier unavailable', drill: true }] : [])] : [],
      error: null,
      latencyMs: frontierGone ? 2350 : 910,
      wouldLose: frontierGone ? ['voice', 'web search', 'connected-service lookups'] : [],
    };
  }
  if (p === '/api/v1/llm/lab/drill/server' && method === 'POST') {
    const scenario = String(body?.scenario || 'gemini-quota');
    const minutes = Math.min(30, Math.max(1, Number(body?.minutes) || 10));
    serverDrill = { scenario, label: SCENARIOS.find(s => s.id === scenario)?.label || scenario, startedAt: Date.now(), endsAt: Date.now() + minutes * 60_000 };
    return { drill: { ...serverDrill, remainingMs: minutes * 60_000 }, outage: mockOutage() };
  }
  if (p === '/api/v1/llm/lab/drill/server' && method === 'DELETE') {
    const stopped = !!serverDrill;
    serverDrill = null;
    return { stopped, outage: mockOutage() };
  }
  if (p === '/api/v1/llm/lab/compare') {
    await wait(1800);
    return { message: body?.message || 'Quick check', results: [
      { endpointId: 'desk', tier: 'orcwood', model: 'qwen2.5:7b-instruct', latencyMs: 2140, valid: true, reply: 'Try a short walk without your phone, then something warm to drink.', error: null },
      { endpointId: 'gemini', tier: 'frontier', model: 'gemini-3.5-flash-lite', latencyMs: 690, valid: true, reply: 'Put on a playlist you love and stretch for ten minutes — your back will thank you.', error: null },
      { endpointId: 'openai', tier: 'frontier', model: 'gpt-5.4-mini', latencyMs: null, valid: false, reply: null, error: 'openai /chat/completions -> HTTP 429 insufficient_quota' },
    ] };
  }
  return undefined;
}
