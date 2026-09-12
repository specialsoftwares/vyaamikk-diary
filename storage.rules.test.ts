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
import { getBytes, ref, uploadBytes } from "firebase/storage";

const PROJECT_ID = "vyaamikk-diary-storage-rules-test";
const RULES_PATH = resolve(process.cwd(), "storage.rules");

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
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
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
