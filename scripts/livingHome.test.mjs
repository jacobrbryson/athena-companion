import test from 'node:test';
import assert from 'node:assert/strict';
import { freshness, homeUpdates, recoveryChange } from '../src/components/livingHome.ts';

const now = Date.parse('2026-10-17T13:48:00Z');
const ready = data => ({ status: 'ready', checkedAt: new Date(now).toISOString(), data });
const event = { id: 'soccer', title: 'Soccer', start: '2026-10-17T14:30:00Z', end: '2026-10-17T15:30:00Z', allDay: false, location: 'Away field' };
const summary = { calendar: ready({ events: [event] }), recovery: ready([]), jira: ready({ issues: [] }) };

test('recovery compares distinct scored days, including zero, without claiming yesterday', () => {
  const rows = [
    { date: '2026-10-17', state: 'PENDING', recovery_score: null },
    { date: '2026-10-16', state: 'SCORED', recovery_score: 79 },
    { date: '2026-10-16', state: 'SCORED', recovery_score: 78 },
    { date: '2026-10-13', state: 'SCORED', recovery_score: 0 },
  ];
  assert.equal(recoveryChange(rows).delta, 79);
  assert.equal(recoveryChange(rows).previous.date, '2026-10-13');
  assert.equal(recoveryChange(rows.slice(0, 3)), null);
  const updates = homeUpdates({ ...summary, recovery: ready(rows) }, null, now);
  assert.match(updates[0].detail, /compared with 2026-10-13/);
  assert.equal(updates[0].at, '2026-10-16');
});

test('unavailable or revoked sources never contribute old data', () => {
  const stale = { ...summary, recovery: { status: 'consent_required', data: [
    { date: '2026-10-17', state: 'SCORED', recovery_score: 80 },
    { date: '2026-10-16', state: 'SCORED', recovery_score: 70 },
  ] }, jira: { status: 'error', data: { issues: [{ key: 'OLD', updated: '2026-10-17T12:00:00Z' }] } } };
  assert.deepEqual(homeUpdates(stale, null, now), []);
});

test('open Jira updates are not described as completions, invalid and future dates are ignored', () => {
  const result = homeUpdates({ ...summary, jira: ready({ issues: [
    { key: 'ONE', site: 'a', title: 'Repair', status: 'In Progress', updated: '2026-10-17T12:00:00Z' },
    { key: 'TWO', site: 'a', title: 'Later', status: 'Ready', updated: '2026-10-18T12:00:00Z' },
    { key: 'THREE', updated: 'invalid' },
  ] }) }, null, now);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'ONE · In Progress');
  assert.deepEqual(homeUpdates(summary, null, now), []);
});

test('dream updates require a completed successful or partial record', () => {
  const dreams = [
    { uuid: 'running', status: 'running', finishedAt: null },
    { uuid: 'failed', status: 'failed', finishedAt: '2026-10-17T13:00:00Z' },
    { uuid: 'partial', status: 'partial', date: '2026-10-17', finishedAt: '2026-10-17T10:00:00Z' },
  ];
  const result = homeUpdates(null, dreams, now);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'A dream, partly completed');
});

test('freshness distinguishes missing and future timestamps from fresh data', () => {
  assert.equal(freshness(null, now), 'Time unavailable');
  assert.equal(freshness('garbage', now), 'Time unavailable');
  assert.equal(freshness('2026-10-18T00:00:00Z', now), 'Time unavailable');
  assert.equal(freshness('2026-10-17T13:40:00Z', now), '8m ago');
  assert.equal(freshness('2026-10-14T13:40:00Z', now), '3d ago');
});
