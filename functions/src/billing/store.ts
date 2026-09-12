/**
 * Minimal transactional document store used by the billing engine.
 *
 * Production wraps firebase-admin. Tests use MemoryBillingStore so Phase B
 * does not depend on the emulator or a live project.
 */

export interface BillingDocSnap {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface BillingTransaction {
  get(path: string): Promise<BillingDocSnap>;
  /** Fails if the document already exists (append-only / idempotency create). */
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

export class MemoryBillingStore implements BillingStore {
  readonly docs = new Map<string, Record<string, unknown>>();

  async runTransaction<T>(fn: (tx: BillingTransaction) => Promise<T>): Promise<T> {
    const snapshot = new Map(this.docs);
    const writes: Array<{ op: "create" | "set"; path: string; data: Record<string, unknown> }> =
      [];
    const tx: BillingTransaction = {
      async get(path) {
        const data = snapshot.get(path);
        return {
          exists: data !== undefined,
          data: () => data,
        };
      },
      create(path, data) {
        writes.push({ op: "create", path, data: { ...data } });
      },
      set(path, data) {
        writes.push({ op: "set", path, data: { ...data } });
      },
    };
    const result = await fn(tx);
    for (const w of writes) {
      if (w.op === "create" && this.docs.has(w.path)) {
        throw new AlreadyExistsError(w.path);
      }
      this.docs.set(w.path, w.data);
    }
    return result;
  }
}
