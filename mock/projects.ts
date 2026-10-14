// Mock of core_api's /api/v1/projects (src/services/projects). Holds an in-memory
// graph and answers every write with the whole snapshot, like the real one.
// The rules here are a stand-in — derived "blocked", progress and a rough rank —
// just enough to exercise the UI; the real arithmetic lives in core_api.

type Any = Record<string, any>;
const CLOSED = new Set(['done', 'dropped']);
const now = () => new Date().toISOString();
let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${seq++}`;

function project(over: Any): Any {
  return {
    uuid: uid('proj'), title: 'Untitled', goal: null, kind: null, status: 'idea', waitingOn: null, priority: 3,
    startsOn: null, endsOn: null, hardDeadline: null, metric: null,
    effort: { min: null, max: null, note: null }, indoor: null,
    cost: { diyLow: null, diyHigh: null, proLow: null, proHigh: null, note: null },
    valueNote: null, seasonMonths: null, conditions: [], serves: [], involvesChildren: false, visibility: 'private',
    areas: [{ area: 'home', primary: true }], steps: [], lastProgressAt: null, completedAt: null,
    source: 'manual', importKey: null, createdAt: now(), updatedAt: now(), ...over,
  };
}
const step = (title: string, status = 'todo') => ({ uuid: uid('step'), ordinal: 0, title, detail: null, status, who: 'me', blockedOn: null, dueOn: null, effortMinutes: null, indoor: null, completedAt: null });
const inDays = (d: number) => new Date(Date.now() + d * 86400e3).toISOString().slice(0, 10);

const water = project({ title: 'Keep water away from the foundation', kind: 'program', status: 'active', priority: 5, serves: ['protect_house'] });
const inspect = project({ title: 'Inspect the crawlspace', status: 'ready', priority: 5, effort: { min: 60, max: 120, note: null }, cost: { diyLow: 20, diyHigh: 75, proLow: null, proHigh: null, note: null }, indoor: false, serves: ['health'] });
const barrier = project({ title: 'Install a vapor barrier', status: 'planning', priority: 4, cost: { diyLow: 2500, diyHigh: 6000, proLow: 8000, proHigh: 18000, note: null }, seasonMonths: [9, 10, 11, 12, 1, 2] });
const gutters = project({ title: 'Clean gutters', status: 'done', priority: 4, completedAt: new Date(Date.now() - 5 * 86400e3).toISOString() });
const rain = project({ title: 'Film the gutters in the next rain', status: 'waiting', waitingOn: 'rain', conditions: ['during_rain'], effort: { min: 30, max: 60, note: null } });
const insulate = project({ title: 'Insulate the attic', status: 'active', priority: 4, hardDeadline: inDays(30), effort: { min: 360, max: 720, note: '1–2 Saturdays' }, steps: [step('Measure joist depth', 'done'), step('Buy batts'), step('Air-seal the top plates')] });
const shelves = project({ title: 'Rehang the garage shelves', status: 'ready', effort: { min: 120, max: 120, note: null }, indoor: true });
const steps = project({ title: 'Front walkway steps', status: 'active', steps: [step('Set the bottom step'), step('Plants'), step('Accent lighting')] });
const bulk = project({ title: 'Put on 20 lb of muscle', status: 'active', priority: 4, areas: [{ area: 'health', primary: true }], startsOn: inDays(-8), endsOn: inDays(143), metric: { source: 'weight', start: 180, target: 200, unit: 'lb' } });
const coaching = project({ title: 'Coach the U10 team', status: 'active', areas: [{ area: 'community', primary: true }, { area: 'family', primary: false }, { area: 'health', primary: false }], endsOn: inDays(9), involvesChildren: true });
const launch = project({ title: 'Launch the online store', status: 'active', priority: 4, areas: [{ area: 'work', primary: true }] });

let projects: Any[] = [water, inspect, barrier, gutters, rain, insulate, shelves, steps, bulk, coaching, launch];
let links: Any[] = [
  { from: inspect.uuid, to: water.uuid, relation: 'contributes_to', note: null },
  { from: barrier.uuid, to: water.uuid, relation: 'contributes_to', note: null },
  { from: gutters.uuid, to: water.uuid, relation: 'contributes_to', note: null },
  { from: rain.uuid, to: water.uuid, relation: 'contributes_to', note: null },
  { from: barrier.uuid, to: inspect.uuid, relation: 'depends_on', note: 'Diagnose the moisture first' },
];
let concerns: Any[] = [
  { uuid: uid('concern'), area: 'home', title: 'Crawlspace smells musty', severity: 5, frequency: 'ongoing', likelyCause: 'Water near the foundation', goalImpact: 'Health; the house', assessment: 'Treat it as a water problem first.', status: 'open', resolvedAt: null, projects: [inspect.uuid, barrier.uuid, rain.uuid] },
  { uuid: uid('concern'), area: 'home', title: 'House is cold in winter', severity: 4, frequency: 'winter', likelyCause: null, goalImpact: 'Comfort', assessment: null, status: 'open', resolvedAt: null, projects: [insulate.uuid] },
];
let charters: Any[] = [
  { area: 'home', body: '## Vision\nA safe, low-maintenance home that gets a little better every month.\n\n## Rules\n- Diagnose before buying.\n- Visible progress counts.', weights: { safety: 10, health: 10, protect_house: 8, enjoyment: 7, beautification: 6 }, updatedAt: now() },
];

// Journal entries by project uuid. Photos are never really stored in mock mode;
// api.blob answers with a placeholder picture.
const journal = new Map<string, Any[]>([
  [steps.uuid, [
    { uuid: uid('entry'), type: 'photo', phase: 'before', body: 'The empty slope', media: 'server', deviceRef: null, involvesChildren: false, source: 'manual', takenAt: null, createdAt: now() },
    { uuid: uid('entry'), type: 'decision', phase: null, body: 'Logs, rocks and mulch, with low accent lights.', media: null, deviceRef: null, involvesChildren: false, source: 'manual', takenAt: null, createdAt: now() },
  ]],
]);

// Bindings by project uuid; their live data is made up in bound() below.
const boundTo = new Map<string, Any[]>([
  [bulk.uuid, [{ uuid: uid('bind'), sourceType: 'health_metric', selector: { metric: 'weight' }, status: 'confirmed', proposedBy: 'owner' },
    { uuid: uid('bind'), sourceType: 'whoop_sport', selector: { sports: ['weightlifting'] }, status: 'confirmed', proposedBy: 'owner' }]],
  [coaching.uuid, [{ uuid: uid('bind'), sourceType: 'calendar_match', selector: { titleAny: ['U10'] }, status: 'confirmed', proposedBy: 'owner' }]],
]);
function bound(p: Any) {
  return (boundTo.get(p.uuid) || []).map(b => {
    if (b.sourceType === 'health_metric') {
      const series = Array.from({ length: 9 }, (_, i) => ({ date: inDays(i - 8), value: Math.round((180 + i * 0.25 + (i % 3) * 0.3) * 10) / 10 }));
      return { ...b, data: { unit: 'lb', start: 180, target: 200, startsOn: p.startsOn, endsOn: p.endsOn, actual: 181.6, planned: 181.1, gap: 0.5, verdict: 'on_track', latest: series[8], change: 1.6, series } };
    }
    if (b.sourceType === 'whoop_sport') {
      return { ...b, data: { sports: b.selector.sports, since: p.startsOn, total: 4, thisWeek: 2, bySport: { Weightlifting: 4 }, weekly: Array.from({ length: 8 }, (_, i) => ({ week: inDays(-7 * (7 - i)), count: [3, 3, 2, 3, 1, 3, 3, 2][i] })), last: { date: inDays(-1), sport: 'Weightlifting', minutes: 62, strain: 9.4 } } };
    }
    return { ...b, data: { upcoming: [{ title: 'U10 vs Hawks', start: `${inDays(3)}T14:00:00`, end: `${inDays(3)}T15:00:00`, allDay: false, location: 'Field 4' }] } };
  });
}

const fail = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }); };

function snapshot() {
  const byId = new Map(projects.map(p => [p.uuid, p]));
  const out = projects.map(p => {
    const deps = links.filter(l => l.relation === 'depends_on' && l.from === p.uuid).map(l => byId.get(l.to)).filter(Boolean) as Any[];
    const effectiveStatus = CLOSED.has(p.status) ? p.status : deps.some((d: Any) => !CLOSED.has(d.status)) ? 'blocked' : p.status;
    const parts = links.filter(l => l.relation === 'contributes_to' && l.to === p.uuid).map(l => byId.get(l.from)).filter((x): x is Any => !!x && x.status !== "dropped");
    const counted = p.steps.filter((s: Any) => s.status !== 'skipped');
    const severity = Math.max(0, ...concerns.filter(c => c.status !== 'resolved' && c.projects.includes(p.uuid)).map(c => c.severity));
    const days = p.hardDeadline ? Math.floor((Date.parse(`${p.hardDeadline}T23:59:59`) - Date.now()) / 86400e3) : null;
    const why: string[] = [];
    if (severity >= 4) why.push('answers an open concern');
    if (days !== null && days <= 45) why.push(days < 0 ? 'past its deadline' : `deadline in ${days} days`);
    const rank = CLOSED.has(p.status) ? null : p.priority * 10 + severity * 6 + (days !== null && days <= 45 ? 10 : 0) + (effectiveStatus === 'active' ? 5 : 0) - (['blocked', 'waiting'].includes(effectiveStatus) ? 15 : 0);
    return {
      ...p, effectiveStatus, primaryArea: (p.areas.find((a: Any) => a.primary) || p.areas[0]).area,
      steps: p.steps.map((s: Any, i: number) => ({ ...s, ordinal: i })),
      progress: { steps: { done: counted.filter((s: Any) => s.status === 'done').length, total: counted.length }, contributors: { done: parts.filter((x: Any) => x.status === 'done').length, total: parts.length } },
      rank, rankWhy: rank === null ? [] : why,
      bindings: boundTo.get(p.uuid) || [],
      media: { entries: (journal.get(p.uuid) || []).length, photos: (journal.get(p.uuid) || []).filter(e => e.type === 'photo').length, cover: null },
    };
  });
  return { success: true, projects: out, links, concerns, charters };
}

function merge(p: Any, body: Any) {
  const next = { ...p };
  for (const [k, v] of Object.entries(body || {})) {
    if (['effort', 'cost', 'metric'].includes(k)) next[k] = v === null ? null : { ...(p[k] || {}), ...(v as Any) };
    else if (k === 'areas' || k === 'primaryArea') continue;
    else next[k] = v;
  }
  if (body?.areas || body?.primaryArea) {
    const list: string[] = body.areas || p.areas.map((a: Any) => a.area);
    const primary = body.primaryArea || list[0];
    next.areas = [...new Set([primary, ...list])].map(a => ({ area: a, primary: a === primary }));
  }
  if (next.status !== 'waiting') next.waitingOn = null;
  next.completedAt = next.status === 'done' ? p.completedAt || now() : null;
  next.updatedAt = now();
  return next;
}

function cycles(from: string, to: string, relation: string) {
  if (from === to) return true;
  const stack = [to]; const seen = new Set<string>();
  while (stack.length) {
    const n = stack.pop()!;
    if (n === from) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    links.filter(l => l.relation === relation && l.from === n).forEach(l => stack.push(l.to));
  }
  return false;
}

/** Returns the mock answer for /api/v1/projects…, or undefined if the path is not ours. */
export function mockProjectsRoute(method: string, p: string, query: URLSearchParams, body: Any): Any | undefined {
  if (!p.startsWith('/api/v1/projects')) return undefined;
  const parts = p.split('/').slice(4).map(decodeURIComponent); // after /api/v1/projects
  const find = (uuid: string) => projects.find(x => x.uuid === uuid) || fail(404, 'That project is not on your list.');

  if (!parts.length) {
    if (method === 'POST') {
      if (!body?.title?.trim()) fail(400, 'A project needs a title.');
      projects = [...projects, merge(project({}), body)];
    }
    return snapshot();
  }
  if (parts[0] === 'binding-options') return { sports: [{ sport: 'Weightlifting', count: 40 }, { sport: 'Running', count: 12 }, { sport: 'Mountain Biking', count: 10 }, { sport: 'Soccer', count: 9 }], metrics: ['weight'] };
  if (parts[0] === 'concerns') {
    if (method === 'POST') concerns = [...concerns, { uuid: uid('concern'), resolvedAt: null, projects: [], status: 'open', severity: 3, ...body }];
    else if (method === 'PATCH') concerns = concerns.map(c => (c.uuid === parts[1] ? { ...c, ...body } : c));
    else if (method === 'DELETE') concerns = concerns.filter(c => c.uuid !== parts[1]);
    return snapshot();
  }
  if (parts[0] === 'charters') {
    charters = [...charters.filter(c => c.area !== parts[1]), { area: parts[1], body: body.body, weights: body.weights, updatedAt: now() }];
    return snapshot();
  }
  const target = find(parts[0]);
  if (parts.length === 1) {
    if (method === 'DELETE') {
      projects = projects.filter(x => x.uuid !== target.uuid);
      links = links.filter(l => l.from !== target.uuid && l.to !== target.uuid);
      concerns = concerns.map(c => ({ ...c, projects: c.projects.filter((u: string) => u !== target.uuid) }));
    } else projects = projects.map(x => (x.uuid === target.uuid ? merge(x, body) : x));
    return snapshot();
  }
  if (parts[1] === 'steps') {
    let list = [...target.steps];
    if (parts[2] === 'reorder') list = body.order.map((u: string) => list.find((s: Any) => s.uuid === u)).filter(Boolean);
    else if (!parts[2]) list.push(step(body.title, body.status));
    else if (method === 'DELETE') list = list.filter((s: Any) => s.uuid !== parts[2]);
    else list = list.map((s: Any) => (s.uuid === parts[2] ? { ...s, ...body } : s));
    projects = projects.map(x => (x.uuid === target.uuid ? { ...x, steps: list } : x));
    return snapshot();
  }
  if (parts[1] === 'bound') return { bindings: bound(target) };
  if (parts[1] === 'bindings') {
    const list = boundTo.get(target.uuid) || [];
    boundTo.set(target.uuid, method === 'DELETE' ? list.filter(b => b.uuid !== parts[2])
      : [...list, { uuid: uid('bind'), sourceType: body.sourceType, selector: body.selector, status: 'confirmed', proposedBy: 'owner' }]);
    return snapshot();
  }
  if (parts[1] === 'entries') {
    let list = journal.get(target.uuid) || [];
    if (method === 'GET') return { entries: list };
    if (method === 'POST') {
      if (body.image && (target.involvesChildren || body.involvesChildren)) fail(400, 'Photos of children stay on your device — this project involves children, so I cannot store the picture.');
      list = [{ uuid: uid('entry'), type: body.type, phase: body.type === 'photo' ? body.phase || 'progress' : null, body: body.body || null,
        media: body.type !== 'photo' ? null : body.image ? 'server' : 'device', deviceRef: body.deviceRef || null,
        involvesChildren: !!(target.involvesChildren || body.involvesChildren), source: 'manual', takenAt: null, createdAt: now() }, ...list];
    } else if (method === 'DELETE') list = list.filter(e => e.uuid !== parts[2]);
    else list = list.map(e => (e.uuid === parts[2] ? { ...e, ...body } : e));
    journal.set(target.uuid, list);
    return snapshot();
  }
  if (parts[1] === 'links') {
    if (method === 'POST') {
      find(body.to);
      if (cycles(target.uuid, body.to, body.relation)) fail(400, 'That would make them wait on each other.');
      links = [...links.filter(l => !(l.from === target.uuid && l.to === body.to && l.relation === body.relation)), { from: target.uuid, to: body.to, relation: body.relation, note: body.note || null }];
    } else links = links.filter(l => !(l.from === target.uuid && l.to === query.get('to') && l.relation === query.get('relation')));
    return snapshot();
  }
  return fail(404, 'Not found');
}
