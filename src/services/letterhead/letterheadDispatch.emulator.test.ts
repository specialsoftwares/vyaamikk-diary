/**
 * Letterhead CREATE/UPDATE/mirror CREATE dispatch ownership.
 * Boundary: production atomic callbacks and updateLetterheadDocumentOnDb
 * against the Firestore emulator. Internal SDK reads actually run, then
 * pause before mutation. Not an atomic whole-repository mock.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  type DocumentReference,
  type Firestore,
  type SetOptions,
} from "firebase/firestore";

import { createEntryAtomicDetailed } from "@/services/diary/atomicCreate";
import { createLetterheadDocumentAtomic } from "@/services/letterhead/atomicCreate";
import { updateLetterheadDocumentOnDb } from "@/services/letterhead/documents-firebase";
import { letterheadMirrorRecordId } from "@/services/letterhead/letterheadMirrorPolicy";
import { SaveRetryableError } from "@/services/records/saveLockTypes";
import { applyAuthSyncIdentityTransition } from "@/sync/syncLockIdentityPolicy";
import { syncSessionOwnership, type SyncSessionToken } from "@/sync/syncSessionOwnership";

const PROJECT_ID = "vyaamikk-diary-letterhead-dispatch-test";
const RULES_PATH = resolve(process.cwd(), "firestore.rules");

let testEnv: RulesTestEnvironment;
let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  ok - ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL - ${name}${detail ? ` (${detail})` : ""}`);
  }
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function authedDb(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

function lhInput(clientRecordId: string) {
  return {
    clientRecordId,
    ueid: "VYD-2026-BILL01",
    title: "Notice",
    input: {
      title: "Notice",
      date: Date.now(),
      subject: "Subject",
      body: "Body of the letter.",
      closing: "Yours faithfully",
      name: "Owner",
      designation: "Proprietor",
      place: "Delhi",
    },
    templateRefUpdatedAt: null,
    pdfUri: null,
    saved: true,
  };
}

function mirrorInput(letterheadId: string) {
  return {
    clientRecordId: letterheadMirrorRecordId(letterheadId),
    ueid: "VYD-2026-BILL01",
    entryType: "letterhead_matter" as const,
    title: "Notice",
    entryDate: Date.now(),
    source: "letterhead" as const,
    payload: {
      letterheadDocumentId: letterheadId,
      subject: "Subject",
      reference: null,
      body: "Body of the letter.",
      closing: "Yours faithfully",
      signerName: "Owner",
      designation: "Proprietor",
      place: "Delhi",
    },
  };
}

async function seedUser(uid: string): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users", uid), {
      uid,
      ueid: "VYD-2026-BILL01",
      phoneE164: "+919999999999",
      status: "active",
      createdAt: Date.UTC(2024, 8, 18),
      updatedAt: Date.UTC(2024, 8, 18),
      displayName: "Dispatch user",
    });
    await setDoc(doc(ctx.firestore(), "users", uid, "subscription", "status"), {
      plan: "free",
      billingStatus: "active",
      entitlementActive: true,
      entitlementReason: "neverSubscribed",
      quotaEnforcementEnabled: true,
      updatedAt: Date.now(),
      updatedBy: "admin",
    });
  });
}

function beginOwner(uid: string): SyncSessionToken {
  applyAuthSyncIdentityTransition({
    prevStatus: "signed_out",
    nextStatus: "signed_in",
    prevUid: null,
    nextUid: uid,
  });
  const token = syncSessionOwnership.current();
  if (!token) throw new Error("expected live session");
  return token;
}

function switchToB(fromUid: string, toUid: string): void {
  applyAuthSyncIdentityTransition({
    prevStatus: "signed_in",
    nextStatus: "signed_in",
    prevUid: fromUid,
    nextUid: toUid,
  });
}

function logoutRelogin(uid: string): SyncSessionToken {
  applyAuthSyncIdentityTransition({
    prevStatus: "signed_in",
    nextStatus: "signed_out",
    prevUid: uid,
    nextUid: null,
  });
  return beginOwner(uid);
}

function isRetired(err: unknown): boolean {
  return err instanceof SaveRetryableError && err.failureCode === "session_retired";
}

async function main() {
  console.log("letterheadDispatch.emulator.test.ts");
  const rules = readFileSync(RULES_PATH, "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  });
  await testEnv.clearFirestore();
  syncSessionOwnership.resetForTests();

  try {
    await seedUser("disp-a");
    await seedUser("disp-b");

    const tokenCreateAb = beginOwner("disp-a");
    const createAbHold = deferred();
    const createAbStarted = deferred();
    const createAb = createLetterheadDocumentAtomic(
      authedDb("disp-a"),
      "disp-a",
      lhInput("lh_disp_create_ab"),
      {
        session: tokenCreateAb,
        afterReads: async () => {
          createAbStarted.resolve();
          await createAbHold.promise;
        },
      }
    );
    await createAbStarted.promise;
    switchToB("disp-a", "disp-b");
    createAbHold.resolve();
    await createAb.then(
      () => check("parent CREATE A→B retired", false, "expected session_retired"),
      (err) => check("parent CREATE A→B retired", isRetired(err))
    );
    check(
      "parent CREATE A→B issued no document",
      !(await getDoc(doc(authedDb("disp-a"), "users", "disp-a", "letterheadDocs", "lh_disp_create_ab"))).exists()
    );

    applyAuthSyncIdentityTransition({
      prevStatus: "signed_in",
      nextStatus: "signed_out",
      prevUid: "disp-b",
      nextUid: null,
    });
    const tokenCreateRecover = beginOwner("disp-a");
    const recoveredCreate = await createLetterheadDocumentAtomic(
      authedDb("disp-a"),
      "disp-a",
      lhInput("lh_disp_create_ab"),
      { session: tokenCreateRecover }
    );
    check("same-id parent CREATE recovery works", recoveredCreate.id === "lh_disp_create_ab");

    const tokenCreateRelogin = tokenCreateRecover;
    const createReloginHold = deferred();
    const createReloginStarted = deferred();
    const createRelogin = createLetterheadDocumentAtomic(
      authedDb("disp-a"),
      "disp-a",
      lhInput("lh_disp_create_relogin"),
      {
        session: tokenCreateRelogin,
        afterReads: async () => {
          createReloginStarted.resolve();
          await createReloginHold.promise;
        },
      }
    );
    await createReloginStarted.promise;
    logoutRelogin("disp-a");
    createReloginHold.resolve();
    await createRelogin.then(
      () => check("parent CREATE A→logout→A retired", false, "expected session_retired"),
      (err) => check("parent CREATE A→logout→A retired", isRetired(err))
    );
    check(
      "parent CREATE A→logout→A issued no document",
      !(await getDoc(doc(authedDb("disp-a"), "users", "disp-a", "letterheadDocs", "lh_disp_create_relogin"))).exists()
    );
    const newerCreate = await createLetterheadDocumentAtomic(
      authedDb("disp-a"),
      "disp-a",
      lhInput("lh_disp_create_relogin"),
      { session: syncSessionOwnership.current() }
    );
    check("newer parent CREATE ownership remains intact", newerCreate.id === "lh_disp_create_relogin");

    const parentForUpdate = await createLetterheadDocumentAtomic(
      authedDb("disp-a"),
      "disp-a",
      lhInput("lh_disp_update"),
      { session: syncSessionOwnership.current() }
    );
    const dbA = authedDb("disp-a");
    const tokenUpdateAb = syncSessionOwnership.current();
    const updateAbHold = deferred();
    const updateAbStarted = deferred();
    let updateAbSetDocs = 0;
    const updateAb = updateLetterheadDocumentOnDb(
      dbA,
      "disp-a",
      parentForUpdate.id,
      { saved: true, pdfUri: "file:///tmp/lh-disp-ab.pdf" },
      tokenUpdateAb,
      {
        getDoc: async (ref: DocumentReference) => {
          const snap = await getDoc(ref);
          updateAbStarted.resolve();
          await updateAbHold.promise;
          return snap;
        },
        setDoc: async (ref: DocumentReference, data: Record<string, unknown>, options?: SetOptions) => {
          updateAbSetDocs += 1;
          return setDoc(ref as never, data, options ?? { merge: true });
        },
      }
    );
    await updateAbStarted.promise;
    switchToB("disp-a", "disp-b");
    updateAbHold.resolve();
    await updateAb.then(
      () => check("parent UPDATE A→B retired", false, "expected session_retired"),
      (err) => check("parent UPDATE A→B retired", isRetired(err))
    );
    check("parent UPDATE A→B issued no setDoc", updateAbSetDocs === 0);
    const afterRetiredUpdate = await getDoc(
      doc(authedDb("disp-a"), "users", "disp-a", "letterheadDocs", parentForUpdate.id)
    );
    check("accepted parent remains after retired UPDATE", afterRetiredUpdate.exists());
    check(
      "retired UPDATE did not persist device pdfUri",
      (afterRetiredUpdate.data() as { pdfUri?: unknown }).pdfUri == null
    );

    applyAuthSyncIdentityTransition({
      prevStatus: "signed_in",
      nextStatus: "signed_out",
      prevUid: "disp-b",
      nextUid: null,
    });
    const tokenUpdateRecover = beginOwner("disp-a");
    let recoveredSetDocs = 0;
    const recoveredUpdate = await updateLetterheadDocumentOnDb(
      authedDb("disp-a"),
      "disp-a",
      parentForUpdate.id,
      { saved: true, pdfUri: "file:///tmp/lh-disp-recover.pdf" },
      tokenUpdateRecover,
      {
        setDoc: async (ref, data, options) => {
          recoveredSetDocs += 1;
          check("cloud UPDATE payload strips pdfUri", data.pdfUri === null);
          return setDoc(ref as never, data, options ?? { merge: true });
        },
      }
    );
    check("same-id parent UPDATE recovery works", recoveredUpdate.id === parentForUpdate.id);
    check("recovery UPDATE issued setDoc", recoveredSetDocs === 1);
    const recoveredSnap = await getDoc(
      doc(authedDb("disp-a"), "users", "disp-a", "letterheadDocs", parentForUpdate.id)
    );
    check(
      "Firestore UPDATE payload has no device-local pdfUri",
      (recoveredSnap.data() as { pdfUri?: unknown }).pdfUri == null
    );

    const tokenUpdateRelogin = syncSessionOwnership.current();
    const updateReloginHold = deferred();
    const updateReloginStarted = deferred();
    let updateReloginSetDocs = 0;
    const updateRelogin = updateLetterheadDocumentOnDb(
      authedDb("disp-a"),
      "disp-a",
      parentForUpdate.id,
      { title: "Should not stick" },
      tokenUpdateRelogin,
      {
        getDoc: async (ref: DocumentReference) => {
          const snap = await getDoc(ref);
          updateReloginStarted.resolve();
          await updateReloginHold.promise;
          return snap;
        },
        setDoc: async (ref, data, options) => {
          updateReloginSetDocs += 1;
          return setDoc(ref as never, data, options ?? { merge: true });
        },
      }
    );
    await updateReloginStarted.promise;
    logoutRelogin("disp-a");
    updateReloginHold.resolve();
    await updateRelogin.then(
      () => check("parent UPDATE A→logout→A retired", false, "expected session_retired"),
      (err) => check("parent UPDATE A→logout→A retired", isRetired(err))
    );
    check("parent UPDATE A→logout→A issued no setDoc", updateReloginSetDocs === 0);
    const titleAfterRelogin = (
      await getDoc(doc(authedDb("disp-a"), "users", "disp-a", "letterheadDocs", parentForUpdate.id))
    ).data() as { title?: string };
    check("newer ownership title unchanged by retired UPDATE", titleAfterRelogin.title !== "Should not stick");

    const mirrorParent = await createLetterheadDocumentAtomic(
      authedDb("disp-a"),
      "disp-a",
      lhInput("lh_disp_mirror"),
      { session: syncSessionOwnership.current() }
    );
    const tokenMirrorAb = syncSessionOwnership.current();
    const mirrorAbHold = deferred();
    const mirrorAbStarted = deferred();
    const mirrorAb = createEntryAtomicDetailed(
      authedDb("disp-a"),
      "disp-a",
      mirrorInput(mirrorParent.id),
      {
        session: tokenMirrorAb,
        afterReads: async () => {
          mirrorAbStarted.resolve();
          await mirrorAbHold.promise;
        },
      }
    );
    await mirrorAbStarted.promise;
    switchToB("disp-a", "disp-b");
    mirrorAbHold.resolve();
    await mirrorAb.then(
      () => check("mirror CREATE A→B retired", false, "expected session_retired"),
      (err) => check("mirror CREATE A→B retired", isRetired(err))
    );
    check(
      "mirror CREATE A→B issued no document",
      !(
        await getDoc(
          doc(authedDb("disp-a"), "users", "disp-a", "entries", letterheadMirrorRecordId(mirrorParent.id))
        )
      ).exists()
    );

    applyAuthSyncIdentityTransition({
      prevStatus: "signed_in",
      nextStatus: "signed_out",
      prevUid: "disp-b",
      nextUid: null,
    });
    const tokenMirrorRecover = beginOwner("disp-a");
    const recoveredMirror = await createEntryAtomicDetailed(
      authedDb("disp-a"),
      "disp-a",
      mirrorInput(mirrorParent.id),
      { session: tokenMirrorRecover }
    );
    check("same-id mirror CREATE recovery works", recoveredMirror.record.id.endsWith(":matter"));

    const tokenMirrorRelogin = syncSessionOwnership.current();
    const secondParent = await createLetterheadDocumentAtomic(
      authedDb("disp-a"),
      "disp-a",
      lhInput("lh_disp_mirror_relogin"),
      { session: tokenMirrorRelogin }
    );
    const mirrorReloginHold = deferred();
    const mirrorReloginStarted = deferred();
    const mirrorRelogin = createEntryAtomicDetailed(
      authedDb("disp-a"),
      "disp-a",
      mirrorInput(secondParent.id),
      {
        session: tokenMirrorRelogin,
        afterReads: async () => {
          mirrorReloginStarted.resolve();
          await mirrorReloginHold.promise;
        },
      }
    );
    await mirrorReloginStarted.promise;
    logoutRelogin("disp-a");
    mirrorReloginHold.resolve();
    await mirrorRelogin.then(
      () => check("mirror CREATE A→logout→A retired", false, "expected session_retired"),
      (err) => check("mirror CREATE A→logout→A retired", isRetired(err))
    );
    check(
      "mirror CREATE A→logout→A issued no document",
      !(
        await getDoc(
          doc(authedDb("disp-a"), "users", "disp-a", "entries", letterheadMirrorRecordId(secondParent.id))
        )
      ).exists()
    );
    const newerMirror = await createEntryAtomicDetailed(
      authedDb("disp-a"),
      "disp-a",
      mirrorInput(secondParent.id),
      { session: syncSessionOwnership.current() }
    );
    check("newer mirror CREATE ownership remains intact", newerMirror.record.id.endsWith(":matter"));

    await assertFails(
      setDoc(doc(authedDb("disp-a"), "users", "disp-a", "letterheadDocs", "lh_disp_device_pdf"), {
        userId: "disp-a",
        title: "Notice",
        input: lhInput("x").input,
        pdfUri: "file:///tmp/nope.pdf",
        createdAt: Date.now(),
      })
    );
    check("CREATE with device-local pdfUri denied at Rules", true);
  } finally {
    await testEnv.cleanup();
    syncSessionOwnership.resetForTests();
  }

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("letterheadDispatch.emulator.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
