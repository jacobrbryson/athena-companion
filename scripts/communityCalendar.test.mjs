import test from 'node:test';
import assert from 'node:assert/strict';
import { communityEvents, communityTerms, townOf } from '../src/components/communityCalendar.ts';
import { whenWords } from '../src/components/eventWords.ts';

const now = new Date(2026, 9, 6, 12); // Tue 2026-10-06, noon, local
const at = (dayOffset, hour, title, extra = {}) => {
  const start = new Date(2026, 9, 6 + dayOffset, hour, 0);
  return { id: title, title, start: start.toISOString(), end: new Date(start.getTime() + 3_600_000).toISOString(), allDay: false, location: null, calendar: null, shared: false, eventType: 'default', ...extra };
};
const home = { name: 'Home', address: '148 RUSHING WATER LN, TROUTMAN, NC, 28166' };
const church = { name: 'Troutman ARP Church', address: null };

test('the town comes off the address, and distinctive place names count too', () => {
  assert.equal(townOf('148 RUSHING WATER LN, TROUTMAN, NC, 28166'), 'Troutman');
  assert.equal(townOf('somewhere with no state'), null);
  assert.deepEqual(communityTerms([home, church]), ['Troutman', 'Troutman ARP Church']);
  assert.deepEqual(communityTerms([{ name: 'School', address: null }, { name: 'Home', address: null }]), [], 'generic names are not searched for');
});

test('soccer practice tomorrow night, Saturday games, and the Saturday-night 5K', () => {
  const found = communityEvents([
    at(1, 18, 'Troutman soccer practice'),
    at(4, 9, 'Troutman Rec game vs Mooresville'),
    at(4, 19, 'Troutman Founders Day 5K'),
    at(2, 10, 'Dentist'),
  ], [home], now);
  assert.deepEqual(found.map(f => [f.what, f.when]), [
    ['Soccer practice', 'tomorrow night'],
    ['Rec game vs Mooresville', 'Saturday'],
    ['Founders Day 5K', 'Saturday night'],
  ]);
});

test('nothing is hard-coded: a different town in your places finds different events', () => {
  const places = [{ name: 'Gran\'s', address: '9 OAK ST, DAVIDSON, NC, 28036' }];
  const events = [at(1, 18, 'Troutman soccer practice'), at(1, 19, 'Davidson farmers market')];
  assert.deepEqual(communityEvents(events, places, now).map(f => f.what), ['Farmers market']);
});

test('it also looks at the location and the calendar a shared event sits on', () => {
  const found = communityEvents([
    at(1, 9, 'Practice', { location: 'Troutman Park, Troutman, NC' }),
    at(2, 9, 'Game', { calendar: 'Troutman Youth Soccer', shared: true }),
  ], [home], now);
  assert.deepEqual(found.map(f => f.what), ['Practice', 'Game']);
});

test('over events, working locations and no places at all find nothing', () => {
  const events = [
    at(0, 8, 'Troutman early bird run'), // ended hours ago
    at(0, 9, 'Troutman', { eventType: 'workingLocation' }),
    { ...at(-1, 0, 'Troutman yesterday'), start: '2026-10-05', end: '2026-10-06', allDay: true },
  ];
  assert.deepEqual(communityEvents(events, [home], now), []);
  assert.deepEqual(communityEvents([at(1, 18, 'Troutman soccer practice')], [], now), []);
});

test('a title that is only the town keeps its name; an all-day event today counts', () => {
  const found = communityEvents([{ ...at(0, 0, 'Troutman'), start: '2026-10-06', end: '2026-10-07', allDay: true }], [home], now);
  assert.equal(found[0].what, 'Troutman');
  assert.equal(found[0].when, 'today');
});

test('evenings say night; mornings and afternoons stay plain', () => {
  assert.equal(whenWords(at(1, 18, 'x'), now), 'tomorrow night');
  assert.equal(whenWords(at(1, 10, 'x'), now), 'tomorrow');
  assert.equal(whenWords(at(0, 18, 'x'), now), 'tonight');
  assert.equal(whenWords(at(4, 14, 'x'), now), 'Saturday');
});

test("a family member's game counts as community even when no town is on it", () => {
  const found = communityEvents([
    at(0, 18, 'Skylar softball game'),
    at(1, 10, 'Ashlynn therapy'),
    at(1, 12, 'Skylar dentist'),
    at(2, 9, 'Standup game plan review with Priya'),
  ], [home], now, ['Skylar', 'Ashlynn']);
  assert.deepEqual(found.map(f => [f.what, f.when, f.who]), [['Softball game', 'tonight', 'Skylar']]);
});

test('an outing for someone who is not family stays out, and pets are the caller\'s to leave out', () => {
  assert.deepEqual(communityEvents([at(0, 18, 'Priya softball game')], [home], now, ['Skylar']), []);
});

test('family outings are found even with no point of interest, but only for family', () => {
  const events = [at(0, 18, 'Skylar softball game'), at(0, 19, 'Troutman soccer practice')];
  assert.deepEqual(communityEvents(events, [], now, ['Skylar']).map(f => f.what), ['Softball game']);
  assert.deepEqual(communityEvents(events, [], now), []);
});

test('an event that names the town is not attributed to a person', () => {
  const [one] = communityEvents([at(0, 18, 'Troutman softball game with Skylar')], [home], now, ['Skylar']);
  assert.equal(one.who, undefined);
});
