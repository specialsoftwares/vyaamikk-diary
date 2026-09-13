/**
 * Minimal transactional document store used by the billing engine.
 *
 * Production wraps firebase-admin (see firestoreBillingStore.ts). Tests use
 * MemoryBillingStore, which is deliberately FIRESTORE-STRICT so the fake is
 * never more permissive than production:
 *
 * - Reads must precede writes: once any write is staged in a transaction,
 *   a later get() throws (mirrors the Admin SDK error).
 * - All create() collisions are validated BEFORE any staged mutation is
 *   applied; a failed transaction leaves ZERO writes behind.
 * - Two pending create() calls to the same path fail the whole transaction.
 */

export interface BillingDocSnap {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

/** Read-only view handed to prepare hooks — writes are not expressible. */
export interface BillingReadTransaction {
  get(path: string): Promise<BillingDocSnap>;
}

export interface BillingTransaction extends BillingReadTransaction {
  /** Fails the transaction if the document already exists (append-only). */
  create(path: string, data: Record<string, unknown>): void;
  set(path: string, data: Record<string, unknown>): void;
}

export interface BillingStore {
  runTransaction<T>(fn: (tx: BillingTransaction) => Promise<T>): Promise<T>;
}

export class AlreadyExistsError extends Error {
  constructor(public readonly path: string) {
    super(`document already exists: ${path}`);
    this.name = "AlreadyExistsError";
  }
}

export class ReadAfterWriteError extends Error {
  constructor(path: string) {
    super(
      `Firestore transactions require all reads before writes (attempted get(${path}) after a staged write)`
    );
    this.name = "ReadAfterWriteError";
  }
}

class ConcurrentModificationError extends Error {
  constructor() {
    super("transaction retry: a read document changed before commit");
    this.name = "ConcurrentModificationError";
  }
}

function snapshotEqual(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined
): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export class MemoryBillingStore implements BillingStore {
  readonly docs = new Map<string, Record<string, unknown>>();

  /**
   * Firestore-like optimistic concurrency: if a document that was read
   * changed before commit, the callback is retried. Concurrent counter
   * allocations therefore cannot both persist the same serial.
   */
  async runTransaction<T>(fn: (tx: BillingTransaction) => Promise<T>): Promise<T> {
    const maxAttempts = 8;
    let lastConflict: ConcurrentModificationError | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await this.runOnce(fn);
      } catch (err) {
        if (err instanceof ConcurrentModificationError) {
          lastConflict = err;
          continue;
        }
        throw err;
      }
    }
    throw lastConflict ?? new ConcurrentModificationError();
  }

  private async runOnce<T>(fn: (tx: BillingTransaction) => Promise<T>): Promise<T> {
    const snapshot = new Map(this.docs);
    const readValues = new Map<string, Record<string, unknown> | undefined>();
    const writes: Array<{ op: "create" | "set"; path: string; data: Record<string, unknown> }> =
      [];
    let writesStaged = false;

    const tx: BillingTransaction = {
      async get(path) {
        if (writesStaged) {
          throw new ReadAfterWriteError(path);
        }
        const data = snapshot.get(path);
        readValues.set(path, data);
        return {
          exists: data !== undefined,
          data: () => data,
        };
      },
      create(path, data) {
        writesStaged = true;
        writes.push({ op: "create", path, data: { ...data } });
      },
      set(path, data) {
        writesStaged = true;
        writes.push({ op: "set", path, data: { ...data } });
      },
    };

    // If fn throws, nothing below runs — zero writes are applied.
    const result = await fn(tx);

    for (const [path, expected] of readValues) {
      if (!snapshotEqual(this.docs.get(path), expected)) {
        throw new ConcurrentModificationError();
      }
    }

    // Validate every create BEFORE applying any mutation (atomic commit).
    const pendingCreates = new Set<string>();
    for (const w of writes) {
      if (w.op === "create") {
        if (this.docs.has(w.path) || pendingCreates.has(w.path)) {
          throw new AlreadyExistsError(w.path);
        }
        pendingCreates.add(w.path);
      }
    }
    for (const w of writes) {
      this.docs.set(w.path, w.data);
    }
    return result;
  }
}
