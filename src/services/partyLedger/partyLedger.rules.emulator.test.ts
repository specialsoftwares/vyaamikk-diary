/**
 * FIRESTORE_EMULATOR. Owner read, client write denied.
 * Does not deploy rules.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

const PROJECT_ID = "vyaamikk-diary-rules-test";

async function main(): Promise<void> {
  const rules = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  });
  try {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "users", "owner-a"), {
        uid: "owner-a",
        ueid: "VYD-2026-TEST01",
        phoneE164: "+919999999999",
        status: "active",
        ageEligibility: "eligible",
        createdAt: 1,
        updatedAt: 1,
      });
      await setDoc(doc(db, "users", "owner-a", "partyLedgerBuckets", "bucket-1"), {
        ownerUid: "owner-a",
        bucketKey: "owner-a\u001fparty-a\u001f2026-10-01",
        totals: { cashPaidMinor: "2000", cashReceivedMinor: "0", receivableMinor: "0", payableMinor: "0" },
      });
    });

    const owner = testEnv.authenticatedContext("owner-a").firestore();
    const other = testEnv.authenticatedContext("owner-b").firestore();
    const bucket = doc(owner, "users", "owner-a", "partyLedgerBuckets", "bucket-1");
    const read = await getDoc(bucket);
    if (!read.exists()) throw new Error("owner read failed");

    await assertFails(
      setDoc(doc(owner, "users", "owner-a", "partyLedgerBuckets", "bucket-1"), {
        totals: { cashPaidMinor: "999999" },
      })
    );
    await assertFails(
      setDoc(doc(owner, "users", "owner-a", "partyLedgerProjections", "proj-1"), {
        totals: { cashPaidMinor: "1" },
      })
    );
    await assertFails(getDoc(doc(other, "users", "owner-a", "partyLedgerBuckets", "bucket-1")));
    await assertFails(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), "users", "owner-a", "partyLedgerBuckets", "bucket-1"))
    );

    await assertSucceeds(
      setDoc(doc(owner, "users", "owner-a", "entries", "old-client-1"), {
        userId: "owner-a",
        title: "Cash paid",
        entryType: "business_cash_given",
      })
    );
    console.log("partyLedger.rules.emulator.test.ts ok");
  } finally {
    await testEnv.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
