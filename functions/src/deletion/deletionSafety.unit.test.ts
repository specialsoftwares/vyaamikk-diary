import assert from 'node:assert/strict';
import { deletedProfileStub, ownsDeletionLease, walkDeletionPages } from './deletionSafety';
import { decideRestoreTraffic } from './restoreAuthority';
import { initialDeletionJob, canAcquireLease } from './deletionJob';
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
  console.log('deletionSafety: cursor, lease, backoff and minimal-stub tests passed');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
