import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function setup({ stored = null, devices = [], saveError = false, mismatch = false, revokeStatus = null } = {}) {
  const calls = [];
  const native = {
    isAndroidCompanion: () => true,
    androidCall: async (method, payload) => {
      calls.push([method,payload]);
      if (method === 'registration') return stored;
      if (method === 'saveRegistration') { if (saveError) throw new Error('storage failed'); stored = payload; }
      if (method === 'signOut') stored = null;
    },
  };
  const devicesApi = {
    list: async () => devices,
    pairingCode: async () => { calls.push(['code']); return { code:'ABCD-EFGH' }; },
    revoke: async (uuid) => { calls.push(['revoke',uuid]); if (revokeStatus) throw { status:revokeStatus }; },
  };
  const api = { post: async (path, body) => {
    calls.push(['redeem',path,body]);
    return { profile_uuid:mismatch ? 'other' : 'person', device_uuid:'phone',device_token:'opaque' };
  } };
  const code = ts.transpileModule(fs.readFileSync(new URL('../src/native/registration.ts',import.meta.url),'utf8'), {
    compilerOptions:{ module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports:{} };
  vm.runInNewContext(code,{ exports:module.exports, require:(id) => ({
    '../api/companion':{devicesApi}, '../api/client':{api}, './android':native,
    '../localConnection':{connection:{kind:'cloud'}},
  })[id] });
  return { service:module.exports,calls };
}

test('fresh verified account redeems existing pairing protocol and stores registration',async () => {
  const {service,calls} = setup();
  await service.register('person');
  assert.deepEqual(calls.map(([name])=>name),['registration','code','redeem','saveRegistration']);
});
test('StrictMode and duplicate renders share one pairing operation',async () => {
  const {service,calls} = setup();
  const first = service.beginRegistration('person');
  assert.equal(service.beginRegistration('person'),first);
  await first.promise;
  assert.equal(calls.filter(([name])=>name==='code').length,1);
});
test('existing registration is reused; revoked phone is never silently re-paired',async () => {
  const stored={profile_uuid:'person',device_uuid:'phone'};
  const valid = setup({stored,devices:[{uuid:'phone'}]});
  await valid.service.register('person');
  assert.equal(valid.calls.length,1);
  const revoked = setup({stored});
  await assert.rejects(revoked.service.register('person'),/removed/);
  assert.equal(revoked.calls.length,1);
});
test('different account must sign out before changing phone ownership',async () => {
  const {service,calls}=setup({stored:{profile_uuid:'other',device_uuid:'phone'}});
  await assert.rejects(service.register('person'),/different account/);
  assert.equal(calls.length,1);
});
test('secure storage failure or identity mismatch revokes the unusable registration',async () => {
  for (const options of [{saveError:true},{mismatch:true}]) {
    const {service,calls}=setup(options);
    await assert.rejects(service.register('person'));
    assert.deepEqual(calls.at(-1),['revoke','phone']);
  }
});
test('sign out waits for pairing then revokes before clearing native storage',async () => {
  const {service,calls}=setup();
  service.beginRegistration('person');
  await service.unlinkAndroidPhone();
  assert.deepEqual(calls.slice(-2).map(([name])=>name),['revoke','signOut']);
  assert.equal(service.registration,null);
});
test('already removed phone and offline accounts can always clear the local identity',async () => {
  const stored={profile_uuid:'person',device_uuid:'phone'};
  const removed=setup({stored,revokeStatus:404});
  await removed.service.unlinkAndroidPhone();
  assert.equal(removed.calls.at(-1)[0],'signOut');
  const offline=setup({stored,revokeStatus:503});
  await offline.service.unlinkAndroidPhone();
  assert.equal(offline.calls.at(-1)[0],'signOut');
});
