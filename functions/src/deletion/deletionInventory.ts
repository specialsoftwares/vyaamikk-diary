/**
 * Read-only inventory of one user's tree. It does not delete.
 * A leftover count is accepted only when it is the record this walk stored.
 */

import { ownsDeletionLease } from "./deletionSafety";
import type { DeletionJobDoc } from "./deletionJob";
import { cursorOwnedByUser, type FirestorePurgeCursor } from "./firestorePurge";

export type InventoryDoc = {
  id: string;
  missingParent?: boolean;
  children?: Record<string, InventoryDoc[] | undefined>;
};

export type InventoryPage = {
  ids: string[];
  missingIds: string[];
  nextPageToken: string | null;
};

export type ReadOnlyInventory = {
  childCollections(path: string): Promise<string[]>;
  listPage(path: string, collection: string, pageToken?: string): Promise<InventoryPage>;
};

export type InventoryRecord = {
  revision: number;
  scope: string;
  observedAt: number;
  remainingPaths: string[];
  status: "partial" | "complete";
  clockSource: "server";
  jobId: string;
  uid: string;
};

export type InventoryLog = {
  commit(record: InventoryRecord): Promise<number>;
  read(revision: number): Promise<InventoryRecord | null>;
};

export function createMemoryInventoryLog(): InventoryLog {
  let current: InventoryRecord | null = null;
  return {
    async commit(record) {
      current = { ...record, remainingPaths: [...record.remainingPaths] };
      return record.revision;
    },
    async read(revision) {
      if (!current || current.revision !== revision) return null;
      return { ...current, remainingPaths: [...current.remainingPaths] };
    },
  };
}

type Stored = { children: Record<string, InventoryDoc[] | undefined> };

function nodeAt(root: Stored, path: string): { children?: Record<string, InventoryDoc[] | undefined> } | null {
  if (path.length === 0) return root;
  const parts = path.split("/");
  let current: { children?: Record<string, InventoryDoc[] | undefined> } = root;
  for (let index = 0; index < parts.length; index += 2) {
    const collection = parts[index];
    const id = parts[index + 1];
    if (!collection || !id) return null;
    const docs: InventoryDoc[] = current.children?.[collection] ?? [];
    const found: InventoryDoc | undefined = docs.find((doc) => doc.id === id);
    if (!found) return null;
    current = found;
  }
  return current;
}

/** Synthetic tree. Paths are relative to the user document, which is the root. */
export function createSyntheticInventory(children: Record<string, InventoryDoc[] | undefined>): ReadOnlyInventory {
  const root: Stored = { children };
  return {
    async childCollections(path) {
      const relative = path.replace(/^users\/[^/]+\/?/, "");
      const node = nodeAt(root, relative);
      return Object.keys(node?.children ?? {});
    },
    async listPage(path, collection, pageToken) {
      const relative = path.replace(/^users\/[^/]+\/?/, "");
      const node = nodeAt(root, relative);
      const docs = node?.children?.[collection] ?? [];
      const start = pageToken ? docs.findIndex((doc) => doc.id === pageToken) + 1 : 0;
      const page = docs.slice(Math.max(start, 0), Math.max(start, 0) + 100);
      return {
        ids: page.map((doc) => doc.id),
        missingIds: page.filter((doc) => doc.missingParent).map((doc) => doc.id),
        nextPageToken: start + page.length < docs.length ? page[page.length - 1]?.id ?? null : null,
      };
    },
  };
}

export async function readDeletionInventory(input: {
  uid: string;
  now: number;
  revision: number;
  inventory: ReadOnlyInventory;
  knownCollections: readonly string[];
  maxDepth: number;
  log: InventoryLog;
  jobId?: string;
  maxPages?: number;
}): Promise<{ revision: number; holds: { path: string; reason: "unknown_collection" | "depth_exceeded" | "missing_parent" }[]; status: "partial" | "complete" }> {
  const userPath = `users/${input.uid}`;
  const known = new Set(input.knownCollections);
  const remaining = new Set<string>();
  const holds: { path: string; reason: "unknown_collection" | "depth_exceeded" | "missing_parent" }[] = [];
  let pages = 0;
  let partial = false;
  const visit = async (parent: string, collection: string, depth: number): Promise<void> => {
    const collectionPath = `${parent}/${collection}`;
    if (!known.has(collection) && parent === userPath) {
      holds.push({ path: collectionPath, reason: "unknown_collection" });
      remaining.add(collectionPath);
      return;
    }
    if (depth > input.maxDepth) {
      holds.push({ path: collectionPath, reason: "depth_exceeded" });
      remaining.add(collectionPath);
      return;
    }
    let token: string | undefined;
    for (;;) {
      if (input.maxPages != null && pages >= input.maxPages) {
        partial = true;
        return;
      }
      pages += 1;
      const page = await input.inventory.listPage(parent, collection, token);
      for (const id of page.ids) {
        const path = `${collectionPath}/${id}`;
        remaining.add(path);
        if (page.missingIds.includes(id)) holds.push({ path, reason: "missing_parent" });
        const children = await input.inventory.childCollections(path);
        for (const child of children) await visit(path, child, depth + 1);
      }
      if (!page.nextPageToken) return;
      token = page.nextPageToken;
    }
  };
  const roots = await input.inventory.childCollections(userPath);
  for (const name of roots) await visit(userPath, name, 1);
  const paths = [...remaining].sort();
  const status = partial ? "partial" : "complete";
  const revision = await input.log.commit({
    revision: input.revision,
    scope: userPath,
    observedAt: input.now,
    remainingPaths: paths,
    status,
    clockSource: "server",
    jobId: input.jobId ?? input.uid,
    uid: input.uid,
  });
  return { revision, holds, status };
}

export async function resumeHeldResolution(input: {
  uid: string;
  job: DeletionJobDoc;
  worker: string;
  now: number;
  cursor: FirestorePurgeCursor | null;
  inventory: ReadOnlyInventory;
  providerEvidence: string | null;
  backupEvidence: string | null;
  verification: { ok: true; remaining: number } | { ok: false; reason: string };
}): Promise<{
  completion: "blocked";
  reason: string;
  nextCursor: string | null;
  ids: string[];
  providerEvidence: string | null;
  backupEvidence: string | null;
}> {
  const blocked = (reason: string, nextCursor: string | null = input.cursor?.pageToken ?? null, ids: string[] = []) => ({
    completion: "blocked" as const,
    reason,
    nextCursor,
    ids,
    providerEvidence: input.providerEvidence,
    backupEvidence: input.backupEvidence,
  });
  if (!ownsDeletionLease(input.job, input.job.generation, input.worker, input.now)) return blocked("lease_lost", null);
  if (input.cursor && !cursorOwnedByUser(input.uid, input.cursor)) return blocked("cursor_not_owned", null);
  const page = input.cursor
    ? await input.inventory.listPage(input.cursor.parentPath, input.cursor.collectionId, input.cursor.pageToken || undefined)
    : null;
  const ids = page?.ids ?? [];
  const nextCursor = page?.nextPageToken ?? null;
  if (!input.verification.ok) return blocked(input.verification.reason, nextCursor, ids);
  if (input.verification.remaining > 0) return blocked("leftovers_remain", nextCursor, ids);
  if (input.providerEvidence || input.backupEvidence) return blocked("provider_or_backup_evidence_is_not_a_purge_result", nextCursor, ids);
  if (page) return blocked("resolution_incomplete", nextCursor, ids);
  return blocked("ready_for_operator_review");
}

/**
 * Operator workflow. A finished scan can wait for an operator. It does not
 * delete, and a partial scan cannot certify that nothing remains.
 */
export async function runHeldResolutionWorkflow(input: {
  uid: string;
  job: DeletionJobDoc;
  worker: string;
  now: number;
  inventory: ReadOnlyInventory;
  log: InventoryLog;
  knownCollections: readonly string[];
  maxDepth: number;
  maxPages?: number;
  providerEvidence: string | null;
  backupEvidence: string | null;
  revision: number;
}): Promise<
  | { status: "blocked"; reason: string }
  | { status: "continue"; reason: "scan_partial" }
  | { status: "awaiting_operator"; remaining: number; revision: number }
> {
  if (!ownsDeletionLease(input.job, input.job.generation, input.worker, input.now)) {
    return { status: "blocked", reason: "lease_lost" };
  }
  const walked = await readDeletionInventory({
    uid: input.uid,
    now: input.now,
    revision: input.revision,
    inventory: input.inventory,
    knownCollections: input.knownCollections,
    maxDepth: input.maxDepth,
    log: input.log,
    jobId: `${input.uid}:${input.job.generation}`,
    maxPages: input.maxPages,
  });
  if (walked.status !== "complete") return { status: "continue", reason: "scan_partial" };
  const record = await input.log.read(walked.revision);
  if (!record || record.status !== "complete" || record.clockSource !== "server" || record.uid !== input.uid) {
    return { status: "blocked", reason: "inventory_scan_incomplete" };
  }
  if (record.scope !== `users/${input.uid}`) return { status: "blocked", reason: "leftover_scope_rejected" };
  if (input.providerEvidence || input.backupEvidence) {
    return { status: "blocked", reason: "provider_or_backup_evidence_is_not_a_purge_result" };
  }
  if (record.remainingPaths.length > 0) return { status: "blocked", reason: "leftovers_remain" };
  return { status: "awaiting_operator", remaining: record.remainingPaths.length, revision: record.revision };
}
