/**
 * Owner-scoped invalidation after a durable local commit.
 * Revision is a process counter, not a server event version.
 */

export type DomainSource =
  | "diary"
  | "professionalPack"
  | "customerCredit"
  | "purchaseOrder"
  | "grin"
  | "legacyLetter"
  | "statutory";

export type DomainChange = Readonly<{
  ownerUid: string;
  source: DomainSource;
  revision: number;
}>;

type Listener = (change: DomainChange) => void;

let revision = 0;
const listeners = new Set<Listener>();

export function publishDomainChange(ownerUid: string, source: DomainSource): DomainChange {
  const uid = ownerUid.trim();
  if (!uid) {
    throw new Error("domain change requires an owner");
  }
  revision += 1;
  const change: DomainChange = { ownerUid: uid, source, revision };
  for (const listener of listeners) {
    try {
      listener(change);
    } catch {
      // A subscriber must not block the commit that already succeeded.
    }
  }
  return change;
}

export function subscribeDomainChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function currentDomainRevision(): number {
  return revision;
}

export function resetDomainChangesForTests(): void {
  revision = 0;
  listeners.clear();
}
