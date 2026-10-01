/**
 * STORAGE_EMULATOR + FIRESTORE_EMULATOR rules tests for G2 Wave 1.
 * Isolated rules only. Not live IAM. Do not deploy.
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
const ORIGINAL = `users/alice/grinEvidence/${OBJECT_KEY}/original`;
const DERIVATIVE = `users/alice/grinEvidence/${OBJECT_KEY}/derivatives/cccccccccccccccccccccccccccccccc`;
const PDF = Buffer.from("%PDF-1.4 g2-original");

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
      await ctx.firestore().doc("users/alice/goodsEvidenceLedgers/ledger_g2/evidenceObjects/ev_rules").set({
        schemaVersion: 1,
        state: "uploaded_unverified",
        claimedSha256: "a".repeat(64),
      });
    });

    const aliceStorage = testEnv.authenticatedContext("alice").storage();
    const malloryStorage = testEnv.authenticatedContext("mallory").storage();
    const anonStorage = testEnv.unauthenticatedContext().storage();
    const aliceDb = testEnv.authenticatedContext("alice").firestore();
    const malloryDb = testEnv.authenticatedContext("mallory").firestore();

    evidenceLabel("STORAGE_EMULATOR", "owner create/read original; cross-owner and anon denied");
    await assertSucceeds(
      uploadBytes(ref(aliceStorage, ORIGINAL), PDF, { contentType: "application/pdf" })
    );
    await assertSucceeds(getBytes(ref(aliceStorage, ORIGINAL)));
    await assertFails(getBytes(ref(malloryStorage, ORIGINAL)));
    await assertFails(getBytes(ref(anonStorage, ORIGINAL)));

    evidenceLabel("STORAGE_EMULATOR", "overwrite and delete denied");
    await assertFails(
      uploadBytes(ref(aliceStorage, ORIGINAL), Buffer.from("%PDF-1.4 replaced"), {
        contentType: "application/pdf",
      })
    );
    await assertFails(deleteObject(ref(aliceStorage, ORIGINAL)));

    evidenceLabel("STORAGE_EMULATOR", "unauthorized metadata edits denied");
    await assertFails(
      updateMetadata(ref(aliceStorage, ORIGINAL), { customMetadata: { verified: "true", rawSha256: "abc" } })
    );
    await assertFails(
      uploadBytes(ref(aliceStorage, `users/alice/grinEvidence/${OBJECT_KEY}meta/original`), PDF, {
        contentType: "application/pdf",
        customMetadata: { verified: "true" },
      })
    );

    evidenceLabel("STORAGE_EMULATOR", "derivative path is separate; business filenames denied");
    await assertSucceeds(
      uploadBytes(ref(aliceStorage, DERIVATIVE), Buffer.from("thumb"), { contentType: "image/jpeg" })
    );
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
