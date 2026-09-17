/**
 * Firestore production rules — BILLING emulator test suite (Phase A).
 *
 * Runs inside the same `npm run test:firestore-rules` emulator session as
 * firestore.rules.test.ts (see package.json), against the REAL rules engine:
 *
 *   firebase emulators:exec --only firestore ...
 *     "npx tsx firestore.rules.test.ts && npx tsx firestore.rules.billing.test.ts"
 *
 * Proves, among others, the eleven owner-specified Option-C quota security
 * cases (spec §13): a billable record CREATE and its usageCurrent transition
 * are only valid together, atomically, exactly once, within plan caps, with a
 * server-derived IST month key.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

import { istMonthKeyForMillis } from "./functions/src/billing/istMonthKey";

const PROJECT_ID = "vyaamikk-diary-billing-rules-test";
const RULES_PATH = resolve(process.cwd(), "firestore.rules");

let testEnv: RulesTestEnvironment;

// rules-unit-testing returns the compat-typed Firestore; the modular API
// (doc/setDoc/writeBatch) interops with it at runtime (emulator-proven), so
// cast once here to keep the modular types end-to-end.
function authedDb(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

function unauthedDb(): Firestore {
  return testEnv.unauthenticatedContext().firestore() as unknown as Firestore;
}

async function seedUser(uid: string, patch: Record<string, unknown> = {}): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users", uid), {
      uid,
      ueid: "VYD-2026-BILL01",
      phoneE164: "+919999999999",
      status: "active",
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      displayName: "Billing Test User",
      ...patch,
    });
  });
}

async function seedSubscriptionStatus(
  uid: string,
  patch: Record<string, unknown> = {}
): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users", uid, "subscription", "status"), {
      plan: "free",
      billingStatus: "active",
      entitlementActive: true,
      entitlementReason: "neverSubscribed",
      quotaEnforcementEnabled: false,
      updatedAt: Date.now(),
      updatedBy: "admin",
      ...patch,
    });
  });
}

async function seedUsage(uid: string, data: Record<string, unknown>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users", uid, "subscription", "usageCurrent"), data);
  });
}

/** One atomic batch: create a purchase order + apply a usage transition. */
function poWithUsageBatch(
  db: Firestore,
  uid: string,
  poId: string,
  usage: Record<string, unknown>
) {
  const batch = writeBatch(db);
  batch.set(doc(db, "users", uid, "purchaseOrders", poId), {
    userId: uid,
    vendorName: "Batch Vendor",
    createdAt: Date.now(),
  });
  batch.set(doc(db, "users", uid, "subscription", "usageCurrent"), usage);
  return batch;
}

function entryWithUsageBatch(
  db: Firestore,
  uid: string,
  entryId: string,
  usage: Record<string, unknown>
) {
  const batch = writeBatch(db);
  batch.set(doc(db, "users", uid, "entries", entryId), {
    userId: uid,
    title: "Diary entry",
    createdAt: Date.now(),
  });
  batch.set(doc(db, "users", uid, "subscription", "usageCurrent"), usage);
  return batch;
}

function letterheadWithUsageBatch(
  db: Firestore,
  uid: string,
  docId: string,
  usage: Record<string, unknown>
) {
  const batch = writeBatch(db);
  batch.set(doc(db, "users", uid, "letterheadDocs", docId), {
    userId: uid,
    title: "Letter",
    createdAt: Date.now(),
  });
  batch.set(doc(db, "users", uid, "subscription", "usageCurrent"), usage);
  return batch;
}

function usageDoc(
  monthKey: string,
  recordsThisMonth: number,
  lastRecordId: string,
  lastRecordCollection = "purchaseOrders"
): Record<string, unknown> {
  return {
    monthKey,
    recordsThisMonth,
    lastRecordCollection,
    lastRecordId,
    updatedAt: Date.now(),
  };
}

function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  const mm = d.getUTCMonth() + 1;
  return `${d.getUTCFullYear()}-${mm < 10 ? `0${mm}` : mm}`;
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
  console.log("firestore.rules billing emulator tests");

  const rules = readFileSync(RULES_PATH, "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  });
  await testEnv.clearFirestore();

  // The rules derive the IST month from request.time; this mirror (proven at
  // the exact owner-required boundaries in istMonthKey.unit.test.ts) must
  // agree with the rules expression for the allow-cases below to pass.
  const monthNow = istMonthKeyForMillis(Date.now());
  const monthPrev = shiftMonthKey(monthNow, -1);
  const monthNext = shiftMonthKey(monthNow, +1);

  try {
    // ================= subscription/status (server-authoritative) ========
    await seedUser("alice");
    await seedSubscriptionStatus("alice", { plan: "starter", entitlementActive: true });

    await assertSucceeds(
      getDoc(doc(authedDb("alice"), "users", "alice", "subscription", "status"))
    );
    check("owner reads own subscription status", true);

    await seedUser("mallory");
    await assertFails(
      getDoc(doc(authedDb("mallory"), "users", "alice", "subscription", "status"))
    );
    check("cross-user subscription status read denied", true);

    await assertFails(
      getDoc(doc(unauthedDb(), "users", "alice", "subscription", "status"))
    );
    check("unauthenticated subscription status read denied", true);

    // Case 10 — forged Professional plan written by client: impossible.
    await assertFails(
      setDoc(doc(authedDb("mallory"), "users", "mallory", "subscription", "status"), {
        plan: "professional",
        billingStatus: "active",
        entitlementActive: true,
        quotaEnforcementEnabled: false,
        updatedAt: Date.now(),
        updatedBy: "admin",
      })
    );
    check("case 10: client-forged professional status create denied", true);

    await assertFails(
      updateDoc(doc(authedDb("alice"), "users", "alice", "subscription", "status"), {
        plan: "business",
        entitlementActive: true,
      })
    );
    check("owner status update denied", true);

    await assertFails(
      deleteDoc(doc(authedDb("alice"), "users", "alice", "subscription", "status"))
    );
    check("owner status delete denied", true);

    // ================= usageCurrent reads + standalone mutations ==========
    await seedUsage("alice", usageDoc(monthNow, 3, "seed-po"));
    await assertSucceeds(
      getDoc(doc(authedDb("alice"), "users", "alice", "subscription", "usageCurrent"))
    );
    check("owner reads own usageCurrent", true);

    await assertFails(
      getDoc(doc(authedDb("mallory"), "users", "alice", "subscription", "usageCurrent"))
    );
    check("cross-user usageCurrent read denied", true);

    await assertFails(
      deleteDoc(doc(authedDb("alice"), "users", "alice", "subscription", "usageCurrent"))
    );
    check("usageCurrent delete denied", true);

    // ================= billing history (owner read-only) ==================
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "users", "alice", "subscriptionBillingHistory", "evt-1"),
        {
          type: "trialStarted",
          occurredAt: Date.now(),
          planAfter: "professional",
          billingStatusAfter: "trial",
          platform: null,
          canonicalSku: null,
          amountInPaise: null,
          currency: null,
        }
      );
    });
    await assertSucceeds(
      getDoc(doc(authedDb("alice"), "users", "alice", "subscriptionBillingHistory", "evt-1"))
    );
    check("owner reads own billing history", true);

    await assertFails(
      getDoc(doc(authedDb("mallory"), "users", "alice", "subscriptionBillingHistory", "evt-1"))
    );
    check("cross-user billing history read denied", true);

    await assertFails(
      setDoc(doc(authedDb("alice"), "users", "alice", "subscriptionBillingHistory", "evt-2"), {
        type: "purchaseActivated",
        occurredAt: Date.now(),
        planAfter: "business",
        billingStatusAfter: "active",
      })
    );
    check("client billing history create denied", true);

    await assertFails(
      updateDoc(
        doc(authedDb("alice"), "users", "alice", "subscriptionBillingHistory", "evt-1"),
        { planAfter: "business" }
      )
    );
    check("client billing history update denied", true);

    // ================= server-only top-level collections ==================
    const serverOnlyDocs: Array<[string, string]> = [
      ["_companyBilling", "alice"], // even the "owning" uid gets no access
      ["_subscriptionAuditLog", "evt-1"],
      ["_processedBillingEvents", "idem-1"],
      ["_billingEventLedger", "GPA.1234-5678"],
      ["_revenueReports", monthNow],
      ["_trialLedger", "a".repeat(64)],
      ["_billingRateLimits", "purchase_alice_202609121600"],
      ["_playAccountIndex", "obfuscated-account-id-hex"],
      ["_playCredentialIndex", "a".repeat(64)],
      ["_appStoreAccountByUid", "alice"],
      ["_appStoreAccountIndex", "11111111-1111-4111-8111-111111111111"],
      ["_appStoreFinancialReview", "ios:refund-reversed:2001"],
      ["_billingReconciliationQueue", "android:refund-reconcile:GPA.1234"],
      ["_subscriptionInvoices", "inv_v1_test"],
      ["_subscriptionCreditNotes", "cn_v1_test"],
      ["_subscriptionTaxCompliance", "inv_v1_test"],
      ["_invoiceCounters", "2026-27"],
      ["_creditNoteCounters", "2026-27"],
      ["_invoiceRetryQueue", "inv_v1_test"],
      ["_gstr1FilingBatches", "gstr1batch_test"],
      ["_gstr1ReportManifests", "gstr1_2026-09_test"],
    ];
    for (const [coll, id] of serverOnlyDocs) {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), coll, id), { seeded: true, updatedAt: Date.now() });
      });
      await assertFails(getDoc(doc(authedDb("alice"), coll, id)));
      await assertFails(
        setDoc(doc(authedDb("alice"), coll, `${id}-w`), { forged: true })
      );
      await assertFails(getDoc(doc(unauthedDb(), coll, id)));
      check(`${coll} client read+write denied`, true);
    }

    // ================= billingDetails (owner read, client write denied) ===
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "alice", "subscription", "billingDetails"), {
        gstin: null,
        gstinVerificationStatus: "not_provided",
        updatedAt: Date.now(),
      });
    });
    await assertSucceeds(
      getDoc(doc(authedDb("alice"), "users", "alice", "subscription", "billingDetails"))
    );
    check("owner reads own billingDetails", true);

    await assertFails(
      getDoc(doc(authedDb("mallory"), "users", "alice", "subscription", "billingDetails"))
    );
    check("cross-user billingDetails read denied", true);

    await assertFails(
      setDoc(doc(authedDb("alice"), "users", "alice", "subscription", "billingDetails"), {
        gstin: "27AAAAA0000A1Z5",
        gstinVerificationStatus: "verified",
        updatedAt: Date.now(),
      })
    );
    check("owner billingDetails write denied", true);

    await assertFails(
      setDoc(doc(unauthedDb(), "users", "alice", "subscription", "billingDetails"), {
        gstin: null,
        updatedAt: Date.now(),
      })
    );
    check("unauthenticated billingDetails write denied", true);

    // ================= preferences/billingUx (narrow client write) ========
    // benefitScreenShownAt is a one-time marker: create establishes it, any
    // later change is denied; only updatedAt metadata stays mutable.
    const benefitMarker = Date.now();
    await assertSucceeds(
      setDoc(doc(authedDb("alice"), "users", "alice", "preferences", "billingUx"), {
        benefitScreenShownAt: benefitMarker,
        updatedAt: benefitMarker,
      })
    );
    check("billingUx first marker create allowed", true);

    await assertSucceeds(
      updateDoc(doc(authedDb("alice"), "users", "alice", "preferences", "billingUx"), {
        benefitScreenShownAt: benefitMarker,
        updatedAt: benefitMarker + 1,
      })
    );
    check("billingUx updatedAt metadata refresh allowed (marker unchanged)", true);

    await assertFails(
      updateDoc(doc(authedDb("alice"), "users", "alice", "preferences", "billingUx"), {
        benefitScreenShownAt: benefitMarker + 999,
        updatedAt: Date.now(),
      })
    );
    check("billingUx changing benefitScreenShownAt denied (one-time marker)", true);

    await assertFails(
      setDoc(doc(authedDb("alice"), "users", "alice", "preferences", "billingUx"), {
        benefitScreenShownAt: benefitMarker - 12_345,
        updatedAt: Date.now(),
      })
    );
    check("billingUx full-overwrite marker rewrite denied", true);

    await assertFails(
      setDoc(doc(authedDb("alice"), "users", "alice", "preferences", "billingUx"), {
        benefitScreenShownAt: Date.now(),
        updatedAt: Date.now(),
        plan: "professional",
      })
    );
    check("billingUx plan/entitlement smuggling denied", true);

    await assertFails(
      setDoc(doc(authedDb("alice"), "users", "alice", "preferences", "billingUx"), {
        benefitScreenShownAt: "now",
        updatedAt: Date.now(),
      })
    );
    check("billingUx wrong field type denied", true);

    await assertFails(
      setDoc(doc(authedDb("mallory"), "users", "alice", "preferences", "billingUx"), {
        benefitScreenShownAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    check("cross-user billingUx write denied", true);

    await assertFails(
      deleteDoc(doc(authedDb("alice"), "users", "alice", "preferences", "billingUx"))
    );
    check("billingUx delete denied", true);

    // ================= globalStats/paperSaved =============================
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "globalStats", "paperSaved"), {
        pagesSavedEstimated: 120_000,
        treesEstimatedSaved: 12,
        estimateMethodology: "test",
        updatedAt: Date.now(),
      });
      await setDoc(doc(ctx.firestore(), "globalStats", "internalOps"), { secret: true });
    });
    await assertSucceeds(getDoc(doc(unauthedDb(), "globalStats", "paperSaved")));
    await assertSucceeds(getDoc(doc(authedDb("alice"), "globalStats", "paperSaved")));
    check("globalStats/paperSaved public read allowed", true);

    await assertFails(
      updateDoc(doc(authedDb("alice"), "globalStats", "paperSaved"), {
        pagesSavedEstimated: 999_999_999,
      })
    );
    check("globalStats/paperSaved client write denied", true);

    await assertFails(getDoc(doc(authedDb("alice"), "globalStats", "internalOps")));
    check("other globalStats docs default-denied", true);

    // =====================================================================
    // OPTION-C QUOTA PROOF (owner spec §13 cases 1–11)
    // =====================================================================

    // Production safety: no status doc → legacy create path, no quota coupling.
    await seedUser("legacy-nostatus");
    await assertSucceeds(
      setDoc(doc(authedDb("legacy-nostatus"), "users", "legacy-nostatus", "purchaseOrders", "legacy-po"), {
        userId: "legacy-nostatus",
        vendorName: "Legacy Vendor",
        createdAt: Date.now(),
      })
    );
    check("no status doc → plain PO create allowed (production safety)", true);

    // Enforcement flag false: plain create allowed; usage transition refused.
    await seedUser("flag-off");
    await seedSubscriptionStatus("flag-off", { quotaEnforcementEnabled: false });
    await assertSucceeds(
      setDoc(doc(authedDb("flag-off"), "users", "flag-off", "purchaseOrders", "off-po"), {
        userId: "flag-off",
        vendorName: "V",
        createdAt: Date.now(),
      })
    );
    check("quotaEnforcementEnabled=false → plain PO create allowed", true);
    await assertFails(
      poWithUsageBatch(
        authedDb("flag-off"),
        "flag-off",
        "off-po-2",
        usageDoc(monthNow, 1, "off-po-2")
      ).commit()
    );
    check("quotaEnforcementEnabled=false → usage transition refused", true);

    // --- quota-free: free plan (cap 25), enforcement ON -------------------
    await seedUser("quota-free");
    await seedSubscriptionStatus("quota-free", {
      plan: "free",
      entitlementActive: true,
      quotaEnforcementEnabled: true,
    });
    const qf = () => authedDb("quota-free");

    // Case 1 — record create + correct usage increment → ALLOW (first create).
    await assertSucceeds(
      poWithUsageBatch(qf(), "quota-free", "po-1", usageDoc(monthNow, 1, "po-1")).commit()
    );
    check("case 1: create + correct usage transition allowed (count 1)", true);
    // (This success is also the rules↔TS IST month agreement proof: the batch
    // used istMonthKeyForMillis(Date.now()) and the rules recomputed it.)

    await assertSucceeds(
      poWithUsageBatch(qf(), "quota-free", "po-2", usageDoc(monthNow, 2, "po-2")).commit()
    );
    check("case 1b: subsequent create + (+1) transition allowed (count 2)", true);

    // Case 2 — record create WITHOUT usage mutation → DENY.
    await assertFails(
      setDoc(doc(qf(), "users", "quota-free", "purchaseOrders", "po-3"), {
        userId: "quota-free",
        vendorName: "V",
        createdAt: Date.now(),
      })
    );
    check("case 2: create without usage transition denied", true);

    // Case 3 — usage mutation WITHOUT record create → DENY.
    await assertFails(
      setDoc(
        doc(qf(), "users", "quota-free", "subscription", "usageCurrent"),
        usageDoc(monthNow, 3, "po-ghost")
      )
    );
    check("case 3a: standalone usage increment (nonexistent record) denied", true);
    await assertFails(
      setDoc(
        doc(qf(), "users", "quota-free", "subscription", "usageCurrent"),
        usageDoc(monthNow, 3, "po-1")
      )
    );
    check("case 3b: standalone usage increment (pre-existing record) denied", true);

    // Case 4 — record create + increment by 2 → DENY.
    await assertFails(
      poWithUsageBatch(qf(), "quota-free", "po-4", usageDoc(monthNow, 4, "po-4")).commit()
    );
    check("case 4: create + increment-by-2 denied", true);

    // Case 5 — record update/edit consumes nothing.
    await assertSucceeds(
      updateDoc(doc(qf(), "users", "quota-free", "purchaseOrders", "po-1"), {
        userId: "quota-free",
        vendorName: "Edited Vendor",
        updatedAt: Date.now(),
      })
    );
    check("case 5: record edit allowed without usage consumption", true);

    // Case 6 — replay same clientRecordId → no second consumption.
    await assertFails(
      poWithUsageBatch(qf(), "quota-free", "po-1", usageDoc(monthNow, 3, "po-1")).commit()
    );
    check("case 6: replayed create cannot consume again", true);

    // Linkage scope: template config is not a billable collection.
    await assertFails(
      (() => {
        const db = qf();
        const b = writeBatch(db);
        b.set(doc(db, "users", "quota-free", "config", "letterhead"), {
          userId: "quota-free",
          createdAt: Date.now(),
        });
        b.set(
          doc(db, "users", "quota-free", "subscription", "usageCurrent"),
          usageDoc(monthNow, 3, "letterhead", "config")
        );
        return b.commit();
      })()
    );
    check("linkage allowlist: non-linked collection cannot consume quota", true);

    // Entries and letterheadDocs are Option-C linked; template config stays ungated.
    await assertFails(
      setDoc(doc(qf(), "users", "quota-free", "entries", "en-bare"), {
        userId: "quota-free",
        title: "Bare entry",
      })
    );
    check("P entry create without usage denied while enforcement on", true);

    await assertSucceeds(
      entryWithUsageBatch(
        qf(),
        "quota-free",
        "en-1",
        usageDoc(monthNow, 3, "en-1", "entries")
      ).commit()
    );
    check("P entry create + genuine usage transition allowed", true);

    await assertFails(
      entryWithUsageBatch(
        qf(),
        "quota-free",
        "en-2",
        usageDoc(monthNow, 4, "en-1", "entries")
      ).commit()
    );
    check("P two entries cannot share one increment", true);

    await assertSucceeds(
      updateDoc(doc(qf(), "users", "quota-free", "entries", "en-1"), {
        userId: "quota-free",
        title: "Edited diary entry",
        updatedAt: Date.now(),
      })
    );
    check("P entry edit does not consume quota", true);

    await assertFails(
      entryWithUsageBatch(
        qf(),
        "quota-free",
        "en-1",
        usageDoc(monthNow, 4, "en-1", "entries")
      ).commit()
    );
    check("P entry replay cannot consume again", true);

    await seedUser("quota-lh");
    await seedSubscriptionStatus("quota-lh", {
      plan: "free",
      entitlementActive: true,
      quotaEnforcementEnabled: true,
    });
    const qlh = () => authedDb("quota-lh");
    await assertFails(
      setDoc(doc(qlh(), "users", "quota-lh", "letterheadDocs", "lh-bare"), {
        userId: "quota-lh",
        title: "Bare letter",
        createdAt: Date.now(),
      })
    );
    check("LH letterhead create without usage denied while enforcement on", true);

    await assertSucceeds(
      letterheadWithUsageBatch(
        qlh(),
        "quota-lh",
        "lh-1",
        usageDoc(monthNow, 1, "lh-1", "letterheadDocs")
      ).commit()
    );
    check("LH letterhead create + genuine usage transition allowed", true);

    await assertFails(
      letterheadWithUsageBatch(
        qlh(),
        "quota-lh",
        "lh-2",
        usageDoc(monthNow, 2, "lh-1", "letterheadDocs")
      ).commit()
    );
    check("LH two letterheads cannot share one increment", true);

    await assertFails(
      letterheadWithUsageBatch(
        qlh(),
        "quota-lh",
        "lh-ptr",
        usageDoc(monthNow, 2, "lh-ptr", "entries")
      ).commit()
    );
    check("LH usage pointer collection must match letterheadDocs", true);

    await assertSucceeds(
      updateDoc(doc(qlh(), "users", "quota-lh", "letterheadDocs", "lh-1"), {
        userId: "quota-lh",
        title: "Edited letter",
        updatedAt: Date.now(),
      })
    );
    check("LH letterhead edit does not consume quota", true);

    await assertFails(
      letterheadWithUsageBatch(
        qlh(),
        "quota-lh",
        "lh-1",
        usageDoc(monthNow, 2, "lh-1", "letterheadDocs")
      ).commit()
    );
    check("LH letterhead replay cannot consume again", true);

    await seedUser("quota-lh-off");
    await seedSubscriptionStatus("quota-lh-off", { quotaEnforcementEnabled: false });
    await assertSucceeds(
      setDoc(doc(authedDb("quota-lh-off"), "users", "quota-lh-off", "letterheadDocs", "lh-off"), {
        userId: "quota-lh-off",
        title: "Off",
        createdAt: Date.now(),
      })
    );
    check("LH quotaEnforcementEnabled=false → plain letterhead create allowed", true);

    // Case 7 — concurrent creates racing for the final slot (24/25).
    await seedUser("quota-race");
    await seedSubscriptionStatus("quota-race", {
      plan: "free",
      entitlementActive: true,
      quotaEnforcementEnabled: true,
    });
    await seedUsage("quota-race", usageDoc(monthNow, 24, "seed-po"));
    const raceResults = await Promise.allSettled([
      poWithUsageBatch(
        authedDb("quota-race"),
        "quota-race",
        "race-a",
        usageDoc(monthNow, 25, "race-a")
      ).commit(),
      poWithUsageBatch(
        authedDb("quota-race"),
        "quota-race",
        "race-b",
        usageDoc(monthNow, 25, "race-b")
      ).commit(),
    ]);
    const raceWins = raceResults.filter((r) => r.status === "fulfilled").length;
    check(
      "case 7: exactly one concurrent create wins the final slot",
      raceWins === 1,
      `fulfilled=${raceWins}`
    );

    // Case 8 — 25/25 → next create denied (cap and +1 both reject).
    await assertFails(
      poWithUsageBatch(
        authedDb("quota-race"),
        "quota-race",
        "po-26",
        usageDoc(monthNow, 26, "po-26")
      ).commit()
    );
    check("case 8: create beyond free cap (26/25) denied", true);

    // Case 9 — unlimited plan: transition still required, no cap.
    await seedUser("quota-biz");
    await seedSubscriptionStatus("quota-biz", {
      plan: "business",
      entitlementActive: true,
      quotaEnforcementEnabled: true,
    });
    await seedUsage("quota-biz", usageDoc(monthNow, 500, "seed-po"));
    await assertSucceeds(
      poWithUsageBatch(
        authedDb("quota-biz"),
        "quota-biz",
        "po-501",
        usageDoc(monthNow, 501, "po-501")
      ).commit()
    );
    check("case 9: unlimited plan create allowed past free/starter caps", true);

    // Lapsed entitlement falls back to the free cap (starter plan, inactive).
    await seedUser("quota-lapsed");
    await seedSubscriptionStatus("quota-lapsed", {
      plan: "starter",
      entitlementActive: false,
      quotaEnforcementEnabled: true,
    });
    await seedUsage("quota-lapsed", usageDoc(monthNow, 25, "seed-po"));
    await assertFails(
      poWithUsageBatch(
        authedDb("quota-lapsed"),
        "quota-lapsed",
        "po-lapsed",
        usageDoc(monthNow, 26, "po-lapsed")
      ).commit()
    );
    check("lapsed starter entitlement enforces free cap (26/25 denied)", true);

    // Fail-closed on unknown/malformed plans: a corrupted or future status
    // value must NEVER be defaulted upward to unlimited — it gets the free
    // cap of 25 even with entitlementActive == true.
    await seedUser("quota-typo");
    await seedSubscriptionStatus("quota-typo", {
      plan: "proffesional", // deliberate malformed value
      entitlementActive: true,
      quotaEnforcementEnabled: true,
    });
    await seedUsage("quota-typo", usageDoc(monthNow, 25, "seed-po"));
    await assertFails(
      poWithUsageBatch(
        authedDb("quota-typo"),
        "quota-typo",
        "po-typo-26",
        usageDoc(monthNow, 26, "po-typo-26")
      ).commit()
    );
    check("fail-closed: malformed plan 'proffesional' capped at 25 (26 denied)", true);

    await seedUser("quota-unknown");
    await seedSubscriptionStatus("quota-unknown", {
      plan: "enterprise", // unknown future enum value
      entitlementActive: true,
      quotaEnforcementEnabled: true,
    });
    await seedUsage("quota-unknown", usageDoc(monthNow, 25, "seed-po"));
    await assertFails(
      poWithUsageBatch(
        authedDb("quota-unknown"),
        "quota-unknown",
        "po-unk-26",
        usageDoc(monthNow, 26, "po-unk-26")
      ).commit()
    );
    check("fail-closed: unknown plan 'enterprise' capped at 25 (26 denied)", true);

    // Exact 'professional' is unlimited (counterpart of the business case 9).
    await seedUser("quota-pro");
    await seedSubscriptionStatus("quota-pro", {
      plan: "professional",
      entitlementActive: true,
      quotaEnforcementEnabled: true,
    });
    await seedUsage("quota-pro", usageDoc(monthNow, 500, "seed-po"));
    await assertSucceeds(
      poWithUsageBatch(
        authedDb("quota-pro"),
        "quota-pro",
        "po-pro-501",
        usageDoc(monthNow, 501, "po-pro-501")
      ).commit()
    );
    check("exact professional plan unlimited (500→501 allowed)", true);

    // Case 11 — altered monthKey cannot reset or pre-consume quota.
    await seedUser("quota-month");
    await seedSubscriptionStatus("quota-month", {
      plan: "free",
      entitlementActive: true,
      quotaEnforcementEnabled: true,
    });
    await assertFails(
      poWithUsageBatch(
        authedDb("quota-month"),
        "quota-month",
        "pm-1",
        usageDoc(monthPrev, 1, "pm-1")
      ).commit()
    );
    check("case 11a: previous-month monthKey denied", true);
    await assertFails(
      poWithUsageBatch(
        authedDb("quota-month"),
        "quota-month",
        "pm-2",
        usageDoc(monthNext, 1, "pm-2")
      ).commit()
    );
    check("case 11b: future-month monthKey denied", true);

    // Month rollover (lazy, IST): stale stored month resets to 1 with the
    // rules-derived current month — and only with the current month.
    await seedUsage("quota-month", usageDoc(monthPrev, 17, "old-po"));
    await assertSucceeds(
      poWithUsageBatch(
        authedDb("quota-month"),
        "quota-month",
        "pm-3",
        usageDoc(monthNow, 1, "pm-3")
      ).commit()
    );
    check("rollover: stale month resets to count 1 under current IST month", true);

    await seedUsage("quota-month", usageDoc(monthPrev, 17, "old-po"));
    await assertFails(
      poWithUsageBatch(
        authedDb("quota-month"),
        "quota-month",
        "pm-4",
        usageDoc(monthPrev, 18, "pm-4")
      ).commit()
    );
    check("rollover: continuing a stale month (+1 on old monthKey) denied", true);

    await assertFails(
      entryWithUsageBatch(
        qf(),
        "quota-free",
        "en-wrong-ptr",
        usageDoc(monthNow, 4, "en-1", "entries")
      ).commit()
    );
    check("P entry wrong usage pointer denied", true);

    await seedUser("quota-en-cap");
    await seedSubscriptionStatus("quota-en-cap", {
      plan: "free",
      entitlementActive: true,
      quotaEnforcementEnabled: true,
    });
    await seedUsage("quota-en-cap", usageDoc(monthNow, 25, "seed-en", "entries"));
    await assertFails(
      entryWithUsageBatch(
        authedDb("quota-en-cap"),
        "quota-en-cap",
        "en-26",
        usageDoc(monthNow, 26, "en-26", "entries")
      ).commit()
    );
    check("P entry over free cap denied", true);

    await seedUser("quota-en-roll");
    await seedSubscriptionStatus("quota-en-roll", {
      plan: "free",
      entitlementActive: true,
      quotaEnforcementEnabled: true,
    });
    await seedUsage("quota-en-roll", usageDoc(monthPrev, 17, "old-en", "entries"));
    await assertSucceeds(
      entryWithUsageBatch(
        authedDb("quota-en-roll"),
        "quota-en-roll",
        "en-roll",
        usageDoc(monthNow, 1, "en-roll", "entries")
      ).commit()
    );
    check("P entry rollover to current IST month allowed", true);

    await assertFails(
      entryWithUsageBatch(
        authedDb("mallory"),
        "quota-free",
        "en-x",
        usageDoc(monthNow, 4, "en-x", "entries")
      ).commit()
    );
    check("P entry cross-UID create+usage denied", true);

    // Cross-user quota writes are impossible regardless of batch shape.
    await assertFails(
      poWithUsageBatch(
        authedDb("mallory"),
        "quota-free",
        "po-x",
        usageDoc(monthNow, 3, "po-x")
      ).commit()
    );
    check("cross-user create+usage batch denied", true);
  } finally {
    await testEnv.cleanup();
  }

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all firestore.rules billing tests passed");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
