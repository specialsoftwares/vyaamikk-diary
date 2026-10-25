/**
 * Production diary, purchase-order and pack revision paths.
 * The Firestore runners are injected. This is not a native UI test.
 */
import assert from "node:assert/strict";

import { AppError } from "@/domain/errors";
import type { BusinessEntry } from "@/domain/businessEntry";
import { __resetAuthSessionFenceForTests, retireJsAuthBridge } from "@/services/auth/authSessionFence";
import { resetDomainChangesForTests, subscribeDomainChanges } from "@/services/dataChanges/domainChanges";
import { diaryEntryToCloudPayload } from "@/services/diary/atomicCreate";
import { updateDiaryEntryOnDb } from "@/services/diary/firebaseUpdate";
import { updateProfessionalPackOnDb } from "@/services/professionalPack/revisionUpdate";
import { cancelPurchaseOrderOnDb, updatePurchaseOrderOnDb } from "@/services/purchaseOrder/firebase";
import { RevisionUnknown, revisionCommitRuntime } from "./expectedRevisionCommit";

const originalTransaction = revisionCommitRuntime.runTransaction;

function entry(): BusinessEntry {
  return {
    id: "en_upd_1",
    userId: "u1",
    ueid: "VYD-2026-TEST01",
    entryType: "work_update_issue",
    title: "Site note",
    entryDate: 1_700_000_000_000,
    notes: null,
    reminder: null,
    location: null,
    attachments: [],
    payload: {
      workDone: "poured slab",
      issueProblem: null,
      sitePlace: null,
      quantityOutput: null,
      responsiblePerson: null,
      followUpRequired: false,
    },
    source: "composer",
    status: "active",
    createdAt: 1,
    updatedAt: 10,
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
  };
}

function snap(id: string, data: Record<string, unknown>, fromCache = false) {
  return {
    id,
    exists: () => true,
    data: () => data,
    metadata: { fromCache },
  } as never;
}

async function main() {
  __resetAuthSessionFenceForTests();
  let serverUpdatedAt = 10;
  revisionCommitRuntime.runTransaction = async (_db, work) => {
    await work({
      get: async () => ({ exists: () => true, data: () => ({ updatedAt: serverUpdatedAt }) }),
      set: () => undefined,
    } as never);
    throw new Error("ack_lost");
  };
  const cloud = diaryEntryToCloudPayload(entry());
  let diaryReads = 0;
  let cancels = 0;
  const saved = await updateDiaryEntryOnDb({} as never, "u1", { id: "en_upd_1", title: "Landed" }, {
    cancelNotification: async () => {
      cancels += 1;
    },
    protectCloud: async (record) => record as never,
    docRef: { path: "users/u1/entries/en_upd_1" } as never,
    getDoc: async () => {
      diaryReads += 1;
      return snap("en_upd_1", diaryReads === 1 ? cloud : { ...cloud, title: "Landed", updatedAt: 11 });
    },
  });
  assert.equal(saved.title, "Landed");
  assert.equal(saved.updatedAt, 11);
  assert.equal(cancels, 0);
  assert.ok(diaryReads >= 2);

  __resetAuthSessionFenceForTests();
  let staleDiaryReads = 0;
  let staleDiary: unknown;
  try {
    await updateDiaryEntryOnDb({} as never, "u1", { id: "en_upd_1", title: "Landed" }, {
      cancelNotification: async () => undefined,
      protectCloud: async (record) => record as never,
      docRef: { path: "users/u1/entries/en_upd_1" } as never,
      getDoc: async () => {
        staleDiaryReads += 1;
        if (staleDiaryReads > 1) retireJsAuthBridge();
        return snap("en_upd_1", staleDiaryReads === 1 ? cloud : { ...cloud, title: "Landed", updatedAt: 11 });
      },
    });
  } catch (error) {
    staleDiary = error;
  }
  assert.equal(staleDiary instanceof AppError, true);
  assert.equal((staleDiary as AppError).details?.reason, "session_changed");
  assert.equal((staleDiary as AppError).details?.outcome, "unknown");
  assert.equal((staleDiary as AppError).details?.submitted, true);

  const po = {
    id: "po_1",
    updatedAt: 10,
    notes: null,
    version: 1,
    editHistory: [],
    items: [],
    status: "active",
    createdAt: 1,
    poDate: 1,
  };
  __resetAuthSessionFenceForTests();
  let poReads = 0;
  const updated = await updatePurchaseOrderOnDb({} as never, "u1", { id: "po_1", notes: "Landed" }, {
    ref: { path: "users/u1/purchaseOrders/po_1" } as never,
    read: async () => {
      poReads += 1;
      const data = poReads === 1 ? po : { ...po, notes: "Landed", updatedAt: 11 };
      serverUpdatedAt = Number(data.updatedAt);
      return snap("po_1", data);
    },
  });
  assert.equal(updated.notes, "Landed");

  __resetAuthSessionFenceForTests();
  let cancelReads = 0;
  const cancelled = await cancelPurchaseOrderOnDb({} as never, "u1", "po_1", {
    ref: { path: "users/u1/purchaseOrders/po_1" } as never,
    read: async () => {
      cancelReads += 1;
      const data = cancelReads === 1 ? po : { ...po, status: "cancelled", updatedAt: 12 };
      serverUpdatedAt = Number(data.updatedAt);
      return snap("po_1", data);
    },
  });
  assert.equal(cancelled.status, "cancelled");

  __resetAuthSessionFenceForTests();
  let movedOnly: unknown;
  try {
    await updatePurchaseOrderOnDb({} as never, "u1", { id: "po_1", notes: "Landed" }, {
      ref: { path: "users/u1/purchaseOrders/po_1" } as never,
      read: async () => {
      const data = { ...po, notes: "someone else", updatedAt: 12 };
      serverUpdatedAt = Number(data.updatedAt);
      return snap("po_1", data);
    },
    });
  } catch (error) {
    movedOnly = error;
  }
  assert.ok(movedOnly instanceof RevisionUnknown, "a moved revision is not this purchase-order edit");

  const pack = {
    id: "pack_1",
    userId: "u1",
    title: "Old",
    facts: {},
    matterDate: 1,
    createdAt: 1,
    updatedAt: 10,
    status: "active",
  };
  __resetAuthSessionFenceForTests();
  resetDomainChangesForTests();
  let published = 0;
  const stop = subscribeDomainChanges(() => {
    published += 1;
  });
  let packReads = 0;
  serverUpdatedAt = 10;
  const packSaved = await updateProfessionalPackOnDb({} as never, "u1", { id: "pack_1", title: "Landed" }, {
    ref: { path: "users/u1/professionalPacks/pack_1" } as never,
    read: async () => {
      packReads += 1;
      const data = packReads === 1 ? pack : { ...pack, title: "Landed", updatedAt: 11 };
      serverUpdatedAt = Number(data.updatedAt);
      return snap("pack_1", data);
    },
  });
  assert.equal(packSaved.title, "Landed");
  assert.equal(published, 1);

  published = 0;
  __resetAuthSessionFenceForTests();
  let stalePackReads = 0;
  let stalePack: unknown;
  try {
    await updateProfessionalPackOnDb({} as never, "u1", { id: "pack_1", title: "Landed" }, {
      ref: { path: "users/u1/professionalPacks/pack_1" } as never,
      read: async () => {
        stalePackReads += 1;
        if (stalePackReads > 1) retireJsAuthBridge();
        const data = stalePackReads === 1 ? pack : { ...pack, title: "Landed", updatedAt: 11 };
        serverUpdatedAt = Number(data.updatedAt);
        return snap("pack_1", data);
      },
    });
  } catch (error) {
    stalePack = error;
  }
  stop();
  assert.equal((stalePack as AppError).details?.reason, "session_changed");
  assert.equal(published, 0, "a stale pack result is not published");

  console.log("issuedRevisionCallers: diary, purchase order and pack outcomes stay owned");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  revisionCommitRuntime.runTransaction = originalTransaction;
});
