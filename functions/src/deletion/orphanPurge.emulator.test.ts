/**
 * Real Firestore emulator regression. The review script treated exhausted=true
 * while a missing-parent descendant remained as success. This requires the
 * descendant to be gone and exhausted to be true only then.
 */
import assert from "node:assert/strict";

import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { purgeUserSubcollectionsFully } from "./firestorePurge";

async function main() {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? "";
  assert.match(host, /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/);
  const app = initializeApp({ projectId: "demo-vyaamikk-orphan-purge" }, "orphan-purge");
  const db = getFirestore(app);
  const uid = "synthetic-orphan-owner";
  const parent = db.doc(`users/${uid}/entries/missing-parent`);
  const child = parent.collection("notes").doc("private-note");
  try {
    await child.set({ note: "synthetic review fixture" });
    assert.equal((await parent.get()).exists, false);
    const result = await purgeUserSubcollectionsFully(db, uid);
    const retained = (await child.get()).exists;
    console.log(JSON.stringify({ purgeResult: result, missingParentDescendantRemains: retained }));
    assert.equal(retained, false);
    assert.equal(result.exhausted, true);
    assert.equal(result.hold, undefined);
    console.log("orphan purge: missing-parent descendant is deleted and the result is not a false completion");

    const competeUid = "synthetic-compete-owner";
    const notes = db.collection(`users/${competeUid}/entries/missing-parent/notes`);
    const batch = db.batch();
    for (let i = 0; i < 101; i += 1) batch.set(notes.doc(`n${i}`), { i });
    await batch.commit();
    await assert.rejects(
      () => purgeUserSubcollectionsFully(db, competeUid, {
        beforePage: async (cursor) => {
          if (cursor?.pageToken) throw new Error("lease_lost");
        },
      }),
      /lease_lost/
    );
    const afterLoss = await notes.get();
    assert.ok(afterLoss.size > 0, "the worker that lost the lease must leave the rest");
    assert.ok(afterLoss.size < 101, "the first page is still deleted before the lease is lost");
    const finished = await purgeUserSubcollectionsFully(db, competeUid);
    assert.equal(finished.exhausted, true);
    assert.equal((await notes.get()).size, 0);
    console.log("orphan purge: a lost lease does not complete the walk; the next owner finishes it");
  } finally {
    await child.delete().catch(() => undefined);
    await deleteApp(app);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
