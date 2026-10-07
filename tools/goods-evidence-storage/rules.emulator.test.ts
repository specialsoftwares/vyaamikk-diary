/**
 * STORAGE_EMULATOR + FIRESTORE_EMULATOR rules tests for G2 Wave 1 / W2-04.
 * Direct client Storage SDK. Isolated rules only. Not live IAM. Do not deploy.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteObject, getBytes, ref, updateMetadata, uploadBytes } from "firebase/storage";
import { doc, getDoc, updateDoc } from "firebase/firestore";

import { evidenceLabel } from "./testSupport";

const dir = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = "demo-vyaamikk-grin-g2";
const OBJECT_KEY = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const UNRESERVED_KEY = "dddddddddddddddddddddddddddddddd";
const RETIRED_KEY = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const SECOND_KEY = "ffffffffffffffffffffffffffffffff";
const DERIVATIVE_KEY = "cccccccccccccccccccccccccccccccc";
const ARBITRARY_DERIVATIVE = "abababababababababababababababab";
const ORIGINAL = `users/alice/grinEvidence/${OBJECT_KEY}/original`;
const UNRESERVED = `users/alice/grinEvidence/${UNRESERVED_KEY}/original`;
const RETIRED = `users/alice/grinEvidence/${RETIRED_KEY}/original`;
const SECOND = `users/alice/grinEvidence/${SECOND_KEY}/original`;
const DERIVATIVE = `users/alice/grinEvidence/${OBJECT_KEY}/derivatives/${DERIVATIVE_KEY}`;
const ARBITRARY = `users/alice/grinEvidence/${OBJECT_KEY}/derivatives/${ARBITRARY_DERIVATIVE}`;
const PDF = Buffer.from("%PDF-1.4 g2-original");
const THUMB = Buffer.from("thumb-bytes");

async function seedObjectKey(
  ctx: { firestore: () => { doc: (path: string) => { set: Function } } },
  objectKey: string,
  state: string,
  ledgerId = "ledger_g2"
): Promise<void> {
  await ctx.firestore().doc(`users/alice/grinEvidenceObjectKeys/${objectKey}`).set({
    schemaVersion: 1,
    objectKey,
    evidenceId: "ev_rules",
    ledgerId,
    receiptId: "receipt_g2",
    ownerUid: "alice",
    state,
  });
}

async function setAdmission(
  testEnv: RulesTestEnvironment,
  newCommands: "allow" | "deny"
): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc("users/alice/goodsEvidenceAdmission/runtime").set({
      schemaVersion: 1,
      newCommands,
      reconciliation: "allow",
    });
  });
}

async function setObjectState(testEnv: RulesTestEnvironment, objectKey: string, state: string): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await seedObjectKey(ctx, objectKey, state);
  });
}

async function main(): Promise<void> {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    throw new Error("emulators:exec required for rules tests");
  }

  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(join(dir, "firestore.rules"), "utf8") },
    storage: { rules: readFileSync(join(dir, "storage.rules"), "utf8") },
  });

  try {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("users/alice").set({ uid: "alice", status: "active" });
      await ctx.firestore().doc("users/alice/goodsEvidenceAdmission/runtime").set({
        schemaVersion: 1,
        newCommands: "allow",
        reconciliation: "allow",
      });
      await ctx.firestore().doc("users/alice/goodsEvidenceLedgers/ledger_g2").set({
        ownerUid: "alice",
        status: "active",
      });
      await ctx.firestore().doc("users/alice/goodsEvidenceLedgers/ledger_retired").set({
        ownerUid: "alice",
        status: "retired",
      });
      await ctx.firestore().doc("users/alice/goodsEvidenceLedgers/ledger_g2/evidenceObjects/ev_rules").set({
        schemaVersion: 1,
        state: "reserved",
        claimedSha256: "a".repeat(64),
      });
      await seedObjectKey(ctx, OBJECT_KEY, "reserved");
      await seedObjectKey(ctx, RETIRED_KEY, "reserved", "ledger_retired");
      await seedObjectKey(ctx, SECOND_KEY, "reserved");
    });

    const aliceStorage = testEnv.authenticatedContext("alice").storage();
    const malloryStorage = testEnv.authenticatedContext("mallory").storage();
    const anonStorage = testEnv.unauthenticatedContext().storage();
    const aliceDb = testEnv.authenticatedContext("alice").firestore();
    const malloryDb = testEnv.authenticatedContext("mallory").firestore();

    evidenceLabel("STORAGE_EMULATOR", "unreserved objectKey create/read denied");
    await assertFails(uploadBytes(ref(aliceStorage, UNRESERVED), PDF, { contentType: "application/pdf" }));
    await assertFails(getBytes(ref(aliceStorage, UNRESERVED)));

    evidenceLabel("STORAGE_EMULATOR", "authorized upload against valid reservation");
    await assertSucceeds(
      uploadBytes(ref(aliceStorage, ORIGINAL), PDF, { contentType: "application/pdf" })
    );
    await assertSucceeds(getBytes(ref(aliceStorage, ORIGINAL)));

    evidenceLabel("STORAGE_EMULATOR", "wrong-owner and anon read/create denied");
    await assertFails(getBytes(ref(malloryStorage, ORIGINAL)));
    await assertFails(getBytes(ref(anonStorage, ORIGINAL)));
    await assertFails(uploadBytes(ref(malloryStorage, SECOND), PDF, { contentType: "application/pdf" }));

    evidenceLabel("STORAGE_EMULATOR", "overwrite and delete denied");
    await assertFails(
      uploadBytes(ref(aliceStorage, ORIGINAL), Buffer.from("%PDF-1.4 replaced"), {
        contentType: "application/pdf",
      })
    );
    await assertFails(deleteObject(ref(aliceStorage, ORIGINAL)));

    evidenceLabel("STORAGE_EMULATOR", "invalid-account pending_deletion create/read denied");
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("users/alice").set({ uid: "alice", status: "pending_deletion" });
    });
    await assertFails(getBytes(ref(aliceStorage, ORIGINAL)));
    await assertFails(uploadBytes(ref(aliceStorage, SECOND), PDF, { contentType: "application/pdf" }));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("users/alice").set({ uid: "alice", status: "active" });
    });

    evidenceLabel("STORAGE_EMULATOR", "retired-ledger reservation create/read denied");
    await assertFails(uploadBytes(ref(aliceStorage, RETIRED), PDF, { contentType: "application/pdf" }));
    await assertFails(getBytes(ref(aliceStorage, RETIRED)));

    evidenceLabel("STORAGE_EMULATOR", "newCommands deny blocks in-flight read and new upload");
    await setAdmission(testEnv, "deny");
    await assertFails(getBytes(ref(aliceStorage, ORIGINAL)));
    await assertFails(uploadBytes(ref(aliceStorage, SECOND), PDF, { contentType: "application/pdf" }));
    await setAdmission(testEnv, "allow");
    await assertSucceeds(getBytes(ref(aliceStorage, ORIGINAL)));

    for (const state of ["uploaded_unverified", "verified", "linked"] as const) {
      evidenceLabel("STORAGE_EMULATOR", `read after ${state} according to the matrix`);
      await setObjectState(testEnv, OBJECT_KEY, state);
      await assertSucceeds(getBytes(ref(aliceStorage, ORIGINAL)));
      await setAdmission(testEnv, "deny");
      await assertSucceeds(getBytes(ref(aliceStorage, ORIGINAL)));
      await assertFails(uploadBytes(ref(aliceStorage, SECOND), PDF, { contentType: "application/pdf" }));
      await setAdmission(testEnv, "allow");
    }

    evidenceLabel("STORAGE_EMULATOR", "derivative constraints: binding alone is not enough");
    await setObjectState(testEnv, OBJECT_KEY, "verified");
    await assertFails(
      uploadBytes(ref(aliceStorage, ARBITRARY), THUMB, { contentType: "image/jpeg" })
    );
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`users/alice/grinEvidenceDerivativeKeys/${DERIVATIVE_KEY}`).set({
        schemaVersion: 1,
        derivativeKey: DERIVATIVE_KEY,
        parentObjectKey: OBJECT_KEY,
        evidenceId: "ev_rules",
        ledgerId: "ledger_g2",
        kind: "thumbnail",
        state: "reserved",
      });
    });
    await setObjectState(testEnv, OBJECT_KEY, "uploaded_unverified");
    await assertFails(uploadBytes(ref(aliceStorage, DERIVATIVE), THUMB, { contentType: "image/jpeg" }));
    await setObjectState(testEnv, OBJECT_KEY, "verified");
    await assertSucceeds(
      uploadBytes(ref(aliceStorage, DERIVATIVE), THUMB, { contentType: "image/jpeg" })
    );
    await assertSucceeds(getBytes(ref(aliceStorage, DERIVATIVE)));
    await assertFails(deleteObject(ref(aliceStorage, DERIVATIVE)));
    await assertFails(
      uploadBytes(ref(aliceStorage, DERIVATIVE), Buffer.from("replaced-thumb"), { contentType: "image/jpeg" })
    );

    evidenceLabel("STORAGE_EMULATOR", "newCommands deny keeps retained derivative reads");
    await setAdmission(testEnv, "deny");
    await assertSucceeds(getBytes(ref(aliceStorage, ORIGINAL)));
    await assertSucceeds(getBytes(ref(aliceStorage, DERIVATIVE)));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`users/alice/grinEvidenceDerivativeKeys/${ARBITRARY_DERIVATIVE}`).set({
        schemaVersion: 1,
        derivativeKey: ARBITRARY_DERIVATIVE,
        parentObjectKey: OBJECT_KEY,
        evidenceId: "ev_rules",
        ledgerId: "ledger_g2",
        kind: "preview",
        state: "reserved",
      });
    });
    await assertFails(
      uploadBytes(ref(aliceStorage, ARBITRARY), THUMB, { contentType: "image/jpeg" })
    );
    await setAdmission(testEnv, "allow");

    evidenceLabel("STORAGE_EMULATOR", "client cannot clobber verification metadata");
    await assertFails(
      updateMetadata(ref(aliceStorage, ORIGINAL), { customMetadata: { verified: "true", rawSha256: "abc" } })
    );
    await assertFails(
      uploadBytes(ref(aliceStorage, `users/alice/grinEvidence/${OBJECT_KEY}meta/original`), PDF, {
        contentType: "application/pdf",
        customMetadata: { verified: "true" },
      })
    );

    evidenceLabel("STORAGE_EMULATOR", "business filenames denied");
    await assertFails(
      uploadBytes(ref(aliceStorage, `users/alice/grinEvidence/${OBJECT_KEY}/invoice.pdf`), PDF, {
        contentType: "application/pdf",
      })
    );
    await assertFails(
      uploadBytes(ref(aliceStorage, "users/alice/attachments/receipt_g2/photo.jpg"), Buffer.from("x"), {
        contentType: "image/jpeg",
      })
    );

    evidenceLabel("FIRESTORE_EMULATOR", "client cannot write evidence metadata");
    await assertSucceeds(
      getDoc(doc(aliceDb, "users/alice/goodsEvidenceLedgers/ledger_g2/evidenceObjects/ev_rules"))
    );
    await assertFails(
      updateDoc(doc(aliceDb, "users/alice/goodsEvidenceLedgers/ledger_g2/evidenceObjects/ev_rules"), {
        state: "verified",
      })
    );
    await assertFails(
      getDoc(doc(malloryDb, "users/alice/goodsEvidenceLedgers/ledger_g2/evidenceObjects/ev_rules"))
    );

    console.log("tools/goods-evidence-storage/rules.emulator.test.ts: ok");
  } finally {
    await testEnv.cleanup();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
