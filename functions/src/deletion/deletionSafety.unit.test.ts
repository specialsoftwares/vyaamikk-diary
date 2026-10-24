import assert from 'node:assert/strict';
import { deletedProfileStub, ownsDeletionLease, walkDeletionPages } from './deletionSafety';
import { claimsForAdmission, decideRestoreAdmission, decideRestoreTraffic, mergeRestoreAuthorityProjection, outsideRestoreAuthorityDatabaseId, parseRestoreAuthoritySnapshot, projectRestoreAuthority, restoreServiceCanReopen, setRestoreAuthorityStoreForTests } from './restoreAuthority';
import { createMemoryRestoreHoldStore, mintAllowed, nextDisasterRecovery, nextInitialActivation, releaseRestoreHolds } from './restoreControlPlane';
import { erasedBillingUidsFromEnv, excludeErasedBillingUids, privilegedWorkerMayRead, workerHoldFromEnv, workerWritesBusinessData } from './privilegedWorkerGuard';
import { classifyProviderError, initialDeletionJob, canAcquireLease } from './deletionJob';
async function main() {
  const job = { ...initialDeletionJob({ uid: 'a', requestedAt: 0, graceExpiresAt: 0 }), status: 'leased' as const, leaseOwner: 'worker-a', leaseUntil: 100 };
  assert.equal(ownsDeletionLease(job, 1, 'worker-a', 99), true);
  assert.equal(ownsDeletionLease(job, 1, 'worker-a', 100), false);
  assert.equal(ownsDeletionLease({ ...job, leaseOwner: 'worker-b' }, 1, 'worker-a', 50), false);
  assert.equal(ownsDeletionLease({ ...job, generation: 2 }, 1, 'worker-a', 50), false);
  assert.equal(canAcquireLease({ ...job, status: 'ready', nextAttemptAt: 200 }, 150), false);
  assert.deepEqual(Object.keys(deletedProfileStub('a', 1)).sort(), ['uid','status','deletedAt','deletionCompletedAt','retiredUeid','updatedAt'].sort());
  // First forty never leave the query. Persisted continuation reaches row 41.
  const rows = Array.from({ length: 81 }, (_, i) => ({ id: String(i).padStart(3, '0') }));
  let cursor: string | null = null; const seen: string[] = [];
  const run = () => walkDeletionPages({ cursor, pageSize: 40, maxPages: 1,
    list: async (after, limit) => rows.filter(r => !after || r.id > after).slice(0, limit),
    visit: async row => { seen.push(row.id); }, checkpoint: async next => { cursor = next; } });
  await run(); await run(); await run();
  assert.equal(new Set(seen).size, 81); assert.equal(cursor, null);
  const authority = { watermark: 2, erasedUids: ['erased'], withdrawnPurposes: { live: ['crash_diagnostics'] } };
  assert.equal(decideRestoreTraffic({ authority: null, localWatermark: 2, uid: 'live' }), 'deny');
  assert.equal(decideRestoreTraffic({ authority, localWatermark: 1, uid: 'live' }), 'deny');
  assert.equal(decideRestoreTraffic({ authority, localWatermark: null, uid: 'live' }), 'deny');
  assert.equal(decideRestoreTraffic({ authority, localWatermark: 2, uid: 'erased' }), 'deny');
  assert.equal(decideRestoreTraffic({ authority, localWatermark: 2, uid: 'live', purpose: 'crash_diagnostics' }), 'deny');
  assert.equal(decideRestoreTraffic({ authority, localWatermark: 2, uid: 'live' }), 'allow');
  assert.equal(parseRestoreAuthoritySnapshot({ watermark: 2, erasedUids: 'erased', withdrawnPurposes: {} }), null);
  assert.equal(parseRestoreAuthoritySnapshot({ watermark: 2, erasedUids: [], withdrawnPurposes: { live: 'crash_diagnostics' } }), null);
  assert.equal(parseRestoreAuthoritySnapshot({ watermark: 2, withdrawnPurposes: {} }), null);
  assert.equal(outsideRestoreAuthorityDatabaseId('(default)'), null);
  assert.equal(outsideRestoreAuthorityDatabaseId('default'), null);
  assert.equal(outsideRestoreAuthorityDatabaseId('restore-authority'), 'restore-authority');
  const previousAuthority = process.env.RESTORE_AUTHORITY_DATABASE_ID;
  delete process.env.RESTORE_AUTHORITY_DATABASE_ID;
  assert.equal(await projectRestoreAuthority('erased', { erase: true }), 'skipped');
  process.env.RESTORE_AUTHORITY_DATABASE_ID = '(default)';
  await assert.rejects(() => projectRestoreAuthority('erased', { erase: true }), /restore_authority_unprovisioned/);
  process.env.RESTORE_AUTHORITY_DATABASE_ID = 'default';
  await assert.rejects(() => projectRestoreAuthority('erased', { erase: true }), /restore_authority_unprovisioned/);
  if (previousAuthority === undefined) delete process.env.RESTORE_AUTHORITY_DATABASE_ID;
  else process.env.RESTORE_AUTHORITY_DATABASE_ID = previousAuthority;
  let written: unknown = null;
  setRestoreAuthorityStoreForTests({
    read: async () => ({ watermark: 2, erasedUids: 'erased', withdrawnPurposes: {} }),
    write: async (snapshot) => { written = snapshot; },
  });
  await assert.rejects(() => projectRestoreAuthority('erased', { erase: true }), /restore_authority_projection_failed/);
  assert.equal(written, null);
  const stored = { watermark: 4, erasedUids: ['old'], withdrawnPurposes: { old: ['crash_diagnostics'], other: ['crash_diagnostics'] } };
  setRestoreAuthorityStoreForTests({
    read: async () => stored,
    write: async (snapshot) => { Object.assign(stored, snapshot); },
  });
  assert.equal(await projectRestoreAuthority('new-user', { erase: true, withdrawPurposes: ['crash_diagnostics'] }), 'projected');
  assert.deepEqual(stored.erasedUids, ['old', 'new-user']);
  assert.deepEqual(stored.withdrawnPurposes.old, ['crash_diagnostics']);
  assert.deepEqual(stored.withdrawnPurposes.other, ['crash_diagnostics']);
  assert.equal(stored.watermark, 4);
  assert.equal(decideRestoreTraffic({ authority: stored, localWatermark: 4, uid: 'new-user' }), 'deny');
  assert.equal(decideRestoreTraffic({ authority: stored, localWatermark: 4, uid: 'other', purpose: 'crash_diagnostics' }), 'deny');
  const idempotent = mergeRestoreAuthorityProjection(stored, 'new-user', { erase: true, withdrawPurposes: ['crash_diagnostics'] });
  assert.deepEqual(idempotent.erasedUids, ['old', 'new-user']);
  let liveAuthority = { watermark: 4, erasedUids: ['old'], withdrawnPurposes: { old: ['crash_diagnostics'] } as Record<string, string[]> };
  let conflicts = 0;
  setRestoreAuthorityStoreForTests({
    read: async () => structuredClone(liveAuthority),
    write: async () => { throw new Error('unconditional write is not used'); },
    compareAndSet: async (expected, snapshot) => {
      const expectedIds = (expected as { erasedUids: string[] }).erasedUids.join(',');
      const currentIds = liveAuthority.erasedUids.join(',');
      if (expectedIds !== currentIds) return 'conflict';
      if (conflicts === 0 && snapshot.erasedUids.includes('erasure-a')) {
        conflicts += 1;
        liveAuthority = { ...liveAuthority, erasedUids: ['old', 'erasure-b'], withdrawnPurposes: { ...liveAuthority.withdrawnPurposes, 'erasure-b': ['crash_diagnostics'] } };
        return 'conflict';
      }
      liveAuthority = snapshot as typeof liveAuthority;
      return 'stored';
    },
  });
  assert.equal(await projectRestoreAuthority('erasure-a', { erase: true }), 'projected');
  assert.deepEqual(liveAuthority.erasedUids.sort(), ['erasure-a', 'erasure-b', 'old']);
  assert.deepEqual(liveAuthority.withdrawnPurposes['erasure-b'], ['crash_diagnostics']);
  setRestoreAuthorityStoreForTests(null);
  const admitted = { configured: true, authority, closed: false, required: true, reconciled: true, localWatermark: 2, uid: 'live' };
  assert.equal(decideRestoreAdmission(admitted).status, 'admit');
  assert.equal(decideRestoreAdmission(admitted).authorityWatermark, 2);
  assert.equal(decideRestoreAdmission({ ...admitted, uid: 'erased' }).status, 'deny');
  assert.equal(decideRestoreAdmission({ ...admitted, purpose: 'crash_diagnostics' }).status, 'deny');
  assert.equal(decideRestoreAdmission({ ...admitted, required: false }).status, 'admit');
  assert.equal(decideRestoreAdmission({ ...admitted, required: false }).authorityWatermark, 2);
  const prepared = claimsForAdmission({ vydOriginAuthTime: 50 }, decideRestoreAdmission({ ...admitted, required: false }));
  assert.equal(prepared.authorityWatermark, 2);
  assert.equal('authorityWatermark' in { vydOriginAuthTime: 50 }, false);
  assert.equal(decideRestoreAdmission({ ...admitted, required: false, localWatermark: null }).status, 'unavailable');
  assert.equal(decideRestoreAdmission({ ...admitted, configured: false, required: false }).status, 'skip');
  assert.equal(decideRestoreAdmission({ ...admitted, required: false, reconciled: false }).status, 'skip');
  assert.equal(decideRestoreAdmission({ ...admitted, required: false, authority: null }).status, 'unavailable');
  assert.equal(decideRestoreAdmission({ ...admitted, localWatermark: 1 }).status, 'deny');
  assert.equal(decideRestoreAdmission({ ...admitted, closed: true, required: false }).status, 'deny');
  assert.equal(decideRestoreAdmission({ ...admitted, authority: null }).status, 'unavailable');
  assert.equal(decideRestoreAdmission({ ...admitted, reconciled: false }).status, 'unavailable');
  const phoneClaims = claimsForAdmission({ vydOriginAuthTime: 100 }, { status: 'admit', authorityWatermark: 2 });
  assert.equal(phoneClaims.vydOriginAuthTime, 100);
  assert.equal(phoneClaims.authorityWatermark, 2);
  const recoveryClaims = claimsForAdmission({ recoveryDeviceId: 'device-1', recoverySession: true }, { status: 'skip' });
  assert.equal(recoveryClaims.recoveryDeviceId, 'device-1');
  assert.equal(recoveryClaims.recoverySession, true);
  assert.equal('authorityWatermark' in recoveryClaims, false);
  assert.deepEqual(restoreServiceCanReopen({
    localFencePresent: false, localModePresent: false, externalTrafficClosed: true, workersStopped: true,
  }), { open: false, reason: 'restored_primary_missing_restore_control' });
  assert.deepEqual(restoreServiceCanReopen({
    localFencePresent: true, localModePresent: true, externalTrafficClosed: true, workersStopped: false,
  }), { open: false, reason: 'external_hold' });
  assert.equal(classifyProviderError(new Error('restore_authority_unprovisioned')).category, 'permanent');
  assert.equal(classifyProviderError(new Error('restore_authority_projection_failed')).category, 'permanent');
  assert.equal(classifyProviderError(new Error('restore_authority_write_failed')).category, 'transient');
  const restored = createMemoryRestoreHoldStore({
    docs: { fence: null, mode: null },
    holds: { traffic: 'closed', workers: 'stopped' },
  });
  assert.equal((await releaseRestoreHolds(restored, 2)).reason, 'restored_primary_missing_restore_control');
  assert.equal((await restored.snapshot()).holds.traffic, 'closed');
  restored.replaceDocs({
    fence: { closed: true, reconciled: false, watermark: 1 },
    mode: { required: false },
  });
  assert.equal((await releaseRestoreHolds(restored, 2)).reason, 'fence_not_reconciled');
  assert.equal((await restored.snapshot()).holds.workers, 'stopped');
  restored.replaceDocs({
    fence: { closed: false, reconciled: true, watermark: 2 },
    mode: { required: false },
  });
  const workers = await releaseRestoreHolds(restored, 2);
  assert.equal(workers.released, false);
  assert.equal(workers.reason, 'workers_released');
  assert.deepEqual((await restored.snapshot()).holds, { traffic: 'closed', workers: 'running', phase: 'workers_released', revision: 1 });
  restored.replaceDocs({
    fence: { closed: true, reconciled: true, watermark: 2 },
    mode: { required: false },
  });
  const rolled = await releaseRestoreHolds(restored, 2);
  assert.equal(rolled.reason, 'fence_not_reconciled');
  assert.equal((await restored.snapshot()).holds.workers, 'stopped');
  restored.replaceDocs({
    fence: { closed: false, reconciled: true, watermark: 2 },
    mode: { required: false },
  });
  assert.equal((await releaseRestoreHolds(restored, 2)).reason, 'workers_released');
  const traffic = await releaseRestoreHolds(restored, 2);
  assert.equal(traffic.released, true);
  assert.equal((await restored.snapshot()).holds.traffic, 'open');
  assert.equal((await restored.snapshot()).holds.phase, 'traffic_released');
  assert.equal(nextInitialActivation([]), 'confirm_authority');
  assert.equal(mintAllowed('initial', [], true), false);
  assert.equal(mintAllowed('initial', ['confirm_authority', 'write_open_reconciled_fence'], false), true);
  assert.equal(nextInitialActivation(['confirm_authority']).includes('write_closed_fence'), false);
  const recovery = ['keep_holds_closed', 'confirm_authority', 'write_closed_fence'] as const;
  assert.equal(nextDisasterRecovery(recovery), 'rewrite_open_fence');
  assert.equal(mintAllowed('recovery', recovery, true), false);
  assert.equal(mintAllowed('recovery', [...recovery, 'rewrite_open_fence'], false), true);
  assert.equal(nextDisasterRecovery([...recovery, 'rewrite_open_fence', 'issue_admitted_tokens']), 'release_worker_hold');
  const previousHold = process.env.RESTORE_WORKER_HOLD;
  delete process.env.RESTORE_WORKER_HOLD;
  assert.equal(workerHoldFromEnv(), 'running');
  assert.equal(privilegedWorkerMayRead('deletion'), true);
  process.env.RESTORE_WORKER_HOLD = 'stopped';
  assert.equal(privilegedWorkerMayRead('billing'), false);
  assert.equal(privilegedWorkerMayRead('was_not_me'), false);
  if (previousHold === undefined) delete process.env.RESTORE_WORKER_HOLD;
  else process.env.RESTORE_WORKER_HOLD = previousHold;
  assert.deepEqual(excludeErasedBillingUids(['live', 'erased'], erasedBillingUidsFromEnv({ RESTORE_ERASED_UIDS: '["erased"]' } as NodeJS.ProcessEnv)), ['live']);
  assert.equal(workerWritesBusinessData(['wasNotMeTokens', 'newDeviceSecurityEvents']), false);
  assert.equal(workerWritesBusinessData(['entries']), true);
  console.log('deletionSafety: cursor, lease, backoff and minimal-stub tests passed');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
