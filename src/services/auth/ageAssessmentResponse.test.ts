import assert from 'node:assert/strict';
import { applyCurrentAgeAssessment } from './ageAssessmentResponse';
import { __resetAuthSessionFenceForTests, currentAuthMutationGeneration, retireJsAuthBridge } from './authSessionFence';
import { __setSessionStorageForTests, sessionStore, SESSION_KEY, type AuthSession } from '../sessionPersistence';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
async function main() {
  for (const transition of ['logout', 'same_uid_login', 'other_uid', 'unmount']) {
    __resetAuthSessionFenceForTests();
    const response = deferred<{ ageEligibility: string }>();
    let current = true;
    let applied = 0;
    const pending = applyCurrentAgeAssessment({
      generation: currentAuthMutationGeneration(), isCurrent: () => current,
      request: () => response.promise, apply: async () => { applied++; },
    });
    if (transition === 'other_uid' || transition === 'unmount') current = false;
    else retireJsAuthBridge();
    response.resolve({ ageEligibility: 'eligible' });
    assert.equal(await pending, null, transition);
    assert.equal(applied, 0, transition);
  }
  __resetAuthSessionFenceForTests();
  let applied = 0;
  const result = await applyCurrentAgeAssessment({ generation: 0, isCurrent: () => true,
    request: async () => 'eligible', apply: async () => { applied++; } });
  assert.equal(result, 'eligible'); assert.equal(applied, 1);

  // A generation changes DURING secure storage write; stale data is cleared
  // inside the shared queue, before a newer login can save.
  let stored: string | null = null;
  const entered = deferred<void>(); const release = deferred<void>();
  let first = true;
  __setSessionStorageForTests({ getItem: async () => stored,
    setItem: async (_key, value) => {
      if (first) { first = false; entered.resolve(); await release.promise; }
      stored = value;
    }, deleteItem: async () => { stored = null; } });
  const old = { user: { uid: 'a' }, signedInAt: 1, lastActiveAt: 1 } as AuthSession;
  const fresh = { user: { uid: 'b' }, signedInAt: 2, lastActiveAt: 2 } as AuthSession;
  const pendingSave = sessionStore.saveIfCurrent(old, () => currentAuthMutationGeneration() === 0);
  await entered.promise;
  retireJsAuthBridge();
  const nextSave = sessionStore.save(fresh);
  release.resolve();
  assert.equal(await pendingSave, false);
  await nextSave;
  assert.equal(JSON.parse(stored!).user.uid, 'b');
  let writes = 0;
  __setSessionStorageForTests({ getItem: async () => null, setItem: async () => { writes++; }, deleteItem: async () => {} });
  assert.equal(await sessionStore.saveIfCurrent(old, () => false), false);
  assert.equal(writes, 0);
  void SESSION_KEY;
  console.log('ageAssessmentResponse: session races passed');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
