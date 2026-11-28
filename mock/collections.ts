/**
 * Mock collections for `npm run dev:mock`: one Christmas list shaped like the
 * owner's acceptance test (2026-11-28) — three people, some ideas kept, some
 * suggested by Athena with their reasons.
 */
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const item = (uuid: string, title: string, status: string, source: string, reason: string | null = null, fields: Any = {}) =>
  ({ uuid, title, status, fields, source, reason, removed: false });

const christmas: Any = {
  uuid: 'col-christmas',
  name: 'Christmas list 2026',
  purpose: 'Gifts for the people I love',
  fields: [{ name: 'price', label: 'Price', type: 'money' }, { name: 'link', label: 'Link', type: 'link' }],
  statuses: ['idea', 'bought', 'given'],
  perPerson: true,
  home: 'top',
  endsOn: '2026-12-26',
  archived: false,
  people: [
    { uuid: 's-ash', personKey: 'f2', label: 'Ashlynn', done: false, items: [
      item('i1', 'Cozy reading blanket', 'idea', 'chat', null, { price: 45 }),
      item('i2', 'Pottery class for two', 'suggested', 'memory', 'She mentioned wanting to try pottery'),
    ] },
    { uuid: 's-sky', personKey: 'child:sky', label: 'Skylar', done: false, items: [
      item('i3', 'Horse riding lessons', 'suggested', 'person', 'Horses are on her interests'),
      item('i4', 'Horse book', 'bought', 'chat', null, { price: 18 }),
      item('i5', 'Riding helmet', 'suggested', 'athena', 'Goes with the lessons'),
    ] },
    { uuid: 's-tom', personKey: 'child:tom', label: 'Thomas', done: true, items: [
      item('i6', 'Telescope', 'bought', 'chat', 'Said he’s into astronomy', { price: 120 }),
    ] },
  ],
  items: [],
  counts: { people: 3, peopleDone: 1, items: 3, suggested: 3 },
};

const all = [christmas];
const items = () => all.flatMap((c) => [...c.items, ...c.people.flatMap((p: Any) => p.items)]);

function recount(c: Any) {
  const list = [...c.items, ...c.people.flatMap((p: Any) => p.items)].filter((i: Any) => !i.removed);
  c.counts = { people: c.people.length, peopleDone: c.people.filter((p: Any) => p.done).length, items: list.filter((i: Any) => i.status !== 'suggested').length, suggested: list.filter((i: Any) => i.status === 'suggested').length };
}

const visible = (c: Any) => ({ ...c, items: c.items.filter((i: Any) => !i.removed), people: c.people.map((p: Any) => ({ ...p, items: p.items.filter((i: Any) => !i.removed) })) });

export function mockCollectionsRoute(method: string, p: string, body: Any): Any | undefined {
  if (!p.startsWith('/api/v1/dashboard/collections')) return undefined;
  const rest = p.slice('/api/v1/dashboard/collections'.length).split('/').filter(Boolean).map(decodeURIComponent);
  if (method === 'GET' && !rest.length) return { collections: all.map(visible) };
  if (method === 'GET' && rest[0] === 'person') {
    return {
      collections: all.flatMap((c) => c.people.filter((s: Any) => s.personKey === rest[1]).map((s: Any) => ({
        uuid: c.uuid, name: c.name, statuses: c.statuses, fields: c.fields, subjectUuid: s.uuid, done: s.done, items: s.items.filter((i: Any) => !i.removed),
      }))),
    };
  }
  if (method === 'POST' && rest[0] === 'subjects' && rest[2] === 'done') {
    for (const c of all) for (const s of c.people) if (s.uuid === rest[1]) { s.done = body?.done !== false; recount(c); }
    return { success: true };
  }
  if (rest[0] === 'items') {
    const it = items().find((i: Any) => i.uuid === rest[1]);
    if (!it) return { success: false };
    if (method === 'PATCH' && body?.status) it.status = body.status;
    if (method === 'DELETE') it.removed = true;
    if (method === 'POST' && rest[2] === 'restore') it.removed = false;
    all.forEach(recount);
    return { success: true };
  }
  if (method === 'GET') {
    const c = all.find((x) => x.uuid === rest[0]);
    return c ? visible(c) : undefined;
  }
  return undefined;
}
