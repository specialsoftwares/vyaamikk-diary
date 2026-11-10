/**
 * Proposed billing-reads Firestore rules: owner may read billingDetails and
 * subscriptionBillingHistory; foreign reads and every client write stay denied.
 * Baseline is proposed-consent (sha d5127a76…).
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, type Firestore } from "firebase/firestore";

const PROPOSED = resolve(
  process.cwd(),
  "docs/release/rules-compat/proposed-billing-reads/firestore.rules"
);
const CONSENT_BASELINE = resolve(
  process.cwd(),
  "docs/release/rules-compat/proposed-consent/firestore.rules"
);
const CONSENT_SHA = "d5127a7696118be13e73f328d5bc6dae975c903762a1e1661bfa507ced56c10d";

const OWNER = "owner-a";
const OTHER = "owner-b";

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function asFirestore(db: unknown): Firestore {
  return db as Firestore;
}

async function main(): Promise<void> {
  const consent = readFileSync(CONSENT_BASELINE, "utf8");
  assert.equal(sha256(consent), CONSENT_SHA, "consent baseline sha drifted");
  const proposed = readFileSync(PROPOSED, "utf8");
  assert.equal(proposed.includes("match /subscription/billingDetails"), true);
  assert.equal(proposed.includes("match /subscriptionBillingHistory/{eventId}"), true);
  assert.equal(proposed.includes("processingPurposes"), true);

  const env: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: "demo-vyaamikk-billing-reads-rules",
    firestore: { rules: proposed, host: "127.0.0.1", port: 8080 },
  });

  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = asFirestore(ctx.firestore());
      await setDoc(doc(db, "users", OWNER), { status: "active", uid: OWNER });
      await setDoc(doc(db, "users", OWNER, "subscription", "billingDetails"), {
        billingRecipientName: "Owner",
      });
      await setDoc(doc(db, "users", OWNER, "subscriptionBillingHistory", "evt-1"), {
        type: "purchase",
        occurredAt: 1,
      });
      await setDoc(doc(db, "users", OWNER, "subscription", "status"), {
        plan: "free",
        entitlementActive: false,
      });
    });

    const ownerDb = asFirestore(env.authenticatedContext(OWNER).firestore());
    const otherDb = asFirestore(env.authenticatedContext(OTHER).firestore());

    await assertSucceeds(getDoc(doc(ownerDb, "users", OWNER, "subscription", "billingDetails")));
    await assertSucceeds(
      getDoc(doc(ownerDb, "users", OWNER, "subscriptionBillingHistory", "evt-1"))
    );
    await assertSucceeds(getDoc(doc(ownerDb, "users", OWNER, "subscription", "status")));

    await assertFails(getDoc(doc(otherDb, "users", OWNER, "subscription", "billingDetails")));
    await assertFails(
      getDoc(doc(otherDb, "users", OWNER, "subscriptionBillingHistory", "evt-1"))
    );

    await assertFails(
      setDoc(doc(ownerDb, "users", OWNER, "subscription", "billingDetails"), {
        billingRecipientName: "Hack",
      })
    );
    await assertFails(
      setDoc(doc(ownerDb, "users", OWNER, "subscriptionBillingHistory", "evt-2"), {
        type: "purchase",
        occurredAt: 2,
      })
    );

    console.log("billingReadsRules.emulator.test.ts: ok");
  } finally {
    await env.cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
