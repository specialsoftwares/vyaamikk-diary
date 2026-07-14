/**
 * Firestore production rules — emulator test suite.
 *
 * Run: npm run test:firestore-rules
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const PROJECT_ID = "vyaamikk-diary-rules-test";
const RULES_PATH = resolve(process.cwd(), "firestore.rules");

let testEnv: RulesTestEnvironment;

function authedDb(uid: string) {
  return testEnv.authenticatedContext(uid).firestore();
}

function unauthedDb() {
  return testEnv.unauthenticatedContext().firestore();
}

async function seedUser(
  uid: string,
  patch: Record<string, unknown> = {}
): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", uid), {
      uid,
      ueid: "VYD-2026-TEST01",
      phoneE164: "+919999999999",
      status: "active",
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      displayName: "Test User",
      ...patch,
    });
  });
}

let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ok - ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL - ${name}${detail ? ` (${detail})` : ""}`);
  }
}

async function main() {
  console.log("firestore.rules emulator tests");

  const rules = readFileSync(RULES_PATH, "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  });

  try {
    // --- Unauthenticated access ---
    await assertFails(getDoc(doc(unauthedDb(), "users", "alice")));
    check("unauthenticated read users denied", true);

    // --- Own-user read ---
    await seedUser("alice");
    await assertSucceeds(getDoc(doc(authedDb("alice"), "users", "alice")));
    check("own profile read allowed", true);

    // --- Cross-user denial ---
    await seedUser("bob");
    await assertFails(getDoc(doc(authedDb("alice"), "users", "bob")));
    check("cross-user profile read denied", true);

    // --- Forged profile creation ---
    await assertFails(
      setDoc(doc(authedDb("alice"), "users", "alice"), {
        uid: "alice",
        ueid: "VYD-FORGE",
        phoneE164: "+911111111111",
        status: "active",
      })
    );
    check("client profile create denied", true);

    // --- Protected-field update (status) ---
    await assertFails(
      updateDoc(doc(authedDb("alice"), "users", "alice"), {
        status: "deleted",
        updatedAt: Date.now(),
      })
    );
    check("protected status update denied", true);

    await assertFails(
      updateDoc(doc(authedDb("alice"), "users", "alice"), {
        ueid: "VYD-HACKED",
        updatedAt: Date.now(),
      })
    );
    check("protected ueid update denied", true);

    // --- Safe profile patch ---
    await assertSucceeds(
      updateDoc(doc(authedDb("alice"), "users", "alice"), {
        displayName: "Alice Updated",
        lastActiveAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    check("safe profile patch allowed", true);

    // --- Deletion request (active -> pending_deletion) ---
    await assertSucceeds(
      updateDoc(doc(authedDb("alice"), "users", "alice"), {
        status: "pending_deletion",
        deletionRequestedAt: Date.now(),
        deletionScheduledFor: Date.now() + 86_400_000,
        deletionCompletedAt: null,
        retiredUeid: false,
        updatedAt: Date.now(),
      })
    );
    check("deletion request patch allowed", true);

    // --- Deletion-pending business write denial ---
    await assertFails(
      setDoc(doc(authedDb("alice"), "users", "alice", "entries", "e1"), {
        userId: "alice",
        title: "Blocked entry",
      })
    );
    check("deletion-pending entry create denied", true);

    // --- Active user business write ---
    await seedUser("carol");
    await assertSucceeds(
      setDoc(doc(authedDb("carol"), "users", "carol", "entries", "e1"), {
        userId: "carol",
        title: "Valid entry",
      })
    );
    check("active user entry create allowed", true);

    // --- Reverse-index denial ---
    await assertFails(
      setDoc(doc(authedDb("carol"), "phoneIndex", "+919999999999"), { uid: "carol" })
    );
    check("phoneIndex client write denied", true);

    // --- Counter increment ---
    await assertSucceeds(
      setDoc(doc(authedDb("carol"), "users", "carol", "counters", "customerCredit"), {
        next: 1,
        updatedAt: Date.now(),
      })
    );
    await assertSucceeds(
      updateDoc(doc(authedDb("carol"), "users", "carol", "counters", "customerCredit"), {
        next: 2,
        updatedAt: Date.now(),
      })
    );
    check("counter monotonic increment allowed", true);

    await assertFails(
      updateDoc(doc(authedDb("carol"), "users", "carol", "counters", "customerCredit"), {
        next: 1,
        updatedAt: Date.now(),
      })
    );
    check("counter rollback denied", true);

    // --- Cash Paid FY rollover ---
    await assertSucceeds(
      setDoc(doc(authedDb("carol"), "users", "carol", "counters", "cashPaidVouchers"), {
        currentYear: "FY2425",
        count: 1,
        updatedAt: Date.now(),
      })
    );
    await assertSucceeds(
      updateDoc(doc(authedDb("carol"), "users", "carol", "counters", "cashPaidVouchers"), {
        currentYear: "FY2526",
        count: 1,
        updatedAt: Date.now(),
      })
    );
    check("cash paid FY rollover allowed", true);

    // --- Save lock transitions ---
    await assertSucceeds(
      setDoc(doc(authedDb("carol"), "users", "carol", "_saveLocks", "rec-1"), {
        clientRecordId: "rec-1",
        idempotencyKey: "key-1",
        userId: "carol",
        recordKind: "business_entry",
        status: "in_flight",
        startedAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      })
    );
    await assertSucceeds(
      updateDoc(doc(authedDb("carol"), "users", "carol", "_saveLocks", "rec-1"), {
        status: "done",
        completedAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    check("save lock in_flight -> done allowed", true);

    await assertFails(
      setDoc(doc(authedDb("carol"), "users", "carol", "_saveLocks", "rec-bad"), {
        clientRecordId: "rec-bad",
        userId: "carol",
        status: "done",
        startedAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      })
    );
    check("invalid save-lock create status denied", true);

    // --- Trusted device non-authoritative registry ---
    await assertSucceeds(
      setDoc(doc(authedDb("carol"), "users", "carol", "trustedDevices", "device-1"), {
        userId: "carol",
        ueid: "VYD-2026-TEST01",
        deviceInstallationId: "device-1",
        platform: "ios",
        firstSeenAt: Date.now(),
        lastSeenAt: Date.now(),
        lastLoginAt: Date.now(),
        status: "active",
      })
    );
    await assertFails(
      updateDoc(doc(authedDb("carol"), "users", "carol", "trustedDevices", "device-1"), {
        ueid: "VYD-HACKED",
        lastSeenAt: Date.now(),
      })
    );
    check("trusted device ueid tamper denied", true);

    // --- Legacy profile without explicit status (defaults active) ---
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "users", "legacy"), {
        uid: "legacy",
        ueid: "VYD-LEGACY01",
        phoneE164: "+918888888888",
        createdAt: 1_600_000_000_000,
        updatedAt: 1_600_000_000_000,
      });
    });
    await assertSucceeds(
      setDoc(doc(authedDb("legacy"), "users", "legacy", "entries", "legacy-e1"), {
        userId: "legacy",
        title: "Legacy entry",
      })
    );
    check("legacy profile without status can write business data", true);
  } finally {
    await testEnv.cleanup();
  }

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all firestore.rules tests passed");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
