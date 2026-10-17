/**
 * Additive GRIN Rules merge vs live-compat proposed artifacts.
 * Not live. Does not deploy. Diary/save/PDF stay on the billing-off compat
 * matchers; GRIN paths are client-read / Admin-write.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, type Firestore } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";

import { __resetCapabilityGuardForTests } from "@/auth/offlineCapabilityGuard";
import type { CustomerCreditRecord } from "@/domain/customerCredit";
import type { PurchaseOrder } from "@/domain/purchaseOrder";
import {
  setCompletedStepsFirestoreForTests,
} from "@/services/records/recordCompletedSteps";
import {
  setPersistentLockFirestoreForTests,
} from "@/services/records/persistentSaveLock";
import { captureAdmissionToken, syncSessionOwnership } from "@/sync/syncSessionOwnership";

import {
  installCompatSaveSeams,
  runCompatProductionSaves,
  uninstallCompatSaveSeams,
} from "./liveRulesCompat.fullSave";

const MERGED_FIRESTORE = resolve(
  process.cwd(),
  "docs/release/rules-compat/proposed-grin/firestore.rules"
);
const MERGED_STORAGE = resolve(
  process.cwd(),
  "docs/release/rules-compat/proposed-grin/storage.rules"
);
const PROPOSED_FIRESTORE = resolve(
  process.cwd(),
  "docs/release/rules-compat/proposed/firestore.rules"
);
const PROPOSED_STORAGE = resolve(
  process.cwd(),
  "docs/release/rules-compat/proposed/storage.rules"
);
const LIVE_FIRESTORE_SHA =
  "b13d52559efd144bfbdd86daf426fd5ce81abceead4c87979cb9cee2d1a25e2c";
const LIVE_STORAGE_SHA =
  "1a912051ba923a0e4ae29fd36b1741bcf0f5879cd53e6d4bd386c9d5a3b717d5";
const MERGED_FIRESTORE_SHA =
  "551203b8b11991fc1d49d42aa6a818fedeca8530654f7505de949b62a1ae298b";
const MERGED_STORAGE_SHA =
  "6b8959929b86ac2eab41fc591dc1fbf5bb03b80a226226d43bf4c8e72391c76b";

let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  ok - ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL - ${name}${detail ? ` (${detail})` : ""}`);
  }
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function installAsyncStoragePolyfill(): void {
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;
  const mem = new Map<string, string>();
  (globalThis as unknown as { window: { localStorage: Storage } }).window = {
    localStorage: {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
      clear: () => mem.clear(),
      get length() {
        return mem.size;
      },
      key: (i: number) => [...mem.keys()][i] ?? null,
    } as Storage,
  };
}

function entryInput(clientRecordId: string) {
  return {
    clientRecordId,
    ueid: "VYD-2026-BILL01",
    entryType: "work_update_issue" as const,
    title: "Compat diary",
    entryDate: Date.now(),
    payload: {
      workDone: "site work",
      issueProblem: null,
      sitePlace: null,
      quantityOutput: null,
      responsiblePerson: null,
      followUpRequired: false,
    },
  };
}

function poInput(clientRecordId: string) {
  return {
    clientRecordId,
    ueid: "VYD-2026-BILL01",
    poDate: Date.now(),
    vendorName: "Acme Supplies Private Limited",
    vendorGstin: "27AAPFU0939F1ZV",
    vendorAddress: "1 Industrial Area",
    buyerName: "Test Buyer",
    buyerAddress: "2 Market Street",
    items: [
      {
        itemName: "Widget",
        descriptionLines: ["Grade A"],
        quantity: 2,
        unit: "pcs",
        rate: 500,
        taxRate: 18,
        amount: 1000,
      },
    ],
    total: 1180,
  };
}

function creditInput(clientRecordId: string) {
  return {
    clientRecordId,
    ueid: "VYD-2026-BILL01",
    saleDate: Date.now(),
    mode: "credit" as const,
    customerName: "Ravi Kumar",
    customerMobile: "+919876543210",
    products: [
      {
        productName: "Phone",
        brandModel: "A1",
        serialImei: null,
        saleAmount: 10000,
        invoiceNumber: null,
      },
    ],
    saleAmount: 10000,
    schedule: [],
    payments: [],
  };
}

function packInput(clientRecordId: string) {
  return {
    clientRecordId,
    ueid: "VYD-2026-BILL01" as const,
    professionalCategory: "ca_tax" as const,
    matterType: "gst_return_support" as const,
    title: "GST return support pack",
    facts: { period: "2026-09", notes: "brief" },
    matterDate: Date.now(),
  };
}

function parsePo(id: string, raw: Record<string, unknown>): PurchaseOrder {
  return { ...(raw as object), id } as PurchaseOrder;
}
function parseCredit(id: string, raw: Record<string, unknown>): CustomerCreditRecord {
  return { ...(raw as object), id } as CustomerCreditRecord;
}

async function seedUser(
  env: Awaited<ReturnType<typeof initializeTestEnvironment>>,
  uid: string,
  status = "active"
): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users", uid), {
      uid,
      ueid: "VYD-2026-BILL01",
      phoneE164: "+919999999991",
      status,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      displayName: "Merged User",
    });
  });
}

async function main() {
  installAsyncStoragePolyfill();
  const mergedFs = readFileSync(MERGED_FIRESTORE, "utf8");
  const mergedSt = readFileSync(MERGED_STORAGE, "utf8");
  const proposedFs = readFileSync(PROPOSED_FIRESTORE, "utf8");
  const proposedSt = readFileSync(PROPOSED_STORAGE, "utf8");
  const liveFs = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");
  const liveSt = readFileSync(resolve(process.cwd(), "storage.rules"), "utf8");
  const firebaseJson = readFileSync(resolve(process.cwd(), "firebase.json"), "utf8");

  check("proposed firestore still matches 2026-10-01 live export", sha256(proposedFs) === LIVE_FIRESTORE_SHA);
  check("proposed storage still matches 2026-10-01 live export", sha256(proposedSt) === LIVE_STORAGE_SHA);
  check("merged firestore sha256", sha256(mergedFs) === MERGED_FIRESTORE_SHA);
  check("merged storage sha256", sha256(mergedSt) === MERGED_STORAGE_SHA);
  check("merged firestore keeps diary entries", mergedFs.includes("match /entries/{entryId}"));
  check("merged firestore keeps save locks", mergedFs.includes("match /_saveLocks/{clientRecordId}"));
  check("merged firestore adds GRIN ledgers", mergedFs.includes("match /goodsEvidenceLedgers/{ledgerId}"));
  check("merged storage keeps pdfs", mergedSt.includes("match /users/{userId}/pdfs/{recordId}/{fileName}"));
  check("merged storage adds grinEvidence", mergedSt.includes("match /users/{userId}/grinEvidence/{objectKey}/original"));
  check("repo-root firestore.rules still has no GRIN matchers", !liveFs.includes("goodsEvidence"));
  check("repo-root storage.rules still has no grinEvidence", !liveSt.includes("grinEvidence"));
  check("firebase.json still points at repo-root rules", firebaseJson.includes('"rules": "firestore.rules"') && firebaseJson.includes('"rules": "storage.rules"'));
  check("firebase.json does not point at proposed-grin", !firebaseJson.includes("proposed-grin"));

  const env = await initializeTestEnvironment({
    projectId: "vyd-live-rules-grin-merged",
    firestore: { rules: mergedFs },
    storage: { rules: mergedSt },
  });
  const uid = "grin-merged-owner";
  try {
    await env.clearFirestore();
    await seedUser(env, uid);
    const db = env.authenticatedContext(uid).firestore() as unknown as Firestore;
    const other = env.authenticatedContext("mallory").firestore();
    setPersistentLockFirestoreForTests(db);
    setCompletedStepsFirestoreForTests(db);
    __resetCapabilityGuardForTests({ isOnline: true, lastValidationAt: Date.now() });
    syncSessionOwnership.resetForTests();
    syncSessionOwnership.beginSession(uid);
    captureAdmissionToken();

    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", uid, "subscription", "status"), {
        plan: "free",
        billingStatus: "expired",
        entitlementActive: false,
        entitlementReason: "neverSubscribed",
        quotaEnforcementEnabled: false,
        updatedAt: Date.now(),
        updatedBy: "admin",
      });
    });

    try {
      await installCompatSaveSeams({ db, parsePo, parseCredit });
      await runCompatProductionSaves({
        uid,
        db,
        check,
        entryInput,
        poInput,
        creditInput,
        packInput,
      });
    } finally {
      uninstallCompatSaveSeams();
    }

    const admissionRef = doc(db, "users", uid, "goodsEvidenceAdmission", "runtime");
    await assertFails(
      setDoc(admissionRef, { schemaVersion: 1, newCommands: "allow", reconciliation: "allow" })
    );
    check("owner cannot write GRIN admission", true);

    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", uid, "goodsEvidenceAdmission", "runtime"), {
        schemaVersion: 1,
        newCommands: "allow",
        reconciliation: "allow",
      });
      await setDoc(doc(ctx.firestore(), "users", uid, "goodsEvidenceLedgers", "ledger_1"), {
        ownerUid: uid,
        status: "active",
      });
      await setDoc(
        doc(ctx.firestore(), "users", uid, "goodsEvidenceLedgers", "ledger_1", "receipts", "grcp_1"),
        { receiptId: "grcp_1" }
      );
    });

    const admission = await getDoc(admissionRef);
    check("owner can read seeded GRIN admission", admission.exists());
    const receipt = await getDoc(
      doc(db, "users", uid, "goodsEvidenceLedgers", "ledger_1", "receipts", "grcp_1")
    );
    check("active owner can read GRIN receipt", receipt.exists());
    await assertFails(
      setDoc(doc(db, "users", uid, "goodsEvidenceLedgers", "ledger_1", "commands", "cmd_1"), {
        commandId: "cmd_1",
      })
    );
    check("owner cannot write GRIN commands", true);
    await assertFails(
      getDoc(doc(other, "users", uid, "goodsEvidenceLedgers", "ledger_1", "receipts", "grcp_1"))
    );
    check("cross-owner GRIN receipt read denied", true);

    await seedUser(env, "pending_user", "pending_deletion");
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "pending_user", "goodsEvidenceLedgers", "ledger_1"), {
        ownerUid: "pending_user",
        status: "active",
      });
      await setDoc(
        doc(
          ctx.firestore(),
          "users",
          "pending_user",
          "goodsEvidenceLedgers",
          "ledger_1",
          "receipts",
          "grcp_p"
        ),
        { receiptId: "grcp_p" }
      );
    });
    const pendingDb = env.authenticatedContext("pending_user").firestore();
    await assertFails(
      getDoc(doc(pendingDb, "users", "pending_user", "goodsEvidenceLedgers", "ledger_1", "receipts", "grcp_p"))
    );
    check("pending_deletion cannot read GRIN receipts", true);

    const alice = env.authenticatedContext(uid);
    const mallory = env.authenticatedContext("mallory");
    await assertSucceeds(
      uploadBytes(ref(alice.storage(), `users/${uid}/letterhead/logo.png`), Buffer.from("png"), {
        contentType: "image/png",
      })
    );
    check("owner can write letterhead on merged storage", true);
    await assertSucceeds(
      uploadBytes(ref(alice.storage(), `users/${uid}/pdfs/rec1/doc.pdf`), Buffer.from("%PDF-1.4"), {
        contentType: "application/pdf",
      })
    );
    check("owner can write diary PDF on merged storage", true);
    await assertSucceeds(getBytes(ref(alice.storage(), `users/${uid}/pdfs/rec1/doc.pdf`)));
    check("owner can read diary PDF on merged storage", true);
    await assertFails(getBytes(ref(mallory.storage(), `users/${uid}/pdfs/rec1/doc.pdf`)));
    check("cross-owner diary PDF denied", true);
    await assertFails(
      uploadBytes(ref(alice.storage(), `users/${uid}/grinEvidence/obj1/original`), Buffer.from("%PDF-1.4"), {
        contentType: "application/pdf",
      })
    );
    check("GRIN original create without reservation denied", true);
  } finally {
    setPersistentLockFirestoreForTests(null);
    setCompletedStepsFirestoreForTests(null);
    await env.cleanup();
  }

  if (failures > 0) {
    console.error(`LIVE_RULES_GRIN_MERGED FAIL ${failures}`);
    process.exit(1);
  }
  console.log("LIVE_RULES_GRIN_MERGED PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
