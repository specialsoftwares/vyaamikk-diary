import assert from "node:assert/strict";

import {
  localContentDiffers,
  resolveDiaryPendingOp,
  shouldAutoEnqueue,
  shouldSkipHeuristicPurge,
} from "@/sync/diarySyncIntent";
import { mergeRemoteWithLocalUnsynced } from "@/services/diary/mergeLocalUnsynced";
import type { BusinessEntry } from "@/domain/businessEntry";
import type { LocalEntryRecord } from "@/repositories/localEntriesRepository";

function meta(partial: Partial<LocalEntryRecord["meta"]>): LocalEntryRecord["meta"] {
  return {
    syncStatus: "pending",
    pendingOp: null,
    remoteConfirmed: false,
    syncErrorCode: null,
    autoRetry: true,
    localUpdatedAt: 1,
    ...partial,
  };
}

assert.equal(resolveDiaryPendingOp("en_abc", meta({ pendingOp: "create" })), "create");
assert.equal(resolveDiaryPendingOp("en_abc", meta({ pendingOp: "update", remoteConfirmed: true })), "update");
assert.equal(resolveDiaryPendingOp("local_old", meta({})), "create");
assert.equal(resolveDiaryPendingOp("en_custom", meta({})), "ambiguous");
assert.equal(
  resolveDiaryPendingOp("en_done", meta({ remoteConfirmed: true, syncStatus: "synced" })),
  null
);

assert.equal(shouldAutoEnqueue(meta({ autoRetry: false })), false);
assert.equal(
  shouldAutoEnqueue(meta({ pendingOp: "create", autoRetry: false, remoteConfirmed: false })),
  false
);
assert.equal(
  shouldAutoEnqueue(meta({ pendingOp: "update", remoteConfirmed: true, autoRetry: true })),
  true
);
assert.equal(shouldSkipHeuristicPurge("en_1", meta({})), true);
assert.equal(shouldSkipHeuristicPurge("local_1", meta({ pendingOp: "create" })), true);
assert.equal(shouldSkipHeuristicPurge("local_1", meta({ syncErrorCode: "quota_exhausted" })), true);
assert.equal(shouldSkipHeuristicPurge("local_legacy", meta({})), false);

assert.equal(
  localContentDiffers(
    { title: "A", notes: null, payload: { x: 1 }, entryDate: 1 },
    { title: "A", notes: null, payload: { x: 1 }, entryDate: 1 }
  ),
  false
);
assert.equal(
  localContentDiffers(
    { title: "A", notes: "new", payload: { x: 1 }, entryDate: 1 },
    { title: "A", notes: null, payload: { x: 1 }, entryDate: 1 }
  ),
  true
);

const entry = (id: string, title: string): BusinessEntry =>
  ({
    id,
    userId: "u1",
    ueid: "UEID",
    entryType: "work_update_issue",
    title,
    entryDate: 2,
    notes: null,
    reminder: null,
    location: null,
    attachments: [],
    payload: {
      workDone: "x",
      issueProblem: null,
      sitePlace: null,
      quantityOutput: null,
      responsiblePerson: null,
      followUpRequired: false,
    },
    source: "composer",
    status: "active",
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    pdfUri: null,
    documentHistory: {
      firstGeneratedAt: null,
      lastGeneratedAt: null,
      lastEditedAt: null,
      versionNumber: 1,
      editHistory: [],
      pdfGenerationHistory: [],
    },
  }) as BusinessEntry;

const merged = mergeRemoteWithLocalUnsynced(
  [entry("cloud", "Cloud")],
  [
    {
      entry: entry("local", "Local"),
      meta: meta({ pendingOp: "create" }),
    },
  ]
);
assert.equal(merged.entries.length, 2);
assert.equal(merged.badgeById.local, "pending");
assert.equal(merged.badgeById.cloud, "synced");

console.log("diarySyncIntent.test.ts: ok");
