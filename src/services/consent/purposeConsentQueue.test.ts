import assert from 'node:assert/strict';
import { createPurposeConsentQueue, type PurposeQueueState, type PurposeMutation } from './purposeConsentQueue';
import { purposeTransition, type PurposeState } from '../../../functions/src/privacy/processingPurposeState';
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => resolve = r); return { promise, resolve }; }
async function main() {
  let remote: PurposeState = { revision: 0, decision: null, receivedAt: null };
  const events = new Set<string>(); const disk = new Map<string, PurposeQueueState>();
  let generation = 0; let enabled = false; let networkFail = false; let storageFail = false; let operation = 0;
  let hold: ReturnType<typeof deferred<void>> | null = null; let entered = deferred<void>();
  const sent: PurposeMutation[] = [];
  const ports = {
    load: async (uid: string) => disk.get(uid) ?? null,
    save: async (state: PurposeQueueState) => { if (storageFail) throw new Error('disk'); disk.set(state.uid, structuredClone(state)); },
    generation: () => generation, operationId: () => `operation_${++operation}`,
    applyLocal: async (next: boolean) => { enabled = next; },
    send: async (input: PurposeMutation | { uid: string; purpose: 'crash_diagnostics'; action: 'read' }) => {
      if (networkFail) throw new Error('offline');
      if ('action' in input) return { ok: true as const, ...remote };
      sent.push(input);
      if (input.decision === 'grant' && hold) { entered.resolve(); await hold.promise; }
      const transition = purposeTransition(remote, { ...input, alreadyReceived: events.has(input.operationId) }, 10);
      if (transition.apply) { events.add(input.operationId); remote = transition.state; }
      return { ok: true as const, ...remote, conflict: transition.conflict };
    },
  };
  let queue = createPurposeConsentQueue(ports); queue.bind('a');
  await queue.choose('a', true); assert.equal(enabled, true); assert.equal(remote.revision, 1);
  // Withhold a grant response, then persist/send withdrawal without waiting for it.
  await queue.choose('a', false);
  hold = deferred<void>(); entered = deferred<void>();
  const grant = queue.choose('a', true); await entered.promise;
  const withdraw = queue.choose('a', false); assert.equal(enabled, false);
  await withdraw; assert.equal(disk.get('a')?.localGrant, false);
  assert.equal(remote.decision, 'withdraw');
  hold.resolve(); await grant; hold = null;
  assert.equal(remote.decision, 'withdraw'); assert.equal(enabled, false);
  // Offline withdrawal survives process death and later retries under same owner.
  networkFail = true; await queue.choose('a', false);
  assert.equal(queue.state('a')?.sync, 'pending');
  queue = createPurposeConsentQueue(ports); queue.bind('a'); networkFail = false;
  await queue.reconcile('a'); assert.equal(queue.state('a')?.sync, 'synced'); assert.equal(enabled, false);
  // A storage failure cannot turn collection on.
  const beforeFailedGrant = sent.length;
  storageFail = true; await queue.choose('a', true); assert.equal(enabled, false);
  assert.equal(sent.length, beforeFailedGrant, 'undurable grant must never reach the server');
  storageFail = false;
  // A same-uid new generation cannot apply an older in-flight response.
  hold = deferred<void>(); entered = deferred<void>();
  const stale = queue.choose('a', true); await entered.promise;
  generation++; queue.bind(null); queue.bind('a');
  hold.resolve(); await stale; hold = null; assert.equal(enabled, false);
  // Accepted operation replay returns current state, never the old grant.
  const oldGrant = sent.find(x => x.decision === 'grant')!;
  remote = { decision: 'withdraw', revision: 99, receivedAt: 99 };
  const replay = purposeTransition(remote, { ...oldGrant, alreadyReceived: true }, 100);
  assert.equal(replay.state.decision, 'withdraw'); assert.equal(replay.apply, false);
  const conflict = purposeTransition(remote, { decision: 'grant', expectedRevision: 98, alreadyReceived: false }, 100);
  assert.equal(conflict.conflict, true); assert.equal(conflict.state.decision, 'withdraw');
  // Two reconnect reads can finish backwards. The old read must not restore grant.
  const staleRead = deferred<{ ok: true; revision: number; decision: 'grant'; receivedAt: number }>();
  let reads = 0;
  const ordered = createPurposeConsentQueue({ ...ports,
    load: async uid => ({ uid, revision: 1, localGrant: true, hasChoice: true, pending: null, sync: 'synced' }),
    send: async () => ++reads === 1 ? staleRead.promise : { ok: true, revision: 2, decision: 'withdraw', receivedAt: 20 },
  });
  ordered.bind('a');
  const oldRead = ordered.reconcile('a');
  while (reads === 0) await new Promise(resolve => setTimeout(resolve, 0));
  await ordered.reconcile('a');
  staleRead.resolve({ ok: true, revision: 1, decision: 'grant', receivedAt: 10 });
  await oldRead;
  assert.equal(enabled, false);
  assert.equal(ordered.state('a')?.revision, 2);
  let remoteListener: ((remote: { ok: true; revision: number; decision: 'withdraw'; receivedAt: number }) => void) | null = null;
  let watchedRemote: PurposeState = { revision: 0, decision: null, receivedAt: null };
  const watched = createPurposeConsentQueue({
    ...ports,
    send: async (input) => {
      if ('action' in input) return { ok: true as const, ...watchedRemote };
      const transition = purposeTransition(watchedRemote, { ...input, alreadyReceived: false }, 10);
      if (transition.apply) watchedRemote = transition.state;
      return { ok: true as const, ...watchedRemote, conflict: transition.conflict };
    },
    observeRemote: (_uid, onRemote) => {
      remoteListener = onRemote as typeof remoteListener;
      return () => { remoteListener = null; };
    },
  });
  watched.bind('watched');
  await watched.choose('watched', true);
  assert.equal(enabled, true);
  remoteListener?.({ ok: true, revision: 8, decision: 'withdraw', receivedAt: 8 });
  for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(enabled, false, 'another device withdrawal stops this device');
  const staleWithdraw = remoteListener;
  watchedRemote = { revision: 8, decision: 'withdraw', receivedAt: 8 };
  generation += 1;
  await watched.choose('watched', true);
  staleWithdraw?.({ ok: true, revision: 9, decision: 'withdraw', receivedAt: 9 });
  for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(enabled, true, 'a withdrawal from the previous generation does not apply');
  console.log('purposeConsentQueue: ordering, offline, storage, replay and session tests passed');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
