import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFamilyRoster, birthdayIn, birthdayFromIso, whenWords, eventWhat } from '../src/components/familyRoster.ts';

const now = new Date(2026, 9, 6, 12); // 2026-10-06 local
const daysAgo = n => new Date(now.getTime() - n * 86_400_000).toISOString();
const fact = (key, value, age = 2) => ({ uuid: key, category: 'person', key, value, source: 'chat', updated_at: daysAgo(age) });
const sickReport = (personName, extra = {}) => ({ uuid: `s-${personName}`, personName, symptom: 'fever', severity: 'mild', daysActive: 2, notes: null, ...extra });
const event = (title, inDays) => ({ id: title, title, start: new Date(now.getTime() + inDays * 86_400_000).toISOString(), end: '', allDay: false, location: null, calendar: null, shared: false });
const build = (facts, sick = [], events = [], extra = {}) => buildFamilyRoster({ facts, sick, events, now, ...extra });
const child = (name, birthday, extra = {}) => ({ uuid: `c-${name}`, name, birthday, grade: null, ...extra });
const link = (factUuid, birthday, photoUrl = null) => ({ factUuid, contactId: '111', name: 'x', status: 'ok', card: { contactId: '111', name: 'x', birthday, phone: null, email: null, photoUrl } });

test('birthdays parse the formats people actually write', () => {
  assert.equal(birthdayIn('Thomas, birthday October 10', now), 4);
  assert.equal(birthdayIn('born 10/6/2015', now), 0);
  assert.equal(birthdayIn('bday: 12th of Oct', now), 6);
  assert.equal(birthdayIn('likes soccer, October 10', now), null, 'a date alone is not a birthday');
  assert.equal(birthdayIn('birthday October 5', now), 364, 'already passed rolls to next year');
});

test('a sick report beats every other signal and is matched by name', () => {
  const [row] = build([fact('son', 'Thomas, birthday October 7')], [sickReport('Thomas')]);
  assert.equal(row.signal.kind, 'sick');
  assert.equal(row.signal.healthUuid, 's-Thomas');
});

test('someone sick with no memory still gets a row', () => {
  const rows = build([fact('dog', 'Biscuit the beagle, loves walks')], [sickReport('Maya')]);
  assert.equal(rows[0].name, 'Maya');
  assert.equal(rows[0].signal.kind, 'sick');
  assert.equal(rows.length, 2);
});

test('ranking: imminent birthday, calendar, stale, then sparse, then fine', () => {
  const rows = build(
    [fact('fine', 'Lives nearby and loves cooking, my cousin, birthday July 4'), fact('step mom', 'Linda, lives in Ohio', 30), fact('sister', 'Anna', 1), fact('brother', 'Sam, plays guitar a lot', 1), fact('daughter', 'Maya, birthday October 8')],
    [],
    [event('Dentist for Sam', 2)],
  );
  assert.deepEqual(rows.map(r => r.signal.kind), ['birthday', 'calendar', 'stale', 'sparse', 'ok']);
  assert.match(rows[2].signal.label, /weeks/);
});

test('a distant birthday ranks below stale and a relationship word never matches the calendar', () => {
  const rows = build([fact('son', 'Eli, birthday October 18', 1), fact('mom', 'Joan, in Florida', 40)], [], [event('Son of a gun film night', 1)]);
  assert.equal(rows.find(r => r.name === 'Eli').signal.kind, 'birthday');
  assert.equal(rows[0].name, 'Joan', 'stale outranks a 12-day birthday');
});

test('nobody remembered means no rows, for the caller to backfill', () => {
  assert.deepEqual(build([]), []);
});

test('names read properly: apostrophes and keys that only label a name', () => {
  const rows = build([fact("dog's name", 'Biscuit', 1)]);
  assert.equal(rows[0].name, 'Biscuit');
  assert.equal(rows[0].signal.kind, 'sparse');
  assert.equal(build([fact("step mom's place", 'Linda in Ohio, calls Sundays', 1)])[0].name, "Step Mom's Place");
});

test('iso birthdays: full dates, Google year-less dates, and junk', () => {
  assert.equal(birthdayFromIso('2016-10-08', now), 2);
  assert.equal(birthdayFromIso('--10-06', now), 0);
  assert.equal(birthdayFromIso(null, now), null);
  assert.equal(birthdayFromIso('October 8', now), null);
});

test('a child with no memory still gets a row, with their birthday', () => {
  const rows = build([], [], [], { children: [child('Maya', '2016-10-08', { grade: '3' })] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Maya');
  assert.equal(rows[0].signal.kind, 'birthday');
  assert.match(rows[0].signal.label, /in 2 days/);
});

test('a child and a memory of the same person are one row, not two', () => {
  const rows = build([fact('son', 'Thomas, plays soccer on Saturdays', 1)], [], [], { children: [child('Thomas', '2015-10-09')] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].signal.kind, 'birthday', 'the profile birthday reaches the memory row');
});

test('a linked Google Contact supplies the birthday and photo', () => {
  const rows = build([fact('step mom', 'Linda, lives in Ohio and calls Sundays', 1)], [], [], { links: [link('step mom', '--10-07', 'https://x/p.jpg')] });
  assert.equal(rows[0].signal.kind, 'birthday');
  assert.equal(rows[0].photoUrl, 'https://x/p.jpg');
});

test('no birthday anywhere prompts for it, except for pets', () => {
  const rows = build([fact('brother', 'Sam, plays guitar a lot', 1), { ...fact('dog', 'Biscuit the golden retriever', 1), category: 'pet' }], [], [], { children: [child('Eli', null)] });
  const by = n => rows.find(r => r.name === n);
  assert.equal(by('Sam').signal.label, 'No birthday on file');
  assert.equal(by('Eli').signal.label, 'No birthday on file');
  assert.equal(by('Dog').signal.kind, 'ok');
});

test('a child can be unwell and on the calendar by first name', () => {
  const rows = build([], [sickReport('Maya')], [event('Maya dentist', 1)], { children: [child('Maya', null)] });
  assert.equal(rows.length, 1, 'the sick report is claimed by the child row');
  assert.equal(rows[0].signal.kind, 'sick');
});

test('a relationship key is named by the person in the value, with the relation as a tag', () => {
  const [row] = build([fact('spouse', 'Ashlynn therapy on Tuesdays', 1)]);
  assert.equal(row.name, 'Ashlynn');
  assert.equal(row.relation, 'Spouse');
  assert.equal(row.detail, 'therapy on Tuesdays');
  const [plain] = build([fact('spouse', 'works nights at the hospital', 1)]);
  assert.equal(plain.name, 'Spouse', 'no name in the value, so the key stands');
});

test("the owner's own name is not someone in their corner", () => {
  assert.deepEqual(build([fact('Name', 'Ross / Nathan'), fact('my name', 'Ross')]), []);
});

test('an event goes to the named person, not also to the group row that mentions them', () => {
  const rows = build(
    [fact('Children', 'Skylar softball game on weekends', 1), fact('Skylar', 'Plays softball and loves the outfield', 1)],
    [], [event('Skylar softball game', 2)],
  );
  const withEvent = rows.filter(r => r.signal.kind === 'calendar');
  assert.equal(withEvent.length, 1);
  assert.equal(withEvent[0].name, 'Skylar');
});

test('a group row that only repeats a named person is dropped, but one that names no one stays', () => {
  const dup = build([fact('Children', 'Skylar ortho', 1), fact('Skylar', 'Plays softball and loves the outfield', 1)]);
  assert.deepEqual(dup.map(r => r.name), ['Skylar']);
  const alone = build([fact('Children', 'two girls and a boy, all at Riverside', 1), fact('Skylar', 'Plays softball and loves the outfield', 1)]);
  assert.deepEqual(alone.map(r => r.name).sort(), ['Children', 'Skylar']);
});

test('every row can carry how they are related: key, pet, child profile, or "my daughter" in the value', () => {
  const rows = build(
    [fact('spouse', 'Ashlynn therapy on Tuesdays', 1), { ...fact('dog', 'Biscuit the golden retriever', 1), category: 'pet' },
      fact('Wynter', 'Wynter is my daughter and loves art', 1), fact('Thomas', 'Thomas, son, plays soccer a lot', 1)],
    [], [], { children: [child('Eli', '2018-03-04')] },
  );
  const rel = n => rows.find(r => r.name === n)?.relation;
  assert.equal(rel('Ashlynn'), 'Spouse');
  assert.equal(rel('Dog'), 'Pet');
  assert.equal(rel('Wynter'), 'Daughter');
  assert.equal(rel('Thomas'), 'Son');
  assert.equal(rel('Eli'), 'Child');
});

test('a relation is never inferred from someone else\'s mention, and the tag drops when it just repeats the name', () => {
  const [row] = build([fact('Linda', 'Linda lives near her son and calls on Sundays', 1)]);
  assert.equal(row.relation, undefined);
  assert.equal(row.signal.label, 'How are they related to you?');
  assert.match(row.signal.ask, /related to me/);
  const [bare] = build([fact('spouse', 'works nights at the hospital, birthday July 4', 1)]);
  assert.equal(bare.name, 'Spouse');
  assert.equal(bare.relation, undefined);
  assert.notEqual(bare.signal.label, 'How are they related to you?', 'the key already says how');
});

const at = (dayOffset, hour, extra = {}) => ({ id: 'e', title: 'x', start: new Date(2026, 9, 6 + dayOffset, hour, 0).toISOString(), end: '', allDay: false, location: null, calendar: null, shared: false, ...extra });

test('when an event is, in the words a person would use', () => {
  assert.equal(whenWords(at(0, 18), now), 'tonight');
  assert.equal(whenWords(at(0, 14), now), 'this afternoon');
  assert.equal(whenWords(at(0, 9), now), 'this morning');
  assert.equal(whenWords(at(1, 10), now), 'tomorrow');
  assert.equal(whenWords(at(3, 10), now), 'Friday');
  assert.equal(whenWords({ ...at(0, 0), start: '2026-10-06', allDay: true }, now), 'today');
});

test('the event says what, not who: the name comes off the title', () => {
  assert.equal(eventWhat('Ashlynn therapy', ['ashlynn', 'spouse']), 'Therapy');
  assert.equal(eventWhat("Skylar's softball game", ['skylar']), 'Softball game');
  assert.equal(eventWhat('Skylar', ['skylar']), 'Skylar', 'a title that is only the name is kept');
});

test('the calendar line reads like a person would say it', () => {
  const rows = build(
    [fact('spouse', 'Ashlynn, therapy Tuesdays and Thursdays', 1), fact('Skylar', 'Plays softball and loves the outfield', 1)],
    [], [at(1, 10, { title: 'Ashlynn therapy' }), at(0, 18, { title: 'Skylar softball game' })],
  );
  assert.equal(rows.find(r => r.name === 'Ashlynn').signal.label, 'Therapy tomorrow');
  assert.equal(rows.find(r => r.name === 'Skylar').signal.label, 'Softball game tonight');
});

test('one pet remembered twice is one row, and a name does not swallow its description', () => {
  const rows = build([
    { ...fact('Dexter', 'Loves walks and fetch, afraid of thunder', 1), category: 'pet' },
    { ...fact("dog's name", 'Dexter (4-year-old boy German Shepherd-Husky mix)', 1), category: 'pet' },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Dexter');
  assert.equal(rows[0].relation, 'Pet');
});

test("the family surname doesn't hand the kids' games to mom and dad", () => {
  const rows = build(
    [fact('mother', 'Cindy Bryson, lives in Troutman, birthday May 2'), fact('father', 'Tom Bryson, retired engineer, birthday June 9')],
    [sickReport('Thomas Bryson')],
    [event('Bryson U10 Soccer: Troutman Black vs. WISA Gold', 1), event('Cindy hair appointment', 2)],
    { children: [child('Thomas Bryson', '2016-03-01')] },
  );
  const by = name => rows.find(r => r.name === name);
  assert.equal(by('Cindy Bryson').signal.kind, 'calendar');
  assert.match(by('Cindy Bryson').signal.label, /^Hair appointment/);
  assert.notEqual(by('Tom Bryson').signal.kind, 'calendar');
  assert.equal(by('Thomas Bryson').signal.kind, 'sick', "Thomas's report is his, not his parents'");
});
