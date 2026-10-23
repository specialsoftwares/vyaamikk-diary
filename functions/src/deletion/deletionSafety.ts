import type { DeletionJobDoc } from './deletionJob';

export function ownsDeletionLease(job: DeletionJobDoc | undefined, generation: number, owner: string, now: number): boolean {
  return !!job && job.generation === generation && job.status === 'leased' &&
    job.leaseOwner === owner && typeof job.leaseUntil === 'number' && job.leaseUntil > now;
}

/** Contains only the deletion fence, never the old profile/envelope. */
export function deletedProfileStub(uid: string, now: number) {
  return { uid, status: 'deleted', deletedAt: now, deletionCompletedAt: now, retiredUeid: true, updatedAt: now };
}

/** Cursor progresses even when rows remain in the query (e.g. unexpired jobs). */
export async function walkDeletionPages<T extends { id: string }>(ports: {
  cursor: string | null; pageSize: number; maxPages: number;
  list(after: string | null, limit: number): Promise<T[]>;
  visit(row: T): Promise<void>;
  checkpoint(cursor: string | null): Promise<void>;
}) {
  let cursor = ports.cursor;
  for (let page = 0; page < ports.maxPages; page++) {
    const rows = await ports.list(cursor, ports.pageSize);
    for (const row of rows) { await ports.visit(row); cursor = row.id; }
    if (rows.length < ports.pageSize) { await ports.checkpoint(null); return; }
    await ports.checkpoint(cursor);
  }
}
