import test from 'node:test';
import assert from 'node:assert/strict';
import { workStatus, untilLabel } from '../src/components/workStatus.ts';

const TZ = 'America/New_York';
// 2026-10-06, EDT (UTC-4): 7:00 am is 11:00Z, 4:00 pm is 20:00Z.
const at = (h, m = 0) => `2026-10-06T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`;
const ms = iso => Date.parse(iso);
const home = { id: 'wl', title: 'Home', start: at(11), end: at(20), allDay: false, eventType: 'workingLocation', workingLocation: 'Home', location: null, calendar: null, shared: false };
const meeting = (title, from, to, extra = {}) => ({ id: title, title, start: from, end: to, allDay: false, eventType: 'default', attendees: 3, location: null, calendar: null, shared: false, ...extra });

test('no banner without a working location, before it starts, or after it ends', () => {
  const m = [meeting('Standup', at(13), at(14))];
  assert.equal(workStatus(m, [], ms(at(15)), TZ), null);
  assert.equal(workStatus(m, undefined, ms(at(15)), TZ), null);
  assert.equal(workStatus(m, [home], ms(at(10, 59)), TZ), null);
  assert.equal(workStatus(m, [home], ms(at(20)), TZ), null);
  assert.ok(workStatus(m, [home], ms(at(11)), TZ));
});

test('free time before the next meeting, with how long until it', () => {
  const s = workStatus([meeting('Design review', at(15), at(16))], [home], ms(at(14, 15)), TZ);
  assert.equal(s.where, 'Home');
  assert.equal(s.until.toISOString(), `2026-10-06T20:00:00.000Z`);
  assert.equal(s.moment.kind, 'free');
  assert.equal(s.moment.next.title, 'Design review');
  assert.equal(s.moment.inMs, 45 * 60000);
});

test('in a meeting reports when it ends and what follows', () => {
  const s = workStatus([meeting('A', at(14), at(15)), meeting('B', at(17), at(18))], [home], ms(at(14, 40)), TZ);
  assert.equal(s.moment.kind, 'meeting');
  assert.equal(s.moment.event.title, 'A');
  assert.equal(s.moment.endsInMs, 20 * 60000);
  assert.equal(s.moment.then.title, 'B');
});

test('a meeting after the workday ends is not the next meeting', () => {
  const s = workStatus([meeting('Dinner', at(22), at(23))], [home], ms(at(18)), TZ);
  assert.equal(s.moment.kind, 'clear');
});

test('places, focus time and all-day markers are not meetings', () => {
  const noise = [
    { ...meeting('Focus', at(15), at(16)), eventType: 'focusTime' },
    { ...meeting('Holiday elsewhere', '2026-10-06', '2026-10-07'), allDay: true },
  ];
  assert.equal(workStatus(noise, [home], ms(at(14)), TZ).moment.kind, 'clear');
});

test('out of office hides the banner even with a location in place', () => {
  const ooo = { ...meeting('Out of office', at(11), at(20)), eventType: 'outOfOffice' };
  assert.equal(workStatus([ooo], [home], ms(at(14)), TZ), null);
  const allDayOoo = { ...meeting('PTO', '2026-10-06', '2026-10-07'), allDay: true, eventType: 'outOfOffice' };
  assert.equal(workStatus([allDayOoo], [home], ms(at(14)), TZ), null);
});

test('an all-day location is working all day, bounded by the day for meetings', () => {
  const day = { ...home, start: '2026-10-06', end: '2026-10-07', allDay: true };
  const s = workStatus([meeting('Tomorrow', '2026-10-07T15:00:00Z', '2026-10-07T16:00:00Z'), meeting('Later', at(18), at(19))], [day], ms(at(14)), TZ);
  assert.equal(s.until, null);
  assert.equal(s.moment.next.title, 'Later');
  assert.equal(workStatus([], [day], ms('2026-10-07T14:00:00Z'), TZ), null);
});

test('split days follow whichever location is current', () => {
  const office = { ...home, id: 'wl2', start: at(16), end: at(20), workingLocation: 'Office' };
  const morning = { ...home, end: at(16) };
  assert.equal(workStatus([], [morning, office], ms(at(13)), TZ).where, 'Home');
  assert.equal(workStatus([], [morning, office], ms(at(17)), TZ).where, 'Office');
});

test('untilLabel reads like speech', () => {
  assert.equal(untilLabel(45 * 60000), '45 min');
  assert.equal(untilLabel(60 * 60000), '1 h');
  assert.equal(untilLabel(130 * 60000), '2 h 10 min');
  assert.equal(untilLabel(1000), '1 min');
});

import { jiraGlance } from '../src/components/workStatus.ts';
const issue = (key, due = null, status = 'In Progress') => ({ key, title: key, status, project: 'P', updated: '2026-10-06T12:00:00Z', due, site: 's', url: 'https://x' });
// 2026-10-06 14:00Z is 10:00 in New York, still the 6th.
const NOON = Date.parse('2026-10-06T14:00:00Z');

test('jira glance counts, names the latest, and reads due dates as the person’s own day', () => {
  assert.equal(jiraGlance(null, NOON, TZ), null);
  const g = jiraGlance({ issues: [issue('A-1'), issue('A-2', '2026-10-06'), issue('A-3', '2026-10-05'), issue('A-4', '2026-10-09')] }, NOON, TZ);
  assert.deepEqual({ count: g.count, atLeast: g.atLeast, latest: g.latest.key, overdue: g.overdue, dueToday: g.dueToday }, { count: 4, atLeast: false, latest: 'A-1', overdue: 1, dueToday: 1 });
  // 02:00Z on the 7th is still the evening of the 6th in New York.
  assert.equal(jiraGlance({ issues: [issue('B-1', '2026-10-06')] }, Date.parse('2026-10-07T02:00:00Z'), TZ).dueToday, 1);
});

test('jira glance is honest when the read was capped, and when there is nothing', () => {
  const ten = Array.from({ length: 10 }, (_, i) => issue(`C-${i}`));
  assert.equal(jiraGlance({ issues: ten }, NOON, TZ).atLeast, true);
  assert.equal(jiraGlance({ issues: ten.slice(0, 3), partial: true }, NOON, TZ).atLeast, true);
  const none = jiraGlance({ issues: [] }, NOON, TZ);
  assert.deepEqual({ c: none.count, l: none.latest, o: none.overdue }, { c: 0, l: null, o: 0 });
});

import { isInProgress, safeHttpsUrl } from '../src/components/workStatus.ts';

test('a count is only a floor when Jira says there is more', () => {
  const twelve = Array.from({ length: 12 }, (_, i) => issue(`D-${i}`));
  assert.equal(jiraGlance({ issues: twelve, capped: false }, NOON, TZ).atLeast, false);
  assert.equal(jiraGlance({ issues: twelve.slice(0, 3), capped: true }, NOON, TZ).atLeast, true);
  assert.equal(jiraGlance({ issues: twelve }, NOON, TZ).atLeast, true); // an older server never said: assume capped at its old limit
});

test('in progress follows Jira’s own category, then the status name', () => {
  const cat = (status, statusCategory) => ({ ...issue('E-1', null, status), statusCategory });
  assert.equal(isInProgress(cat('Code Review', 'indeterminate')), true);
  assert.equal(isInProgress(cat('In Progress', 'new')), false); // the category wins over a misleading name
  assert.equal(isInProgress(cat('To Do', 'new')), false);
  assert.equal(isInProgress(cat('In Progress', undefined)), true);
  assert.equal(isInProgress(cat('Open', undefined)), false);
  const g = jiraGlance({ issues: [cat('Open', 'new'), { ...cat('In Review', 'indeterminate'), key: 'E-2' }, { ...cat('In Progress', 'indeterminate'), key: 'E-3' }] }, NOON, TZ);
  assert.deepEqual(g.inProgress.map(i => i.key), ['E-2', 'E-3']);
});

test('only plain https links are followed', () => {
  assert.equal(safeHttpsUrl('https://team.atlassian.net/browse/A-1'), 'https://team.atlassian.net/browse/A-1');
  assert.equal(safeHttpsUrl('http://team.atlassian.net/browse/A-1'), undefined);
  assert.equal(safeHttpsUrl('https://user:pw@team.atlassian.net/'), undefined);
  assert.equal(safeHttpsUrl('javascript:alert(1)'), undefined);
  assert.equal(safeHttpsUrl(null), undefined);
});
