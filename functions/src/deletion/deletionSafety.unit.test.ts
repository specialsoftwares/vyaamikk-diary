import assert from 'node:assert/strict';
import { deletedProfileStub, ownsDeletionLease, walkDeletionPages } from './deletionSafety';
import { claimsForAdmission, decideRestoreAdmission, decideRestoreTraffic, mergeRestoreAuthorityProjection, outsideRestoreAuthorityDatabaseId, parseRestoreAuthoritySnapshot, projectRestoreAuthority, restoreServiceCanReopen, setRestoreAuthorityStoreForTests } from './restoreAuthority';
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
  console.log('deletionSafety: cursor, lease, backoff and minimal-stub tests passed');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
