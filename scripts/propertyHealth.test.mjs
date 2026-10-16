import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaHealth, propertyHealth } from '../src/components/propertyHealth.ts';
const area = { name: 'House', x: 50, y: 50, projects: ['p'], concerns: [] };
const project = { uuid: 'p', status: 'active', effectiveStatus: 'active', hardDeadline: null };
const snap = { projects: [project], concerns: [], links: [], charters: [] };
test('unlinked or deleted records leave an area unassessed', () => {
  assert.equal(areaHealth({ ...area, projects: [] }, snap).label, 'Not assessed');
  assert.equal(areaHealth(area, { ...snap, projects: [] }).label, 'Not assessed');
});
test('linked concerns and blocked projects determine the worst condition', () => {
  assert.equal(areaHealth(area, snap).label, 'On track');
  const concern = { uuid: 'c', projects: ['p'], status: 'open', severity: 4 };
  assert.equal(areaHealth(area, { ...snap, concerns: [concern] }).label, 'At risk');
  assert.equal(areaHealth(area, { ...snap, concerns: [{ ...concern, severity: 2 }] }).label, 'Needs attention');
  assert.equal(areaHealth(area, { ...snap, concerns: [{ ...concern, status: 'resolved' }] }).label, 'On track');
  assert.equal(areaHealth(area, { ...snap, projects: [{ ...project, effectiveStatus: 'blocked' }] }).label, 'Needs attention');
});
test('resolved concerns count as an assessment and completed overdue work does not penalize it', () => {
  assert.equal(areaHealth({ ...area, projects: [], concerns: ['c'] }, { ...snap, concerns: [{ uuid: 'c', projects: [], severity: 5, status: 'resolved' }] }).label, 'On track');
  assert.equal(areaHealth(area, { ...snap, projects: [{ ...project, status: 'done', hardDeadline: '2000-01-01' }] }).label, 'On track');
  assert.equal(areaHealth(area, { ...snap, projects: [{ ...project, hardDeadline: '2000-01-01' }] }).label, 'Needs attention');
});
test('open property issues mark their area and the whole property', () => {
  const issue = { location: 'house', severity: 'high', status: 'open' };
  assert.equal(areaHealth(area, snap, [issue]).label, 'At risk');
  assert.equal(areaHealth({ ...area, projects: [] }, snap, [{ ...issue, severity: 'low' }]).label, 'Needs attention');
  assert.equal(areaHealth(area, snap, [{ ...issue, status: 'resolved' }]).label, 'On track');
  assert.equal(areaHealth(area, snap, [{ ...issue, location: 'Pool' }]).label, 'On track');
});
test('overall health follows active issues only, worst first', () => {
  const issue = { location: 'Heating & cooling', severity: 'emergency', status: 'open' };
  assert.deepEqual(propertyHealth([]), { label: 'Good', tone: 'good', note: 'no active issues' });
  assert.deepEqual(propertyHealth([{ ...issue, status: 'resolved' }]).label, 'Good');
  assert.deepEqual(propertyHealth([issue]), { label: 'Emergency', tone: 'alert', note: 'Heating & cooling · emergency' });
  assert.equal(propertyHealth([{ ...issue, severity: 'high' }]).label, 'At risk');
  assert.equal(propertyHealth([{ ...issue, severity: 'low' }]).label, 'Needs attention');
  assert.deepEqual(propertyHealth([{ ...issue, severity: 'low', location: 'Pool' }, issue]).note, '2 active issues · worst: Heating & cooling');
});
