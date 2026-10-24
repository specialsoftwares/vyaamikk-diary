/**
 * Activated Storage rules on their own emulator project. A second project
 * inside the pre-activation storage suite does not share that emulator.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, setDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";

import { activateStorageRestoreRules } from "./src/services/privacy/activatedRestoreRules";

async function main() {
  assert.match(process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? process.env.STORAGE_EMULATOR_HOST ?? "present", /.*/);
  const env = await initializeTestEnvironment({
    projectId: "demo-vyaamikk-storage-activated",
    firestore: { rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8") },
    storage: { rules: activateStorageRestoreRules(readFileSync(resolve(process.cwd(), "storage.rules"), "utf8")) },
  });
  const claims = {
    auth_time: 2_000,
    firebase: { sign_in_provider: "phone" as const },
    authorityWatermark: 7,
  };
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), "users/alice/letterhead/logo.png"), Buffer.from("png"));
    });
    await assert.rejects(getBytes(ref(env.authenticatedContext("alice", claims).storage(), "users/alice/letterhead/logo.png")));
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "restoreControl", "current"), { closed: false, reconciled: true, watermark: 7 });
      await setDoc(doc(db, "restoreControl", "mode"), { required: true });
    });
    const opened = await getBytes(ref(env.authenticatedContext("alice", claims).storage(), "users/alice/letterhead/logo.png"));
    assert.ok(opened.byteLength > 0);
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await deleteDoc(doc(db, "restoreControl", "current"));
      await deleteDoc(doc(db, "restoreControl", "mode"));
    });
    await assert.rejects(getBytes(ref(env.authenticatedContext("alice", claims).storage(), "users/alice/letterhead/logo.png")));
    console.log("activated storage rules deny the restored gap and admit the rewritten fence");
  } finally {
    await env.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
