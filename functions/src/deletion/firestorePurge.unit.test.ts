import assert from "node:assert/strict";

import { createSyntheticInventory, readDeletionInventory, resumeHeldResolution } from "./deletionInventory";
import { purgeUserSubcollectionsFully, reviewUnknownPurgeHold, type LeftoverInventoryRecord, type PurgePorts } from "./firestorePurge";
import type { DeletionJobDoc } from "./deletionJob";

type Mem = {
  docs: Map<string, Set<string>>;
  children: Map<string, string[]>;
};

function ports(mem: Mem): PurgePorts {
  return {
    async listPage(parentPath, collectionId) {
      const ids = [...(mem.docs.get(`${parentPath}/${collectionId}`) ?? new Set<string>())];
      return { ids };
    },
    async childCollections(path) {
      return mem.children.get(path) ?? [];
    },
    async rootCollections() {
      return ["entries", "subscription"];
    },
    async deleteDocs(paths) {
      for (const path of paths) {
        const slash = path.lastIndexOf("/");
        const col = path.slice(0, slash);
        const id = path.slice(slash + 1);
        mem.docs.get(col)?.delete(id);
      }
    },
  };
}

async function main() {
  const mem: Mem = { docs: new Map(), children: new Map() };
  mem.docs.set("users/owner/entries", new Set(["missing-parent"]));
  mem.children.set("users/owner/entries/missing-parent", ["notes"]);
  mem.docs.set("users/owner/entries/missing-parent/notes", new Set(["private-note"]));
  const renewals: number[] = [];
  const purged = await purgeUserSubcollectionsFully({} as never, "owner", {
    ports: ports(mem),
    onBatch: async () => {
      renewals.push(1);
    },
  });
  assert.equal(purged.exhausted, true);
  assert.equal(purged.hold, undefined);
  assert.equal(mem.docs.get("users/owner/entries/missing-parent/notes")?.size ?? 0, 0);
  assert.equal(mem.docs.get("users/owner/entries")?.size ?? 0, 0);
  assert.ok(renewals.length >= 2);

  const deep: Mem = { docs: new Map(), children: new Map() };
  let parent = "users/owner";
  let collection = "entries";
  deep.docs.set(`${parent}/${collection}`, new Set(["n0"]));
  for (let level = 0; level < 5; level += 1) {
    const docPath = `${parent}/${collection}/n${level}`;
    const next = `c${level}`;
    deep.children.set(docPath, [next]);
    deep.docs.set(`${docPath}/${next}`, new Set([`n${level + 1}`]));
    parent = docPath;
    collection = next;
  }
  const blocked = await purgeUserSubcollectionsFully({} as never, "owner", { ports: ports(deep) });
  assert.equal(blocked.exhausted, false);
  assert.equal(blocked.hold, "depth_exceeded");
  assert.ok([...deep.docs.values()].some((ids) => ids.size > 0));

  mem.docs.set("users/owner/entries", new Set(["kept"]));
  const foreign = await purgeUserSubcollectionsFully({} as never, "owner", {
    ports: ports(mem),
    cursor: { parentPath: "users/other/entries/stolen", collectionId: "notes", pageToken: "" },
  });
  assert.equal(foreign.hold, "cursor_unowned");
  assert.equal(foreign.deleted, 0);
  assert.equal(mem.docs.get("users/owner/entries")?.has("kept"), true);

  await assert.rejects(
    () => purgeUserSubcollectionsFully({} as never, "owner", {
      ports: ports(mem),
      beforePage: async () => {
        throw new Error("lease_lost");
      },
    }),
    /lease_lost/
  );
  const log = (record: LeftoverInventoryRecord | null) => ({
    async read(revision: number) {
      return record && record.revision === revision ? record : null;
    },
  });
  const base = {
    path: "users/owner/customDeep/item/notes",
    walkerDeleted: 3,
    expectedScope: "users/owner",
    now: 5_000,
    maxAgeMs: 1_000,
    providerEvidence: null as string | null,
    backupEvidence: null as string | null,
  };
  assert.equal((await reviewUnknownPurgeHold({
    ...base,
    hold: "unknown_collection",
    log: log(null),
    claimedRevision: null,
    claimedRemaining: null,
  })).reason, "independent_leftover_check_missing");
  assert.equal((await reviewUnknownPurgeHold({
    ...base,
    hold: "depth_exceeded",
    path: "users/owner/entries/item/notes/deep/more",
    log: log({ revision: 1, scope: "users/owner", observedAt: 5_000, remainingPaths: ["users/owner/entries/a", "users/owner/entries/b"], status: "complete", clockSource: "server" }),
    claimedRevision: 1,
    claimedRemaining: 0,
  })).reason, "leftover_count_mismatch");
  assert.equal((await reviewUnknownPurgeHold({
    ...base,
    hold: "depth_exceeded",
    path: "users/owner/entries/item/notes/deep/more",
    log: log({ revision: 2, scope: "users/owner", observedAt: 5_000, remainingPaths: ["users/owner/entries/a", "users/owner/entries/b"], status: "complete", clockSource: "server" }),
    claimedRevision: 2,
    claimedRemaining: 2,
    providerEvidence: "provider-deleted",
  })).reason, "leftovers_remain");
  assert.equal((await reviewUnknownPurgeHold({
    ...base,
    hold: "unknown_collection",
    path: "users/owner/customDeep",
    log: log({ revision: 3, scope: "users/owner", observedAt: 5_000, remainingPaths: [], status: "complete", clockSource: "server" }),
    claimedRevision: 3,
    claimedRemaining: 0,
    backupEvidence: "backup-export",
  })).reason, "provider_or_backup_evidence_is_not_a_purge_result");
  assert.equal((await reviewUnknownPurgeHold({
    ...base,
    hold: "depth_exceeded",
    path: "users/owner/entries/item/notes/deep",
    log: log({ revision: 4, scope: "users/owner", observedAt: 5_000, remainingPaths: [], status: "partial", clockSource: "caller" }),
    claimedRevision: 4,
    claimedRemaining: 0,
  })).reason, "inventory_scan_incomplete");
  assert.equal((await reviewUnknownPurgeHold({
    ...base,
    hold: "depth_exceeded",
    path: "users/owner/entries/item/notes/deep",
    log: log({ revision: 5, scope: "users/owner", observedAt: 5_000, remainingPaths: [], status: "complete", clockSource: "server", uid: "owner", jobId: "job-1" }),
    claimedRevision: 5,
    claimedRemaining: 0,
  })).reason, "ready_for_operator_review");

  const inventory = createSyntheticInventory({
    entries: [
      {
        id: "item",
        children: {
          notes: [{ id: "n1", children: { more: [{ id: "deep", children: { extra: [{ id: "too-deep" }] } }] } }],
        },
      },
      { id: "ghost", missingParent: true },
    ],
    customDeep: [{ id: "x" }],
  });
  const inventoryLog = {
    current: null as LeftoverInventoryRecord | null,
    async commit(record: LeftoverInventoryRecord) {
      this.current = record;
      return record.revision;
    },
    async read(revision: number) {
      return this.current && this.current.revision === revision ? this.current : null;
    },
  };
  const walked = await readDeletionInventory({
    uid: "owner",
    now: 5_000,
    revision: 7,
    inventory,
    knownCollections: ["entries", "notes", "more", "extra"],
    maxDepth: 3,
    log: inventoryLog,
  });
  assert.equal(walked.holds.some((hold) => hold.reason === "unknown_collection" && hold.path === "users/owner/customDeep"), true);
  assert.equal(walked.holds.some((hold) => hold.reason === "missing_parent" && hold.path.endsWith("/ghost")), true);
  assert.equal(walked.holds.some((hold) => hold.reason === "depth_exceeded" && hold.path.endsWith("/extra")), true);
  const recorded = await inventoryLog.read(walked.revision);
  assert.ok(recorded);
  assert.equal(recorded.scope, "users/owner");
  assert.equal(recorded.remainingPaths.some((path) => path.includes("/notes/n1")), true);
  assert.equal((await reviewUnknownPurgeHold({
    ...base,
    hold: "unknown_collection",
    log: inventoryLog,
    claimedRevision: walked.revision,
    claimedRemaining: 0,
  })).reason, "leftover_count_mismatch");
  const job = {
    uid: "owner",
    generation: 1,
    status: "leased",
    leaseOwner: "worker-a",
    leaseUntil: 9_000,
  } as DeletionJobDoc;
  const resumed = await resumeHeldResolution({
    uid: "owner",
    job,
    worker: "worker-a",
    now: 5_000,
    cursor: { parentPath: "users/owner", collectionId: "entries", pageToken: "" },
    inventory,
    providerEvidence: "backup-still-held",
    backupEvidence: null,
    verification: { ok: false, reason: "leftovers_remain" },
  });
  assert.equal(resumed.completion, "blocked");
  assert.equal(resumed.reason, "leftovers_remain");
  assert.equal(resumed.providerEvidence, "backup-still-held");
  assert.ok(resumed.ids.includes("item"));
  const stolen = await resumeHeldResolution({
    uid: "owner",
    job,
    worker: "worker-a",
    now: 5_000,
    cursor: { parentPath: "users/other", collectionId: "entries", pageToken: "" },
    inventory,
    providerEvidence: null,
    backupEvidence: null,
    verification: { ok: true, remaining: 0 },
  });
  assert.equal(stolen.reason, "cursor_not_owned");
  console.log("firestorePurge: missing parent, depth hold and lease stop passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
