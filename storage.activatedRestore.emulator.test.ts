/**
 * Activated Storage rules loaded from the artifact the packet deploys.
 * The emulator project is the one emulators:exec started.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, setDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";

import { activateStorageRestoreRules } from "./src/services/privacy/activatedRestoreRules";
import { ACTIVATED_STORAGE_RULES } from "./src/services/privacy/activationSequence";

async function main() {
  const artifact = readFileSync(resolve(process.cwd(), ACTIVATED_STORAGE_RULES), "utf8");
  assert.equal(artifact, activateStorageRestoreRules(readFileSync(resolve(process.cwd(), "storage.rules"), "utf8")));
  const env = await initializeTestEnvironment({
    projectId: "demo-vyaamikk-storage-activated",
    firestore: { rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8") },
    storage: { rules: artifact },
  });
  const phone = {
    auth_time: 2_000,
    firebase: { sign_in_provider: "phone" as const },
  };
  const custom = {
    auth_time: 2_000,
    firebase: { sign_in_provider: "custom" as const },
    vydOriginAuthTime: 2_000,
  };
  const path = "users/alice/letterhead/logo.png";
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), path), Buffer.from("png"));
    });
    await assert.rejects(getBytes(ref(env.authenticatedContext("alice", { ...phone, authorityWatermark: 7 }).storage(), path)));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "restoreControl", "current"), { closed: false, reconciled: true, watermark: 7 });
    });
    await assert.rejects(getBytes(ref(env.authenticatedContext("alice", phone).storage(), path)));
    await assert.rejects(getBytes(ref(env.authenticatedContext("alice", custom).storage(), path)));
    await assert.rejects(getBytes(ref(env.authenticatedContext("alice", { ...phone, authorityWatermark: 8 }).storage(), path)));
    const opened = await getBytes(ref(env.authenticatedContext("alice", { ...phone, authorityWatermark: 7 }).storage(), path));
    assert.ok(opened.byteLength > 0);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), "restoreControl", "current"));
    });
    await assert.rejects(getBytes(ref(env.authenticatedContext("alice", { ...phone, authorityWatermark: 7 }).storage(), path)));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "restoreControl", "current"), { closed: false, reconciled: true, watermark: 7 });
    });
    const restored = await getBytes(ref(env.authenticatedContext("alice", { ...phone, authorityWatermark: 7 }).storage(), path));
    assert.ok(restored.byteLength > 0);
    await assert.rejects(getBytes(ref(env.authenticatedContext("alice", { ...phone, authorityWatermark: 6 }).storage(), path)));
    console.log("activated storage rules deny the restored gap and admit the rewritten fence");
  } finally {
    await env.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
