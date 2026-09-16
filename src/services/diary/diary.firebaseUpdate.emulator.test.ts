/**
 * Production `updateDiaryEntryOnDb` against the Firestore emulator.
 * Boundary: Rules unit-testing emulator (not MemorySqlite, not device).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, type Firestore } from "firebase/firestore";

import { createEntryAtomic } from "@/services/diary/atomicCreate";
import { updateDiaryEntryOnDb } from "@/services/diary/firebaseUpdate";
import { AppError } from "@/domain/errors";

const PROJECT_ID = "vyaamikk-diary-diary-update-test";
const RULES_PATH = resolve(process.cwd(), "firestore.rules");

function entryInput(clientRecordId: string, title = "Diary update") {
  return {
    clientRecordId,
    ueid: "VYD-2026-BILL01",
    entryType: "work_update_issue" as const,
    title,
    entryDate: Date.now(),
    reminder: { at: Date.now() + 86_400_000, note: "site", notificationId: "notif-1" },
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

async function main() {
  const rules = readFileSync(RULES_PATH, "utf8");
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  });
  const uid = "upd-user";
  try {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", uid), {
        uid,
        ueid: "VYD-2026-BILL01",
        phoneE164: "+919999999999",
        status: "active",
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
        displayName: "Update User",
      });
      await setDoc(doc(ctx.firestore(), "users", uid, "subscription", "status"), {
        plan: "free",
        billingStatus: "active",
        entitlementActive: true,
        entitlementReason: "neverSubscribed",
        quotaEnforcementEnabled: false,
        updatedAt: Date.now(),
        updatedBy: "admin",
      });
    });
    const db = testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
    const created = await createEntryAtomic(db, uid, entryInput("en_upd_em"));
    let cancels: string[] = [];
    const next = await updateDiaryEntryOnDb(
      db,
      uid,
      { id: created.id, title: "Updated title", expectedUpdatedAt: created.updatedAt },
      {
        cancelNotification: async (id) => {
          cancels.push(id);
        },
      }
    );
    if (next.title !== "Updated title") throw new Error("title not updated");
    if (cancels.length !== 0) throw new Error("title-only update must not cancel reminder");

    cancels = [];
    try {
      await updateDiaryEntryOnDb(
        db,
        uid,
        { id: created.id, title: "stale", expectedUpdatedAt: created.updatedAt },
        {
          cancelNotification: async (id) => {
            cancels.push(id);
          },
        }
      );
      throw new Error("stale CAS should fail");
    } catch (e) {
      if (!(e instanceof AppError) || e.details?.remoteChanged !== true) {
        throw e;
      }
    }
    if (cancels.length !== 0) throw new Error("rejected CAS must not cancel reminder");
    const snap = await getDoc(doc(db, "users", uid, "entries", created.id));
    if (snap.data()?.title !== "Updated title") throw new Error("server title overwritten by stale write");

    cancels = [];
    const cleared = await updateDiaryEntryOnDb(
      db,
      uid,
      { id: created.id, reminder: null, expectedUpdatedAt: next.updatedAt },
      {
        cancelNotification: async (id) => {
          cancels.push(id);
        },
      }
    );
    if (cleared.reminder !== null) throw new Error("reminder not cleared");
    if (cancels.join() !== "notif-1") throw new Error(`expected one cancel, got ${cancels.join()}`);

    const { appendRecordCompletedStep, setCompletedStepsFirestoreForTests, COMPLETED_STEPS_AT_FIELD } =
      await import("@/services/records/recordCompletedSteps");
    const { SAVE_STEP } = await import("@/services/records/saveLockTypes");
    setCompletedStepsFirestoreForTests(db);
    try {
      const stepped = await createEntryAtomic(db, uid, entryInput("en_steps_cas"));
      const contentAt = stepped.updatedAt;
      const afterBase = await appendRecordCompletedStep(
        uid,
        "business_entry",
        stepped.id,
        SAVE_STEP.BASE_RECORD_CREATED
      );
      const afterPdfGen = await appendRecordCompletedStep(
        uid,
        "business_entry",
        stepped.id,
        SAVE_STEP.PDF_GENERATED
      );
      if (!afterBase.includes(SAVE_STEP.BASE_RECORD_CREATED)) {
        throw new Error("BASE_RECORD_CREATED missing");
      }
      if (!afterPdfGen.includes(SAVE_STEP.PDF_GENERATED)) {
        throw new Error("PDF_GENERATED missing");
      }
      const stepSnap = await getDoc(doc(db, "users", uid, "entries", stepped.id));
      const stepData = stepSnap.data() as Record<string, unknown>;
      if (stepData.updatedAt !== contentAt) {
        throw new Error(
          `completedSteps must not bump content updatedAt (was ${String(stepData.updatedAt)}, want ${contentAt})`
        );
      }
      if (typeof stepData[COMPLETED_STEPS_AT_FIELD] !== "number") {
        throw new Error("completedStepsUpdatedAt audit field missing");
      }
      const afterMeta = await updateDiaryEntryOnDb(
        db,
        uid,
        { id: stepped.id, title: "After coordination metadata", expectedUpdatedAt: contentAt },
        { cancelNotification: async () => undefined }
      );
      if (afterMeta.title !== "After coordination metadata") {
        throw new Error("CAS update after completedSteps should succeed");
      }

      try {
        await updateDiaryEntryOnDb(
          db,
          uid,
          { id: stepped.id, title: "stale after genuine edit", expectedUpdatedAt: contentAt },
          { cancelNotification: async () => undefined }
        );
        throw new Error("genuine remote content edit must still CAS-fail");
      } catch (e) {
        if (!(e instanceof AppError) || e.details?.remoteChanged !== true) {
          throw e;
        }
      }
    } finally {
      setCompletedStepsFirestoreForTests(null);
    }

    console.log("diary.firebaseUpdate.emulator.test.ts: ok (Firestore emulator)");
  } finally {
    await testEnv.cleanup();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
