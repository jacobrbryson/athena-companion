import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { localUnityAssets, REQUIRED_UNITY_FILES } from '../localUnityAssets.js';

test('local Unity is served with byte ranges and no remote or SPA fallback', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'athena-unity-test-'));
  let server;
  try {
    await fs.mkdir(path.join(dir, 'Build'));
    for (const name of REQUIRED_UNITY_FILES) await fs.writeFile(path.join(dir, 'Build', name), '0123456789');
    const app = express();
    app.use('/unity', localUnityAssets(dir));
    app.use((_req, res) => res.send('SPA'));
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const wasm = await fetch(`${base}/unity/Build/unity.wasm`, { headers: { Range: 'bytes=2-5' } });
    assert.equal(wasm.status, 206);
    assert.equal(wasm.headers.get('content-type'), 'application/wasm');
    assert.equal(await wasm.text(), '2345');
    const missing = await fetch(`${base}/unity/missing.js`);
    assert.equal(missing.status, 404);
    assert.match(await missing.text(), /Local Unity asset not found/);
    await fs.unlink(path.join(dir, 'Build', 'unity.data'));
    assert.throws(() => localUnityAssets(dir));
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
  }
});
