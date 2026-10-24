/**
 * Firebase Storage rules — GST artefact isolation (VYD-40).
 *
 * Run: npm run test:storage-rules
 * (Firestore-emulator-style harness; excluded from test:all, included in ci:verify.)
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";

const PROJECT_ID = "vyaamikk-diary-storage-rules-test";
const RULES_PATH = resolve(process.cwd(), "storage.rules");
const FIRESTORE_RULES_PATH = resolve(process.cwd(), "firestore.rules");

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
  console.log("storage.rules emulator tests");
  const rules = readFileSync(RULES_PATH, "utf8");
  const firestoreRules = readFileSync(FIRESTORE_RULES_PATH, "utf8");
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: firestoreRules },
    storage: { rules },
  });

  try {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const storage = ctx.storage();
      await uploadBytes(ref(storage, "company/invoices/2026-27/inv1.pdf"), Buffer.from("%PDF-1.4"));
      await uploadBytes(
        ref(storage, "company/gstr1-reports/2026-09/r1.json"),
        Buffer.from("{}")
      );
      await uploadBytes(ref(storage, "users/alice/letterhead/logo.png"), Buffer.from("png"), {
        contentType: "image/png",
      });
    });

    const alice = testEnv.authenticatedContext("alice").storage();
    const mallory = testEnv.authenticatedContext("mallory").storage();
    const anon = testEnv.unauthenticatedContext().storage();

    await assertFails(getBytes(ref(alice, "company/invoices/2026-27/inv1.pdf")));
    check("client cannot read company/invoices", true);

    await assertFails(
      uploadBytes(ref(alice, "company/invoices/2026-27/hack.pdf"), Buffer.from("x"), {
        contentType: "application/pdf",
      })
    );
    check("client cannot write company/invoices", true);

    await assertFails(getBytes(ref(alice, "company/gstr1-reports/2026-09/r1.json")));
    check("client cannot read company/gstr1-reports", true);

    await assertFails(
      uploadBytes(ref(alice, "company/gstr1-reports/2026-09/hack.csv"), Buffer.from("x"))
    );
    check("client cannot write company/gstr1-reports", true);

    await assertFails(getBytes(ref(anon, "company/invoices/2026-27/inv1.pdf")));
    check("unauthenticated cannot read company/invoices", true);

    await assertSucceeds(getBytes(ref(alice, "users/alice/letterhead/logo.png")));
    check("owner still reads own letterhead", true);

    await assertFails(getBytes(ref(mallory, "users/alice/letterhead/logo.png")));
    check("cross-user letterhead read denied", true);

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "authSecurity", "alice"), {
        revokedBeforeAuthTimeSeconds: 1_500,
        revocationState: "complete",
        operationId: "11111111-1111-1111-1111-111111111111",
      });
    });
    const revoked = testEnv
      .authenticatedContext("alice", {
        auth_time: 2_000,
        firebase: { sign_in_provider: "custom" },
        vydOriginAuthTime: 1_000,
      })
      .storage();
    const refreshed = testEnv
      .authenticatedContext("alice", {
        auth_time: 1_501,
        firebase: { sign_in_provider: "phone" },
      })
      .storage();
    await assertFails(getBytes(ref(revoked, "users/alice/letterhead/logo.png")));
    check("EMULATOR storage denies a pre-revocation custom token", true);
    await assertSucceeds(getBytes(ref(refreshed, "users/alice/letterhead/logo.png")));
    check("EMULATOR storage allows phone auth after the cutoff", true);

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "alice"), {
        uid: "alice",
        status: "active",
        ageEligibility: "eligible",
      });
      await setDoc(doc(ctx.firestore(), "users", "young"), {
        uid: "young",
        status: "active",
        ageEligibility: "unassessed",
      });
      await setDoc(doc(ctx.firestore(), "users", "minor"), {
        uid: "minor",
        status: "active",
        ageEligibility: "ineligible",
      });
    });
    const eligible = testEnv
      .authenticatedContext("alice", {
        auth_time: 2_000,
        firebase: { sign_in_provider: "phone" },
      })
      .storage();
    const unassessed = testEnv.authenticatedContext("young").storage();
    const ineligible = testEnv.authenticatedContext("minor").storage();
    const sealType = "application/vnd.vyaamikk.content-seal+json";
    await assertSucceeds(
      uploadBytes(ref(eligible, "users/alice/attachments/rec1/receipt.bin"), Buffer.from("{\"v\":1}"), {
        contentType: sealType,
      })
    );
    check("eligible owner can write an attachment envelope", true);
    await assertSucceeds(
      uploadBytes(ref(eligible, "users/alice/attachments/rec1/legacy.jpg"), Buffer.from("jpg"), {
        contentType: "image/jpeg",
      })
    );
    check("eligible owner can still write a legacy image", true);
    await assertSucceeds(getBytes(ref(eligible, "users/alice/letterhead/logo.png")));
    check("legacy image read stays available", true);
    await assertFails(
      uploadBytes(ref(unassessed, "users/young/attachments/rec1/receipt.bin"), Buffer.from("{\"v\":1}"), {
        contentType: sealType,
      })
    );
    check("unassessed account cannot write storage", true);
    await assertFails(
      uploadBytes(ref(ineligible, "users/minor/attachments/rec1/receipt.bin"), Buffer.from("{\"v\":1}"), {
        contentType: sealType,
      })
    );
    check("ineligible account cannot write storage", true);
    await assertFails(
      uploadBytes(ref(eligible, "users/alice/pdfs/rec1/sealed.bin"), Buffer.from("{\"v\":1}"), {
        contentType: sealType,
      })
    );
    check("envelope content type is denied on the pdf path", true);

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "restoreControl", "current"), { closed: true, watermark: 7 });
    });
    const unmarked = testEnv.authenticatedContext("alice", {
      auth_time: 2_000,
      firebase: { sign_in_provider: "phone" },
    }).storage();
    const marked = testEnv.authenticatedContext("alice", {
      auth_time: 2_000,
      firebase: { sign_in_provider: "phone" },
      authorityWatermark: 7,
    }).storage();
    await assertFails(getBytes(ref(unmarked, "users/alice/letterhead/logo.png")));
    check("closed restore fence denies a storage read without a watermark", true);
    await assertFails(getBytes(ref(marked, "users/alice/letterhead/logo.png")));
    check("closed restore fence denies a storage read with a matching watermark", true);
  } finally {
    await testEnv.cleanup();
  }

  if (failures > 0) {
    console.error(`${failures} failure(s)`);
    process.exit(1);
  }
  console.log("all storage.rules tests passed");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
