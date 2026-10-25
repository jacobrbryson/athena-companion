// Mock of core_api's /api/v1/projects (src/services/projects). Holds an in-memory
// graph and answers every write with the whole snapshot, like the real one.
// The rules here are a stand-in — derived "blocked", progress and a rough rank —
// just enough to exercise the UI; the real arithmetic lives in core_api.

import { execution, completion, closeout, criteriaOf } from './projectExecution';

type Any = Record<string, any>;
const CLOSED = new Set(['done', 'dropped']);
const now = () => new Date().toISOString();
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
let seq = 0;
let property: Any | null = null;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${seq++}`;
// Property issues (core_api controllers/propertyIssues.js); photos held apart, like the real tables.
let issues: Any[] = [];
// Vehicles at the property (core_api controllers/propertyVehicles.js); the photo held apart, like the real column.
let vehicles: Any[] = [];
// Every new mock vehicle gets these, so the recalls section has something to show.
const MOCK_RECALLS = [
  { campaign: '20V123000', component: 'ELECTRICAL SYSTEM', summary: 'A wiring harness in the engine bay may chafe and short circuit.', consequence: 'A short circuit increases the risk of a fire, even while parked.', remedy: 'Dealers will inspect and reroute the harness, free of charge.', reportedOn: '2020-03-02', parkIt: false, parkOutside: true, status: 'open', firstSeenAt: new Date().toISOString() },
  { campaign: '18V918000', component: 'EQUIPMENT:OTHER:LABELS', summary: 'The sun visor air bag warning label may be incorrect or missing.', consequence: 'Without the label, occupants may not know how to use the restraints.', remedy: 'Dealers will replace the visor labels.', reportedOn: '2018-12-19', parkIt: false, parkOutside: false, status: 'open', firstSeenAt: new Date().toISOString() },
];
let mockCars: Any[] = [{ id: 'aaaabbbb-1111-2222-3333-444455556666', vehicleUuid: null, vehicleName: null, make: 'BMW', model: 'X5', year: 2019, vin: '5UXCR6C56KLL12345', odometerMi: 31069, fuel: { percent: 42, rangeMi: 186 }, battery: null, locked: false, locationEnabled: false, location: null, syncedAt: new Date().toISOString() }];
const vehiclePhotos = new Map<string, string>();
// Dev-only: mock_vehicle_deadline=true starts with a property and a car whose
// registration and inspection are due in three days — the Home deadline banner.
if (localStorage.getItem('mock_vehicle_deadline') === 'true') {
  const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
  property = { uuid: 'property-mock', name: 'Home', address: '1 Main St', areas: [] };
  vehicles = [{ uuid: 'vehicle-mock-x5', propertyUuid: property.uuid, name: 'BMW X5', year: 2019, make: 'BMW', model: 'X5', color: 'Black', plate: 'BRSN1', vin: null,
    registrationState: 'VA', registrationNumber: 'R1234567', inspectionStation: null, odometer: 31069, odometerOn: inDays(-3),
    registrationDue: inDays(3), inspectionDue: inDays(3), insuranceDue: inDays(90), serviceDue: null, serviceDueMiles: null, notes: null,
    hasPhoto: false, createdAt: now(), updatedAt: now(), service: [], recalls: MOCK_RECALLS }];
}
const issuePhotos = new Map<string, string>();

// Linked, one thermostat online and one offline — the case the panel exists for.
let mockSleepDevice: string | null = 'enterprises/mock/devices/up';
const mockThermostats = () => [
    { name: 'enterprises/mock/devices/up', displayName: null, room: 'Upstairs', type: 'thermostat', connectivity: 'ONLINE', offlineSince: null, onlineSince: iso(86_400_000),
      readings: { temperatureC: 21.1, humidityPercent: 41, mode: 'HEAT', heatC: 20.5, hvac: 'HEATING', scale: 'FAHRENHEIT' } },
    { name: 'enterprises/mock/devices/den', displayName: 'Den Thermostat', room: 'Den', type: 'thermostat', connectivity: 'OFFLINE', notReporting: true, offlineSince: iso(40 * 60_000), onlineSince: null,
      readings: { mode: 'COOL', coolC: 25, eco: 'OFF', hvac: 'OFF', scale: 'FAHRENHEIT', google: 'ONLINE' } },
    { name: 'enterprises/mock/devices/down', displayName: null, room: 'Downstairs', type: 'thermostat', connectivity: 'OFFLINE', offlineSince: iso(2 * 3_600_000), onlineSince: null,
      readings: { temperatureC: 19.4, humidityPercent: 45, mode: 'HEATCOOL', heatC: 19, coolC: 24.5, scale: 'FAHRENHEIT' } },
].map(t => ({ ...t, sleepDevice: t.name === mockSleepDevice }));

function project(over: Any): Any {
  return {
    uuid: uid('proj'), title: 'Untitled', goal: null, kind: null, status: 'idea', waitingOn: null, priority: 3,
    startsOn: null, endsOn: null, hardDeadline: null, metric: null,
    effort: { min: null, max: null, note: null }, indoor: null,
    cost: { diyLow: null, diyHigh: null, proLow: null, proHigh: null, note: null },
    valueNote: null, seasonMonths: null, conditions: [], serves: [], involvesChildren: false, visibility: 'private',
    areas: [{ area: 'home', primary: true }], steps: [], lastProgressAt: null, completedAt: null,
    source: 'manual', importKey: null, refCode: null, revision: null, pinnedAt: null,
    budget: { working: null, ceiling: null, note: null }, items: [], createdAt: now(), updatedAt: now(), ...over,
  };
}
const step = (title: string, status = 'todo', over: Any = {}) => ({ uuid: uid('step'), ordinal: 0, title, detail: null, status, who: 'me', blockedOn: null, dueOn: null, effortMinutes: null, indoor: null, completedAt: null,
  phase: null, acceptanceCriteria: null, waitingOnActor: null, reviewAt: null, unblockAction: null, dependsOn: [] as string[], ...over });
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
const item = (kind: 'spec' | 'material', label: string, value: string | null, unit: string | null, status = 'pending', cost: [number, number] | null = null) =>
  ({ uuid: uid('item'), kind, ordinal: 0, label, value, unit, status, costLow: cost?.[0] ?? null, costHigh: cost?.[1] ?? null, note: null, confirmedAt: status === 'confirmed' ? now() : null });
// The side yard, wired like the owner's plan: what each step needs first, one blocker past its check-back day.
const sy = {
  layout: step('Produce a dimensioned overhead site layout', 'done', { phase: 'Design and Approvals', dueOn: inDays(1) }),
  line: step('Measure and mark the 32-foot fence line', 'todo', { phase: 'Design and Approvals', dueOn: inDays(6), effortMinutes: 45, indoor: false, detail: 'From the house (behind the pad) toward the evergreens. Mark the fence line and the 4 ft gate opening.' }),
  gate: step('Mark the gate opening', 'todo', { phase: 'Design and Approvals', effortMinutes: 20, acceptanceCriteria: 'Opening is 4 ft clear' }),
  wall: step('Verify the structural wall attachment', 'blocked', { phase: 'Procurement and Site Prep', dueOn: inDays(10), blockedOn: 'house framing check', waitingOnActor: 'the contractor', reviewAt: new Date(Date.now() - 86400e3).toISOString() }),
  pour: step('Excavate, set footings and pour', 'todo', { phase: 'Concrete and Foundations', dueOn: inDays(18) }),
};
sy.line.dependsOn = [sy.layout.uuid];
sy.gate.dependsOn = [sy.line.uuid];
sy.pour.dependsOn = [sy.gate.uuid, sy.wall.uuid];
const sideyard = project({ title: 'Side yard: awning, pad, fence & gate', refCode: 'HOME-SIDEYARD-2026-001', revision: '1.2', status: 'planning', priority: 4, pinnedAt: now(),
  budget: { working: 3200, ceiling: 4200, note: 'Until the final material takeoff' }, cost: { diyLow: 3200, diyHigh: 4200, proLow: null, proHigh: null, note: 'DIY' },
  indoor: false, conditions: ['dry'],
  doneWhen: 'Concrete pad drains away from the house\nAwning is secure and weather-resistant\nFence is stable and 6\' tall\nGate opens and latches correctly\nTrash cans roll through easily\nSite is cleaned up\nRequired inspections are complete',
  doneWhenConfirmed: [],
  sessions: [{ uuid: uid('session'), stepUuid: sy.line.uuid, plannedStart: `${inDays(6)}T13:00:00.000Z`, plannedMinutes: 120, actualMinutes: null, status: 'planned', madeProgress: null, calendarEventId: null, calendarInSync: null, notes: null, completedAt: null, createdAt: now() }],
  steps: [sy.layout, sy.line, sy.gate, sy.wall, sy.pour],
  items: [item('spec', 'Fence alignment', 'House wall → evergreens', null, 'confirmed'), item('spec', 'Fence run', '32', 'ft', 'confirmed'), item('spec', 'Gate location', 'Beside the pad', null),
    item('material', 'Freestanding fence posts', '5–7', 'posts', 'estimate', [150, 260]), item('material', 'Gate, 4 ft', '1', 'gate', 'estimate', [250, 450])] });
const launch = project({ title: 'Launch the online store', status: 'active', priority: 4, areas: [{ area: 'work', primary: true }] });

let projects: Any[] = [sideyard, water, inspect, barrier, gutters, rain, insulate, shelves, steps, bulk, coaching, launch];
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

let prefs = { focusLimit: 3, preferFinishing: true };

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
    const pins = projects.filter(x => x.pinnedAt && !CLOSED.has(x.status)).sort((a, b) => b.pinnedAt.localeCompare(a.pinnedAt));
    if (p.pinnedAt && !CLOSED.has(p.status)) why.unshift('you moved it to the front');
    const rank = CLOSED.has(p.status) ? null : p.pinnedAt ? 100_000 + pins.length - pins.indexOf(p) : p.priority * 10 + severity * 6 + (days !== null && days <= 45 ? 10 : 0) + (effectiveStatus === 'active' ? 5 : 0) - (['blocked', 'waiting'].includes(effectiveStatus) ? 15 : 0);
    return {
      ...p, effectiveStatus, primaryArea: (p.areas.find((a: Any) => a.primary) || p.areas[0]).area,
      steps: p.steps.map((s: Any, i: number) => ({ ...s, ordinal: i })),
      items: p.items.map((it: Any, i: number) => ({ ...it, ordinal: i })),
      progress: { steps: { done: counted.filter((s: Any) => s.status === 'done').length, total: counted.length }, contributors: { done: parts.filter((x: Any) => x.status === 'done').length, total: parts.length } },
      rank, rankWhy: rank === null ? [] : why,
      bindings: boundTo.get(p.uuid) || [],
      media: { entries: (journal.get(p.uuid) || []).length, photos: (journal.get(p.uuid) || []).filter(e => e.type === 'photo').length, cover: null },
    };
  }).map(p => ({ ...p, sessions: p.sessions || [], execution: execution(p), completion: completion(p), closeout: closeout(p) }));
  const active = out.filter(p => p.effectiveStatus === 'active').length;
  return {
    success: true, projects: out, links, concerns, charters, prefs,
    execution: {
      nextActions: out.map(p => p.execution?.nextAction).filter(Boolean), followUps: out.flatMap(p => p.execution?.dueFollowUps || []),
      upcomingSessions: [], focus: { active, limit: prefs.focusLimit, preferFinishing: prefs.preferFinishing, over: prefs.preferFinishing && active >= prefs.focusLimit }, metrics: {},
    },
  };
}

function merge(p: Any, body: Any) {
  const next = { ...p };
  for (const [k, v] of Object.entries(body || {})) {
    if (k === 'pinned') next.pinnedAt = v ? now() : null;
    else if (['effort', 'cost', 'metric', 'budget'].includes(k)) next[k] = v === null ? null : { ...(p[k] || {}), ...(v as Any) };
    else if (k === 'areas' || k === 'primaryArea') continue;
    else next[k] = v;
  }
  if (body?.areas || body?.primaryArea) {
    const list: string[] = body.areas || p.areas.map((a: Any) => a.area);
    const primary = body.primaryArea || list[0];
    next.areas = [...new Set([primary, ...list])].map(a => ({ area: a, primary: a === primary }));
  }
  if (next.status !== 'waiting') next.waitingOn = null;
  const checks = criteriaOf(next.doneWhen);
  if (next.status === 'done' && p.status !== 'done' && checks.length) {
    if (body?.outcomeConfirmed !== true) fail(400, `"${p.title}" says what done looks like. Confirm the outcome to close it out.`);
    next.doneWhenConfirmed = checks;
    next.outcomeConfirmedAt = now();
  }
  delete next.outcomeConfirmed;
  next.doneWhenConfirmed = (next.doneWhenConfirmed || []).filter((c: string) => checks.includes(c));
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
  // Security has its own mock in client.ts.
  if (p.startsWith('/api/v1/projects/property/security')) return undefined;
  if (p === '/api/v1/projects/property/thermostats/sleep-device' && method === 'PUT') {
    mockSleepDevice = body?.device ?? null;
    return { devices: mockThermostats() };
  }
  if (p === '/api/v1/projects/property/thermostats') return { status: 'ready', stale: false, devices: mockThermostats() };
  if (p === '/api/v1/projects/property/weather') return { status: property?.address ? 'ready' : 'no_address', weather: property?.address ? { temperatureF: 62, description: 'Mostly sunny', highF: 68, lowF: 49, checkedAt: now(), periodStart: now() } : null };
  if (p === '/api/v1/projects/property') {
    if (method === 'PUT') property = { ...body, uuid: property?.uuid || uid('property') };
    return { properties: property ? [property] : [] };
  }
  // Cars through Smartcar: one linked car, location off until turned on.
  if (p.startsWith('/api/v1/projects/property/vehicles/smartcar')) {
    const carId = decodeURIComponent(p.split('/')[7] || '');
    if (method === 'PATCH' && carId) {
      mockCars = mockCars.map(c => c.id !== carId ? c : {
        ...c,
        ...(body.vehicleUuid !== undefined ? { vehicleUuid: body.vehicleUuid, vehicleName: vehicles.find(v => v.uuid === body.vehicleUuid)?.name || null } : {}),
        ...(body.locationEnabled !== undefined ? { locationEnabled: body.locationEnabled, location: body.locationEnabled ? { latitude: 35.5824, longitude: -80.8723, at: now() } : null } : {}),
      });
    }
    return { status: 'ready', stale: false, cars: mockCars };
  }
  if (p.startsWith('/api/v1/projects/property/vehicles')) {
    const [uuid, sub, entryId] = p.split('/').slice(6).map(decodeURIComponent);
    if (sub === 'recalls' && method === 'PATCH') {
      vehicles = vehicles.map(v => v.uuid !== uuid ? v : { ...v, recalls: (v.recalls || []).map((r: Any) => r.campaign === entryId ? { ...r, status: body.status } : r) });
      return { vehicles };
    }
    const vehicle = uuid ? vehicles.find(v => v.uuid === uuid) || fail(404, 'That vehicle is no longer on your list.') : null;
    if (sub === 'photo') return { image: vehiclePhotos.get(uuid) || null };
    if (sub === 'service') {
      if (method === 'POST') {
        if (!body?.what?.trim()) fail(400, 'Say what was done.');
        vehicles = vehicles.map(v => v.uuid !== uuid ? v : {
          ...v, service: [{ uuid: uid('service'), doneOn: body.doneOn, odometer: body.odometer, what: body.what.trim(), shop: body.shop }, ...v.service].sort((a: Any, b: Any) => b.doneOn.localeCompare(a.doneOn)),
          ...(body.odometer !== null && (v.odometer === null || body.odometer > v.odometer) ? { odometer: body.odometer, odometerOn: body.doneOn } : {}),
        });
      } else if (method === 'DELETE') vehicles = vehicles.map(v => v.uuid === uuid ? { ...v, service: v.service.filter((s: Any) => s.uuid !== entryId) } : v);
      return { vehicles };
    }
    const shape = (b: Any, v: Any = {}) => {
      const next = { ...v, ...b, photo: undefined, updatedAt: now() };
      next.name = (b.name ?? v.name ?? '').trim() || [next.year, next.make, next.model].filter(Boolean).join(' ');
      if (!next.name) fail(400, 'Give the vehicle a name, or its make and model.');
      for (const k of ['make', 'model', 'color', 'plate', 'vin', 'registrationState', 'registrationNumber', 'inspectionStation', 'notes']) next[k] = typeof next[k] === 'string' ? next[k].trim() || null : next[k] ?? null;
      if (b.odometer !== undefined && b.odometer !== v.odometer) next.odometerOn = b.odometer === null ? null : now().slice(0, 10);
      if (b.photo !== undefined) { if (b.photo) vehiclePhotos.set(next.uuid, b.photo); else vehiclePhotos.delete(next.uuid); }
      next.hasPhoto = vehiclePhotos.has(next.uuid);
      return next;
    };
    if (method === 'POST') {
      if (!property) fail(400, 'Add your property first — vehicles live at a property.');
      const blank = { recalls: MOCK_RECALLS, uuid: uid('vehicle'), propertyUuid: property.uuid, year: null, make: null, model: null, color: null, plate: null, vin: null, registrationState: null, registrationNumber: null, inspectionStation: null, odometer: null, odometerOn: null, registrationDue: null, inspectionDue: null, insuranceDue: null, serviceDue: null, serviceDueMiles: null, notes: null, createdAt: now(), service: [] };
      vehicles = [...vehicles, shape({ ...body, propertyUuid: body.propertyUuid || property.uuid }, blank)];
    } else if (method === 'PATCH') vehicles = vehicles.map(v => v.uuid === uuid ? shape(body, v) : v);
    else if (method === 'DELETE') { vehicles = vehicles.filter(v => v.uuid !== vehicle.uuid); vehiclePhotos.delete(vehicle.uuid); }
    return { vehicles };
  }
  if (p.startsWith('/api/v1/projects/property/issues')) {
    const [uuid, sub, noteId] = p.split('/').slice(6).map(decodeURIComponent);
    const issue = uuid ? issues.find(i => i.uuid === uuid) || fail(404, 'That issue is no longer on your list.') : null;
    if (sub === 'notes') {
      if (method === 'POST') { if (!body?.body?.trim()) fail(400, 'Add the note.'); issues = issues.map(i => i.uuid === uuid ? { ...i, log: [...i.log, { uuid: uid('note'), body: body.body.trim(), createdAt: now() }] } : i); }
      else if (method === 'DELETE') issues = issues.map(i => i.uuid === uuid ? { ...i, log: i.log.filter((n: Any) => n.uuid !== noteId) } : i);
      return { issues };
    }
    if (sub === 'photos') return { photos: issue.photos.map((u: string) => ({ uuid: u, image: issuePhotos.get(u) })) };
    const store = (list: string[] = []) => list.map(image => { const u = uid('photo'); issuePhotos.set(u, image); return u; });
    if (method === 'POST') issues = [{ uuid: uid('issue'), status: 'open', resolvedAt: null, createdAt: now(), updatedAt: now(), notes: null, ...body, photos: store(body.photos), log: [] }, ...issues];
    else if (method === 'PATCH') issues = issues.map(i => i.uuid !== uuid ? i : {
      ...i, ...body, addPhotos: undefined, removePhotos: undefined, updatedAt: now(),
      resolvedAt: body.status && body.status !== i.status ? (body.status === 'resolved' ? now() : null) : i.resolvedAt,
      photos: [...i.photos.filter((u: string) => !(body.removePhotos || []).includes(u)), ...store(body.addPhotos)],
    });
    else if (method === 'DELETE') issues = issues.filter(i => i.uuid !== issue.uuid);
    return { issues };
  }
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
  if (parts[0] === 'prefs') { prefs = { ...prefs, ...body }; return snapshot(); }
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
    else if (!parts[2]) list.push(step(body.title, body.status, body.phase ? { phase: body.phase } : {}));
    else if (parts[3] === 'dependencies') {
      const dep = method === 'DELETE' ? parts[4] : body.dependsOn;
      if (dep === parts[2]) fail(400, "A step can't need itself first.");
      // Would the new edge loop back? Walk from the prerequisite through what it needs.
      const needs = (u: string, seen = new Set<string>()): boolean => u === parts[2] || (!seen.has(u) && (seen.add(u), (list.find((x: Any) => x.uuid === u)?.dependsOn || []).some((v: string) => needs(v, seen))));
      if (method !== 'DELETE' && needs(dep)) fail(400, 'That would make those steps wait on each other.');
      list = list.map((s: Any) => (s.uuid !== parts[2] ? s : { ...s, dependsOn: method === 'DELETE' ? s.dependsOn.filter((u: string) => u !== dep) : [...new Set([...s.dependsOn, dep])] }));
    }
    else if (method === 'DELETE') list = list.filter((s: Any) => s.uuid !== parts[2]);
    else list = list.map((s: Any) => (s.uuid !== parts[2] ? s : { ...s, ...body, ...((body.status ?? s.status) !== 'blocked' ? { blockedOn: null, waitingOnActor: null, reviewAt: null, unblockAction: null } : {}),
      ...(body.reviewAt && /^\d{4}-\d{2}-\d{2}$/.test(body.reviewAt) ? { reviewAt: `${body.reviewAt}T12:00:00.000Z` } : {}) }));
    projects = projects.map(x => (x.uuid === target.uuid ? { ...x, steps: list } : x));
    return snapshot();
  }
  if (parts[1] === 'items') {
    let list = [...target.items];
    if (!parts[2]) {
      if (!body?.label?.trim()) fail(400, 'Say what it is — a label like "Fence length".');
      list.push({ ...item(body.kind || 'spec', body.label.trim(), body.value || null, body.unit || null, body.status || 'pending'), costLow: body.costLow ?? null, costHigh: body.costHigh ?? null, note: body.note || null });
    } else if (method === 'DELETE') list = list.filter((it: Any) => it.uuid !== parts[2]);
    else list = list.map((it: Any) => (it.uuid === parts[2] ? { ...it, ...body, kind: it.kind, confirmedAt: (body.status ?? it.status) === 'confirmed' ? it.confirmedAt || now() : null } : it));
    projects = projects.map(x => (x.uuid === target.uuid ? { ...x, items: list } : x));
    return snapshot();
  }
  if (parts[1] === 'sessions') {
    let list = [...(target.sessions || [])];
    if (method === 'POST') list.push({ uuid: uid('session'), stepUuid: body.stepUuid ?? null, plannedStart: body.plannedStart, plannedMinutes: body.plannedMinutes, actualMinutes: null, status: 'planned', madeProgress: null, calendarEventId: null, calendarInSync: null, notes: null, completedAt: null, createdAt: now() });
    else if (method === 'DELETE') list = list.filter((s: Any) => s.uuid !== parts[2]);
    else list = list.map((s: Any) => (s.uuid === parts[2] ? { ...s, ...body, ...(body.plannedStart && s.calendarEventId ? { calendarInSync: false } : {}) } : s));
    projects = projects.map(x => (x.uuid === target.uuid ? { ...x, sessions: list } : x));
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
