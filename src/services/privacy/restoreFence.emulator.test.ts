/**
 * A closed restore fence denies every token, including one minted before
 * authorityWatermark existed. Required mode is an admin document, not the
 * token's age. Synthetic emulator only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

async function canRead(env: RulesTestEnvironment, uid: string, claims?: Record<string, unknown>): Promise<boolean> {
  const db = env.authenticatedContext(uid, {
    auth_time: 100,
    firebase: { sign_in_provider: "phone" },
    ...claims,
  }).firestore();
  try {
    return (await getDoc(doc(db, "users", uid, "entries", "legacy-entry"))).exists();
  } catch {
    return false;
  }
}

async function main() {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/);
  const env = await initializeTestEnvironment({
    projectId: "demo-vyaamikk-restore-review",
    firestore: { rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8") },
  });
  const uid = "synthetic-restored-owner";
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "users", uid), { uid, status: "active", ageEligibility: "eligible", updatedAt: 10 });
      await setDoc(doc(db, "users", uid, "entries", "legacy-entry"), {
        userId: uid,
        title: "synthetic restored private text",
        updatedAt: 10,
      });
    });
    assert.equal(await canRead(env, uid), true, "compatibility mode allows a token without a watermark");

    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "restoreControl", "current"), { closed: true, watermark: 7 });
    });
    const unmarkedClosed = await canRead(env, uid);
    const markedClosed = await canRead(env, uid, { authorityWatermark: 7 });
    assert.equal(unmarkedClosed, false, "a closed fence denies a token without authorityWatermark");
    assert.equal(markedClosed, false, "a closed fence denies a token whose watermark matches");

    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "restoreControl", "current"), { closed: false, reconciled: false, watermark: 7 });
      await setDoc(doc(db, "restoreControl", "mode"), { required: true });
    });
    assert.equal(await canRead(env, uid), false, "required mode denies a missing watermark claim");
    assert.equal(await canRead(env, uid, { authorityWatermark: 7 }), false, "required mode denies an unreconciled fence");

    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "restoreControl", "current"), { closed: false, reconciled: true, watermark: 7 });
    });
    assert.equal(await canRead(env, uid, { authorityWatermark: 8 }), false, "required mode denies a stale watermark");
    assert.equal(await canRead(env, uid, { authorityWatermark: 7 }), true, "a reconciled fence admits the matching watermark");
    assert.equal(await canRead(env, uid, { authorityWatermark: 7, erased: true }), false, "an erased claim stays denied");
    console.log("restore fence: closed and required modes deny unmarked tokens until reconciliation");
  } finally {
    await env.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
