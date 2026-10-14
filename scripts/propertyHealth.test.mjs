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
test('overall health preserves missing assessments and prioritizes risk', () => {
  const property = { areas: [area, { ...area, projects: [] }] };
  assert.equal(propertyHealth(property, snap), 'Not assessed');
  assert.equal(propertyHealth(property, { ...snap, concerns: [{ uuid: 'c', projects: ['p'], severity: 5, status: 'open' }] }), 'At risk');
});
