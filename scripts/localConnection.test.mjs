import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/localConnection.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const local = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) };
globalThis.window = { location: { origin: 'https://cloud.example' } };

test('only explicit HTTPS origins or loopback development URLs are accepted', () => {
  for (const value of ['http://192.168.1.5', 'https://user:pass@host', 'https://host/api', 'https://host?token=x', 'javascript:alert(1)']) {
    assert.throws(() => local.normalizeOrigin(value));
  }
  assert.equal(local.normalizeOrigin('https://home.example/'), 'https://home.example');
  assert.equal(local.normalizeOrigin('http://localhost:8080'), 'http://localhost:8080');
});

test('discovery omits credentials and refuses redirects and unrelated services', async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://home.example/.well-known/athena-local');
    assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error');
    return { ok: true, json: async () => ({ status: 'ok' }) };
  };
  await assert.rejects(local.probeLocal('https://home.example'));
});

test('startup selects local; unreachable local blocks unless fallback was approved', async () => {
  local.savePreference({ origin: 'https://home.example', preferLocal: true, allowCloud: false });
  globalThis.fetch = async url => {
    if (url.startsWith('https://cloud.example')) throw new Error('No marker');
    return { ok: true, json: async () => ({ service: 'athena-local', version: 1 }) };
  };
  await local.initializeConnection('https://cloud-api.example');
  assert.equal(local.connection.base, 'https://home.example');
  assert.equal(local.connection.kind, 'local');
  globalThis.fetch = async () => { throw new Error('Offline'); };
  await local.initializeConnection('https://cloud-api.example');
  assert.equal(local.connection.kind, 'blocked');
  local.savePreference({ origin: 'https://home.example', preferLocal: true, allowCloud: true });
  await local.initializeConnection('https://cloud-api.example');
  assert.equal(local.connection.kind, 'cloud');
  assert.equal(local.connection.base, 'https://cloud-api.example');
});

test('direct local client keeps same-origin API routing and does not probe other servers', async () => {
  globalThis.window.location.origin = 'https://home.example';
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(url);
    return { ok: true, json: async () => ({ service: 'athena-local', version: 1 }) };
  };
  await local.initializeConnection('');
  assert.equal(local.connection.base, 'https://home.example');
  assert.equal(calls.length, 1);
  local.savePreference(null);
});

test('unconfigured or disabled preference never contacts a saved local address', async () => {
  globalThis.window.location.origin = 'https://cloud.example';
  const calls = [];
  globalThis.fetch = async url => { calls.push(url); throw new Error('No local marker'); };
  await local.initializeConnection('https://cloud-api.example');
  local.savePreference({ origin: 'https://home.example', preferLocal: false, allowCloud: false });
  await local.initializeConnection('https://cloud-api.example');
  assert.equal(local.connection.kind, 'cloud');
  assert.ok(calls.every(url => url.startsWith('https://cloud.example/')));
  local.savePreference(null);
});
