/**
 * Production diary UPDATE helpers and injected-transaction path.
 * Boundary: fake Firestore transaction (not emulator, not device).
 */

import assert from "node:assert/strict";

import type { Firestore, Transaction } from "firebase/firestore";

import { AppError } from "@/domain/errors";
import type { BusinessEntry } from "@/domain/businessEntry";
import { diaryEntryToCloudPayload } from "@/services/diary/atomicCreate";
import { updateDiaryEntryOnDb } from "@/services/diary/firebaseUpdate";
import {
  buildDiaryUpdateRecord,
  reminderCancelIdAfterUpdate,
  runAfterDiaryUpdateCommit,
} from "@/services/diary/firebaseUpdatePlan";

function entry(): BusinessEntry {
  return {
    id: "en_upd_1",
    userId: "u1",
    ueid: "VYD-2026-TEST01",
    entryType: "work_update_issue",
    title: "Site note",
    entryDate: 1_700_000_000_000,
    notes: null,
    reminder: { at: 1_800_000_000_000, note: "call", notificationId: "n1" },
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

async function main() {
  const existing = entry();
  assert.equal(reminderCancelIdAfterUpdate(existing, { id: existing.id, reminder: null }), "n1");
  assert.equal(reminderCancelIdAfterUpdate(existing, { id: existing.id, title: "x" }), null);
  const built = buildDiaryUpdateRecord(existing, { id: existing.id, title: "next" });
  assert.equal(built.title, "next");

  let postCancel = 0;
  await runAfterDiaryUpdateCommit("n1", async () => {
    postCancel += 1;
    throw new Error("cancel failed");
  });
  assert.equal(postCancel, 1);

  const cloud = diaryEntryToCloudPayload(existing);
  let txRuns = 0;
  let cancels = 0;
  const fakeDb = {} as Firestore;
  const fakeTx = {
    get: async () => ({
      exists: () => true,
      id: "en_upd_1",
      data: () => cloud,
    }),
    set: () => undefined,
  };

  const committed = await updateDiaryEntryOnDb(
    fakeDb,
    "u1",
    { id: "en_upd_1", reminder: null, expectedUpdatedAt: 10 },
    {
      cancelNotification: async () => {
        cancels += 1;
      },
      runTransaction: async (_db, cb) => {
        txRuns += 1;
        await cb(fakeTx as unknown as Transaction);
        txRuns += 1;
        return cb(fakeTx as unknown as Transaction);
      },
      docRef: { path: "users/u1/entries/en_upd_1" } as never,
    }
  );
  assert.equal(txRuns, 2);
  assert.equal(cancels, 1);
  assert.equal(committed.reminder, null);

  cancels = 0;
  txRuns = 0;
  try {
    await updateDiaryEntryOnDb(
      fakeDb,
      "u1",
      { id: "en_upd_1", reminder: null, expectedUpdatedAt: 99 },
      {
        cancelNotification: async () => {
          cancels += 1;
        },
        runTransaction: async (_db, cb) => {
          txRuns += 1;
          return cb(fakeTx as unknown as Transaction);
        },
        docRef: { path: "users/u1/entries/en_upd_1" } as never,
      }
    );
    assert.fail("expected CAS rejection");
  } catch (e) {
    assert.equal(e instanceof AppError, true);
  }
  assert.equal(cancels, 0);
  assert.equal(txRuns, 1);

  const mirror: BusinessEntry = {
    ...entry(),
    id: "lh_flow:matter",
    entryType: "letterhead_matter",
    source: "letterhead",
    notes: null,
    reminder: null,
    payload: {
      letterheadDocumentId: "lh_flow",
      subject: "Subject",
      reference: null,
      body: "Body of the letter.",
      closing: "Yours",
      signerName: "Owner",
      designation: "Proprietor",
      place: "Delhi",
    },
  };
  const titled = buildDiaryUpdateRecord(mirror, { id: mirror.id, title: "Edited letter" });
  assert.equal(titled.title, "Edited letter");
  const bodyEdit = buildDiaryUpdateRecord(mirror, {
    id: mirror.id,
    payload: { ...mirror.payload, body: "Revised letter text" },
  });
  assert.equal((bodyEdit.payload as { body: string }).body, "Revised letter text");
  assert.throws(
    () =>
      buildDiaryUpdateRecord(mirror, {
        id: mirror.id,
        reminder: { at: 1_800_000_000_000, note: "follow", notificationId: "n2" },
      }),
    (e: unknown) => e instanceof AppError && e.details?.reason === "letterhead_mirror_conversion_denied"
  );
  assert.throws(
    () =>
      buildDiaryUpdateRecord(mirror, {
        id: mirror.id,
        payload: { ...mirror.payload, letterheadDocumentId: "other" },
      }),
    (e: unknown) => e instanceof AppError && e.details?.reason === "letterhead_mirror_conversion_denied"
  );
  assert.throws(
    () =>
      buildDiaryUpdateRecord(mirror, {
        id: mirror.id,
        payload: { ...mirror.payload, workDone: "nope" } as never,
      }),
    (e: unknown) => e instanceof AppError && e.details?.reason === "letterhead_mirror_conversion_denied"
  );

  console.log("diary.firebaseUpdate.test.ts: ok (fake transaction boundary)");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
