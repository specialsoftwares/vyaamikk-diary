/**
 * Round 15 letterhead zero-quota + mirror-security proofs.
 * Runs with the Firestore emulator (see test:firestore-rules).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, writeBatch, type Firestore } from "firebase/firestore";

import { createEntryAtomic, createEntryAtomicDetailed } from "@/services/diary/atomicCreate";
import { createLetterheadDocumentAtomic } from "@/services/letterhead/atomicCreate";
import { letterheadMirrorRecordId } from "@/services/letterhead/letterheadMirrorPolicy";
import { classifyAtomicCreateError } from "@/billing/optionC/classifyCreateError";
import { istMonthKeyForMillis } from "@/billing/istMonthKey";
import { updateDiaryEntryOnDb } from "@/services/diary/firebaseUpdate";

const PROJECT_ID = "vyaamikk-diary-letterhead-quota-test";
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

function authedDb(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

async function seedUser(uid: string, patch: Record<string, unknown> = {}): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users", uid), {
      uid,
      ueid: "VYD-2026-BILL01",
      phoneE164: "+919999999999",
      status: "active",
      createdAt: Date.UTC(2024, 8, 18),
      updatedAt: Date.UTC(2024, 8, 18),
      displayName: "Letterhead quota user",
      ...patch,
    });
  });
}

async function seedStatus(uid: string, patch: Record<string, unknown> = {}): Promise<void> {
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

function usageDoc(recordsThisMonth: number) {
  return {
    monthKey: istMonthKeyForMillis(Date.now()),
    recordsThisMonth,
    lastRecordCollection: "entries",
    lastRecordId: "seed",
    updatedAt: Date.now(),
  };
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

/** create.tsx defaultValues with only subject/body/sender filled. */
function formLhInput(clientRecordId: string) {
  return {
    clientRecordId,
    ueid: "VYD-2026-BILL01",
    title: "Subject of the letter",
    input: {
      title: "",
      date: Date.now(),
      reference: "",
      recipientName: "",
      recipientDesignation: "",
      recipientCompany: "",
      recipientAddress: "",
      subject: "Subject of the letter",
      salutation: "Dear Sir/Madam,",
      body: "Body of the letter.",
      closing: "Yours faithfully,",
      name: "Owner",
      designation: "",
      place: "",
      useSignature: false,
      useStamp: false,
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

function ordinaryEntry(clientRecordId: string) {
  return {
    clientRecordId,
    ueid: "VYD-2026-BILL01",
    entryType: "work_update_issue" as const,
    title: "Ordinary diary",
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

async function usageCount(uid: string): Promise<number | null> {
  const snap = await getDoc(doc(authedDb(uid), "users", uid, "subscription", "usageCurrent"));
  if (!snap.exists()) return null;
  return Number((snap.data() as { recordsThisMonth?: number }).recordsThisMonth);
}

function countAccessCalls(src: string, fnName: string, seen = new Set<string>()): number {
  if (seen.has(fnName)) return 0;
  seen.add(fnName);
  const re = new RegExp(`function ${fnName}\\s*\\([^)]*\\)\\s*\\{`);
  const start = src.search(re);
  if (start < 0) return 0;
  const brace = src.indexOf("{", start);
  let depth = 0;
  let end = brace;
  for (let i = brace; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = src.slice(brace, end + 1);
  const direct =
    (body.match(/(?<![.\w])get\s*\(/g) ?? []).length +
    (body.match(/(?<![.\w])exists\s*\(/g) ?? []).length +
    (body.match(/(?<![.\w])getAfter\s*\(/g) ?? []).length +
    (body.match(/(?<![.\w])existsAfter\s*\(/g) ?? []).length;
  const called = new Set<string>();
  const callRe = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(body))) {
    const name = m[1]!;
    if (name === fnName) continue;
    if (/^(get|exists|getAfter|existsAfter|string|int|bool|duration|latlng|path|timestamp)$/.test(name)) {
      continue;
    }
    if (src.includes(`function ${name}(`)) called.add(name);
  }
  let nested = 0;
  for (const name of called) nested += countAccessCalls(src, name, seen);
  return direct + nested;
}

async function main() {
  console.log("letterheadQuota.emulator.test.ts");
  const rules = readFileSync(RULES_PATH, "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  });
  await testEnv.clearFirestore();

  try {
    const letterheadGets = countAccessCalls(rules, "isActiveUser");
    const mirrorGets =
      countAccessCalls(rules, "isActiveUser") + countAccessCalls(rules, "isValidatedLetterheadMirrorCreate");
    check("static source estimate: letterhead CREATE document reads", letterheadGets === 1, `got ${letterheadGets}`);
    check("static source estimate: mirror CREATE document reads", mirrorGets === 2, `got ${mirrorGets}`);
    check("static source estimate: letterhead CREATE under Rules 20-access cap", letterheadGets <= 20);
    check("static source estimate: mirror CREATE under Rules 20-access cap", mirrorGets <= 20);
    check("countAccessCalls is a static source estimate, not a runtime measurement", true);

    const plans: { uid: string; patch: Record<string, unknown> }[] = [
      { uid: "lh-free", patch: { plan: "free", entitlementActive: true, quotaEnforcementEnabled: true } },
      { uid: "lh-starter", patch: { plan: "starter", entitlementActive: true, quotaEnforcementEnabled: true } },
      {
        uid: "lh-pro",
        patch: { plan: "professional", entitlementActive: true, quotaEnforcementEnabled: true },
      },
      { uid: "lh-biz", patch: { plan: "business", entitlementActive: true, quotaEnforcementEnabled: true } },
      {
        uid: "lh-expired",
        patch: {
          plan: "professional",
          entitlementActive: false,
          billingStatus: "expired",
          quotaEnforcementEnabled: true,
        },
      },
      { uid: "lh-off", patch: { plan: "free", entitlementActive: true, quotaEnforcementEnabled: false } },
    ];

    for (const row of plans) {
      await seedUser(row.uid);
      await seedStatus(row.uid, row.patch);
      await seedUsage(row.uid, usageDoc(25));
      const parent = await createLetterheadDocumentAtomic(authedDb(row.uid), row.uid, lhInput(`lh_${row.uid}`));
      const mirror = await createEntryAtomic(authedDb(row.uid), row.uid, mirrorInput(parent.id));
      check(`${row.uid} parent+mirror at exhausted ordinary allowance`, parent.id.startsWith("lh_") && mirror.id.endsWith(":matter"));
      check(`${row.uid} usage unchanged`, (await usageCount(row.uid)) === 25);
    }

    await seedUser("lh-missing-signup", { createdAt: null });
    await seedStatus("lh-missing-signup", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    await seedUsage("lh-missing-signup", usageDoc(25));
    const missing = await createLetterheadDocumentAtomic(
      authedDb("lh-missing-signup"),
      "lh-missing-signup",
      lhInput("lh_unknown_signup")
    );
    check("missing createdAt still allows zero-quota letterhead", missing.id === "lh_unknown_signup");
    check("missing createdAt usage unchanged", (await usageCount("lh-missing-signup")) === 25);

    await seedUser("lh-old", { createdAt: Date.UTC(2018, 0, 1) });
    await seedStatus("lh-old", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    await seedUsage("lh-old", usageDoc(25));
    const afterYear = await createLetterheadDocumentAtomic(authedDb("lh-old"), "lh-old", lhInput("lh_after_year"));
    check("post-anniversary remains free pending successor", afterYear.id === "lh_after_year");
    check("post-anniversary usage unchanged", (await usageCount("lh-old")) === 25);

    await seedUser("lh-leap", { createdAt: Date.UTC(2024, 1, 29, 12) });
    await seedStatus("lh-leap", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    const leap = await createLetterheadDocumentAtomic(authedDb("lh-leap"), "lh-leap", lhInput("lh_leap"));
    check("leap-day signup still creates letterhead", leap.id === "lh_leap");

    await seedUser("alice");
    await seedUser("mallory");
    await seedStatus("alice", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    await seedStatus("mallory", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    const aliceParent = await createLetterheadDocumentAtomic(authedDb("alice"), "alice", lhInput("lh_alice"));
    await createEntryAtomic(authedDb("alice"), "alice", mirrorInput(aliceParent.id));

    let missingParentKind: string | null = null;
    try {
      await createEntryAtomic(authedDb("mallory"), "mallory", mirrorInput("no_such_parent"));
    } catch (e) {
      missingParentKind = classifyAtomicCreateError(e);
    }
    check("missing-parent mirror denied", missingParentKind === "permission_denied");

    let forgedKind: string | null = null;
    try {
      await createEntryAtomic(authedDb("mallory"), "mallory", mirrorInput(aliceParent.id));
    } catch (e) {
      forgedKind = classifyAtomicCreateError(e);
    }
    check("cross-user parent mirror denied", forgedKind === "permission_denied");
    check(
      "mallory did not receive alice mirror",
      !(await getDoc(doc(authedDb("mallory"), "users", "mallory", "entries", letterheadMirrorRecordId(aliceParent.id)))).exists()
    );

    let arbitraryIdKind: string | null = null;
    try {
      await createEntryAtomic(authedDb("alice"), "alice", {
        ...mirrorInput(aliceParent.id),
        clientRecordId: `${aliceParent.id}_matter`,
      });
    } catch (e) {
      arbitraryIdKind = classifyAtomicCreateError(e);
    }
    check("supplied parent id + arbitrary mirror id denied", arbitraryIdKind === "permission_denied");

    const aliceMirrorId = letterheadMirrorRecordId(aliceParent.id);
    await assertFails(
      setDoc(doc(authedDb("alice"), "users", "alice", "entries", aliceMirrorId), {
        userId: "alice",
        title: "Converted",
        entryType: "work_update_issue",
        source: "letterhead",
        payload: { letterheadDocumentId: aliceParent.id },
      })
    );
    check("existing mirror cannot convert via overwrite create", true);

    await assertFails(
      updateDoc(doc(authedDb("alice"), "users", "alice", "entries", aliceMirrorId), {
        userId: "alice",
        title: "Converted",
        entryType: "work_update_issue",
      })
    );
    check("letterhead_matter cannot convert to ordinary diary", true);

    await assertFails(
      updateDoc(doc(authedDb("alice"), "users", "alice", "entries", aliceMirrorId), {
        userId: "alice",
        title: "Moved",
        payload: { letterheadDocumentId: "other" },
      })
    );
    check("letterheadDocumentId cannot be retargeted", true);

    await assertSucceeds(
      updateDoc(doc(authedDb("alice"), "users", "alice", "entries", aliceMirrorId), {
        userId: "alice",
        title: "Edited notice",
      })
    );
    check("mirror title edit allowed", true);

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "alice", "entries", "lh_alice_legacy"), {
        userId: "alice",
        title: "Legacy mirror",
        entryType: "letterhead_matter",
        source: "letterhead",
        payload: { letterheadDocumentId: "lh_alice" },
        createdAt: Date.now(),
      });
    });
    await assertSucceeds(
      updateDoc(doc(authedDb("alice"), "users", "alice", "entries", "lh_alice_legacy"), {
        userId: "alice",
        title: "Legacy preserved",
      })
    );
    check("legacy arbitrary-id mirror remains writable", true);

    const usageBeforeLegacyReplay = await usageCount("alice");
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "alice", "entries", "lh_alice_matter"), {
        id: "lh_alice_matter",
        userId: "alice",
        ueid: "VYD-2026-BILL01",
        title: "Legacy parent_matter mirror",
        entryType: "letterhead_matter",
        source: "letterhead",
        entryDate: Date.now(),
        notes: null,
        reminder: null,
        attachments: [],
        payload: { letterheadDocumentId: "lh_alice", body: "kept letter text" },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: "active",
      });
    });
    const legacyReplay = await createEntryAtomicDetailed(authedDb("alice"), "alice", {
      ...mirrorInput("lh_alice"),
      clientRecordId: "lh_alice_matter",
    });
    check("legacy parent_matter replay returns existing", legacyReplay.outcome === "existing");
    check("legacy parent_matter replay keeps original id", legacyReplay.record.id === "lh_alice_matter");
    check(
      "legacy parent_matter replay does not consume quota",
      (await usageCount("alice")) === usageBeforeLegacyReplay
    );
    check(
      "legacy parent_matter replay does not overwrite letter text",
      ((await getDoc(doc(authedDb("alice"), "users", "alice", "entries", "lh_alice_matter"))).data() as {
        payload?: { body?: string };
      }).payload?.body === "kept letter text"
    );

    let missingLegacyNewKind: string | null = null;
    try {
      await createEntryAtomic(authedDb("alice"), "alice", {
        ...mirrorInput("lh_alice"),
        clientRecordId: "lh_alice_missing_matter",
      });
    } catch (e) {
      missingLegacyNewKind = classifyAtomicCreateError(e);
    }
    check("missing legacy-id new create denied", missingLegacyNewKind === "permission_denied");

    await seedUser("lh-skeletal");
    await seedStatus("lh-skeletal", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "lh-skeletal", "letterheadDocs", "lh_skel"), {
        userId: "lh-skeletal",
        title: "Skeletal",
        createdAt: Date.now(),
      });
    });
    let skeletalKind: string | null = null;
    try {
      await createEntryAtomic(authedDb("lh-skeletal"), "lh-skeletal", mirrorInput("lh_skel"));
    } catch (e) {
      skeletalKind = classifyAtomicCreateError(e);
    }
    check("skeletal parent cannot mint a quota-free mirror", skeletalKind === "permission_denied");
    await assertFails(
      setDoc(doc(authedDb("lh-skeletal"), "users", "lh-skeletal", "letterheadDocs", "lh_skel_new"), {
        userId: "lh-skeletal",
        title: "Skeletal new",
        createdAt: Date.now(),
      })
    );
    check("skeletal letterheadDocs CREATE denied at Rules", true);

    const shapeParent = await createLetterheadDocumentAtomic(
      authedDb("alice"),
      "alice",
      lhInput("lh_alice_shape")
    );

    let extraPayloadKind: string | null = null;
    try {
      await createEntryAtomic(authedDb("alice"), "alice", {
        ...mirrorInput(shapeParent.id),
        payload: {
          ...mirrorInput(shapeParent.id).payload,
          workDone: "unrelated diary field",
        } as never,
      });
    } catch (e) {
      extraPayloadKind = classifyAtomicCreateError(e);
    }
    check("unrelated payload fields denied on mirror CREATE", extraPayloadKind === "permission_denied");

    let emptyParentKind: string | null = null;
    try {
      await createLetterheadDocumentAtomic(authedDb("alice"), "alice", {
        ...lhInput("lh_empty_input"),
        input: {} as never,
      });
    } catch (e) {
      emptyParentKind = classifyAtomicCreateError(e);
    }
    check("empty parent input denied on atomic CREATE", emptyParentKind === "permission_denied");
    await assertFails(
      setDoc(doc(authedDb("alice"), "users", "alice", "letterheadDocs", "lh_empty_rules"), {
        userId: "alice",
        title: "Parent",
        input: {},
        createdAt: Date.now(),
      })
    );
    check("empty parent input denied at Rules", true);

    const usageBeforeBlankTitle = await usageCount("alice");
    const blankTitleParent = await createLetterheadDocumentAtomic(
      authedDb("alice"),
      "alice",
      formLhInput("lh_form_blank_title")
    );
    check("blank form title + valid subject/body/sender CREATE", blankTitleParent.input.title === "");
    check("blank form title resolves document title from subject", blankTitleParent.title === "Subject of the letter");
    const blankMirror = await createEntryAtomic(authedDb("alice"), "alice", mirrorInput(blankTitleParent.id));
    check("blank-title parent still mints a genuine mirror", blankMirror.id === letterheadMirrorRecordId(blankTitleParent.id));
    check("blank-title CREATE remains zero quota", (await usageCount("alice")) === usageBeforeBlankTitle);

    await assertSucceeds(
      setDoc(doc(authedDb("alice"), "users", "alice", "letterheadDocs", "lh_form_blank_rules"), {
        userId: "alice",
        title: "Subject of the letter",
        input: formLhInput("lh_form_blank_rules").input,
        createdAt: Date.now(),
      })
    );
    check("blank form title allowed at Rules when document title is resolved", true);

    await assertFails(
      setDoc(doc(authedDb("alice"), "users", "alice", "letterheadDocs", "lh_blank_doc_title"), {
        userId: "alice",
        title: "",
        input: formLhInput("lh_blank_doc_title").input,
        createdAt: Date.now(),
      })
    );
    check("empty resolved document title denied at Rules", true);

    let missingSubjectKind: string | null = null;
    try {
      await createLetterheadDocumentAtomic(authedDb("alice"), "alice", {
        ...formLhInput("lh_missing_subject"),
        input: { ...formLhInput("lh_missing_subject").input, subject: "" },
      });
    } catch (e) {
      missingSubjectKind = classifyAtomicCreateError(e);
    }
    check("missing subject denied on atomic CREATE", missingSubjectKind === "permission_denied");

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "alice", "letterheadDocs", "lh_saved_blank"), {
        userId: "alice",
        title: "Old subject",
        input: {
          ...formLhInput("lh_saved_blank").input,
          subject: "Old subject",
          body: "Old body of the letter.",
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    await assertSucceeds(
      updateDoc(doc(authedDb("alice"), "users", "alice", "letterheadDocs", "lh_saved_blank"), {
        userId: "alice",
        title: "Old subject",
        input: {
          ...formLhInput("lh_saved_blank").input,
          subject: "Old subject",
          body: "Recovered body of the letter.",
        },
        updatedAt: Date.now(),
      })
    );
    check("editing a previously saved blank-title letter remains allowed", true);

    const replayBlank = await createLetterheadDocumentAtomic(
      authedDb("alice"),
      "alice",
      formLhInput("lh_form_blank_title")
    );
    check("same-ID replay of blank-title letter returns existing", replayBlank.id === blankTitleParent.id);
    check("same-ID replay keeps blank form title", replayBlank.input.title === "");

    await assertFails(
      setDoc(doc(authedDb("alice"), "users", "alice", "letterheadDocs", "lh_object_title"), {
        userId: "alice",
        title: "Subject of the letter",
        input: { ...formLhInput("lh_object_title").input, title: { text: "obj" } },
        createdAt: Date.now(),
      })
    );
    check("object form title denied at Rules", true);

    await assertFails(
      setDoc(doc(authedDb("alice"), "users", "alice", "letterheadDocs", "lh_object_body_parent"), {
        userId: "alice",
        title: "Parent",
        input: {
          title: "Parent",
          date: Date.now(),
          subject: "Subject",
          body: { amount: 5000 },
          closing: "Yours",
          name: "Owner",
          designation: "Proprietor",
          place: "Delhi",
        },
        createdAt: Date.now(),
      })
    );
    check("object parent body denied at Rules", true);

    let objectBodyKind: string | null = null;
    try {
      await createEntryAtomic(authedDb("alice"), "alice", {
        ...mirrorInput(shapeParent.id),
        payload: {
          letterheadDocumentId: shapeParent.id,
          body: { amount: 5000, workDone: "not letter text" },
        } as never,
      });
    } catch (e) {
      objectBodyKind = classifyAtomicCreateError(e);
    }
    check("object mirror body denied on atomic CREATE", objectBodyKind === "permission_denied");
    await assertFails(
      setDoc(doc(authedDb("alice"), "users", "alice", "entries", letterheadMirrorRecordId(shapeParent.id)), {
        userId: "alice",
        title: "Notice",
        entryType: "letterhead_matter",
        source: "letterhead",
        payload: {
          letterheadDocumentId: shapeParent.id,
          body: { amount: 5000, workDone: "not letter text" },
        },
      })
    );
    check("object mirror body denied at Rules", true);

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "alice", "entries", "lh_alice_legacy_extra"), {
        userId: "alice",
        title: "Legacy extra",
        entryType: "letterhead_matter",
        source: "letterhead",
        payload: {
          letterheadDocumentId: "lh_alice",
          body: "kept letter text",
          workDone: "old unrelated",
        },
        attachments: [{ id: "att_a", uri: "file://a.jpg", mimeType: "image/jpeg", name: "a.jpg" }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    await assertFails(
      updateDoc(doc(authedDb("alice"), "users", "alice", "entries", "lh_alice_legacy_extra"), {
        userId: "alice",
        payload: {
          letterheadDocumentId: "lh_alice",
          body: "kept letter text",
          workDone: "new unrelated",
        },
      })
    );
    check("legacy unsupported payload value cannot change", true);
    await assertFails(
      updateDoc(doc(authedDb("alice"), "users", "alice", "entries", "lh_alice_legacy_extra"), {
        userId: "alice",
        attachments: [{ id: "att_b", uri: "file://b.jpg", mimeType: "image/jpeg", name: "b.jpg" }],
      })
    );
    check("attachment replacement without count increase denied", true);
    await assertSucceeds(
      updateDoc(doc(authedDb("alice"), "users", "alice", "entries", "lh_alice_legacy_extra"), {
        userId: "alice",
        title: "Legacy extra preserved",
      })
    );
    check("legitimate legacy title edit remains allowed", true);
    await assertSucceeds(
      updateDoc(doc(authedDb("alice"), "users", "alice", "letterheadDocs", shapeParent.id), {
        userId: "alice",
        title: "Shape parent metadata",
        updatedAt: Date.now(),
      })
    );
    check("parent title/metadata write remains allowed", true);
    await assertFails(
      updateDoc(doc(authedDb("alice"), "users", "alice", "letterheadDocs", shapeParent.id), {
        userId: "alice",
        pdfUri: "file:///tmp/device-local.pdf",
      })
    );
    check("device-local pdfUri cannot be newly written", true);

    let reminderCreateKind: string | null = null;
    try {
      await createEntryAtomic(authedDb("alice"), "alice", {
        ...mirrorInput(shapeParent.id),
        reminder: { at: Date.now() + 86_400_000, note: "follow up", notificationId: "n-lh" },
      });
    } catch (e) {
      reminderCreateKind = classifyAtomicCreateError(e);
    }
    check("mirror CREATE cannot carry a reminder through the exemption", reminderCreateKind === "permission_denied");

    await assertFails(
      updateDoc(doc(authedDb("alice"), "users", "alice", "entries", aliceMirrorId), {
        userId: "alice",
        reminder: { at: Date.now() + 86_400_000, note: "converted", notificationId: "n2" },
      })
    );
    check("mirror UPDATE cannot add a reminder", true);

    await assertFails(
      updateDoc(doc(authedDb("alice"), "users", "alice", "entries", aliceMirrorId), {
        userId: "alice",
        payload: {
          letterheadDocumentId: aliceParent.id,
          workDone: "ordinary field",
        },
      })
    );
    check("mirror UPDATE cannot add unrelated payload fields", true);

    const titleBeforePdf = (
      await getDoc(doc(authedDb("alice"), "users", "alice", "entries", aliceMirrorId))
    ).data() as { updatedAt?: number; title?: string };
    const pdfMeta = await updateDiaryEntryOnDb(
      authedDb("alice"),
      "alice",
      {
        id: aliceMirrorId,
        pdfUri: "file:///tmp/lh-alice.pdf",
        expectedUpdatedAt: titleBeforePdf.updatedAt,
      },
      { cancelNotification: async () => undefined }
    );
    check("PDF metadata update on supported mirror is allowed", pdfMeta.id === aliceMirrorId);

    const afterPdfMeta = await getDoc(doc(authedDb("alice"), "users", "alice", "entries", aliceMirrorId));
    const { appendRecordCompletedStep, setCompletedStepsFirestoreForTests, COMPLETED_STEPS_AT_FIELD } =
      await import("@/services/records/recordCompletedSteps");
    const { SAVE_STEP } = await import("@/services/records/saveLockTypes");
    setCompletedStepsFirestoreForTests(authedDb("alice"));
    try {
      const contentAt = Number(afterPdfMeta.data()?.updatedAt);
      await appendRecordCompletedStep("alice", "letterhead_doc", aliceParent.id, SAVE_STEP.BASE_RECORD_CREATED);
      const coordSnap = await getDoc(doc(authedDb("alice"), "users", "alice", "letterheadDocs", aliceParent.id));
      check(
        "coordination metadata write does not require a production migration",
        Array.isArray((coordSnap.data() as { completedSteps?: string[] }).completedSteps)
      );
      check(
        "coordination metadata has audit timestamp",
        typeof (coordSnap.data() as Record<string, unknown>)[COMPLETED_STEPS_AT_FIELD] === "number"
      );
      const afterCoord = await updateDiaryEntryOnDb(
        authedDb("alice"),
        "alice",
        {
          id: aliceMirrorId,
          title: "Edited notice after coordination",
          expectedUpdatedAt: contentAt,
        },
        { cancelNotification: async () => undefined }
      );
      check("positive title edit after coordination metadata", afterCoord.title === "Edited notice after coordination");
    } finally {
      setCompletedStepsFirestoreForTests(null);
    }

    await seedUser("lh-no-usage");
    await seedStatus("lh-no-usage", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    const noUsage = await createLetterheadDocumentAtomic(
      authedDb("lh-no-usage"),
      "lh-no-usage",
      lhInput("lh_no_usage")
    );
    await createEntryAtomic(authedDb("lh-no-usage"), "lh-no-usage", mirrorInput(noUsage.id));
    check("no usage document: parent+mirror succeed", (await usageCount("lh-no-usage")) == null);

    const db = authedDb("alice");
    const steal = writeBatch(db);
    steal.set(doc(db, "users", "alice", "letterheadDocs", "lh_steal"), {
      userId: "alice",
      title: "Steal",
      input: {
        title: "Steal",
        date: Date.now(),
        subject: "Subject",
        body: "Body of the letter.",
        closing: "Yours",
        name: "Owner",
        designation: "Proprietor",
        place: "Delhi",
      },
      createdAt: Date.now(),
    });
    steal.set(doc(db, "users", "alice", "subscription", "usageCurrent"), {
      monthKey: istMonthKeyForMillis(Date.now()),
      recordsThisMonth: 1,
      lastRecordCollection: "letterheadDocs",
      lastRecordId: "lh_steal",
      updatedAt: Date.now(),
    });
    await assertFails(steal.commit());
    check("letterhead batch cannot write ordinary usage", true);

    await seedUser("lh-ordinary");
    await seedStatus("lh-ordinary", { quotaEnforcementEnabled: true, plan: "free", entitlementActive: true });
    const ordinary = await createEntryAtomic(authedDb("lh-ordinary"), "lh-ordinary", ordinaryEntry("en_billable"));
    check("ordinary diary still consumes quota", ordinary.id === "en_billable" && (await usageCount("lh-ordinary")) === 1);

    const host = process.env.FIRESTORE_EMULATOR_HOST;
    if (host) {
      try {
        const coverageUrl = `http://${host}/emulator/v1/projects/${PROJECT_ID}:ruleCoverage`;
        const res = await fetch(coverageUrl);
        check(
          "ruleCoverage HTTP is not runtime measurement evidence",
          true,
          `status ${res.status}; countAccessCalls remains a static source estimate`
        );
      } catch (e) {
        check(
          "ruleCoverage HTTP is not runtime measurement evidence",
          true,
          e instanceof Error ? e.message : String(e)
        );
      }
    }
  } finally {
    await testEnv.cleanup();
  }

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("letterheadQuota.emulator.test.ts: ok");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
