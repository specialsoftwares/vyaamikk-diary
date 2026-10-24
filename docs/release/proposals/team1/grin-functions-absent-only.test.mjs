import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { GRIN_FUNCTIONS, PROJECT_ID } from "../../packets/grin-ops/grin-functions-op.mjs";
import {
  AbsentOnlyAbort,
  appendJournalLine,
  assertCreateAbsentOnlyPlan,
  buildFirebaseAbsentOnlyArgs,
  classifyGrinInventory,
  createJournalDirForTests,
  firebaseAbsentOnlyIsUnsafe,
  planCreateAbsentOnly,
} from "./grin-functions-absent-only.mjs";

function mixedFixture() {
  const out = {};
  for (const [i, name] of GRIN_FUNCTIONS.entries()) {
    out[name] = { presence: i < 3 ? "present" : "absent", sourceOrigin: i < 3 ? "gcs" : "absent" };
  }
  return out;
}

test("mixed 3 PRESENT + 4 ABSENT plans absent-only --only of the four missing names", () => {
  const fixture = mixedFixture();
  const plan = planCreateAbsentOnly(fixture);
  assert.deepEqual(plan.present, GRIN_FUNCTIONS.slice(0, 3));
  assert.deepEqual(plan.absent, GRIN_FUNCTIONS.slice(3));
  assert.equal(plan.args[1], "--project");
  assert.equal(plan.args[2], PROJECT_ID);
  assert.equal(firebaseAbsentOnlyIsUnsafe(plan.args, plan.absent), false);
  const only = plan.args[plan.args.indexOf("--only") + 1];
  for (const name of plan.present) {
    assert.equal(only.includes(`functions:${name}`), false);
  }
  for (const name of plan.absent) {
    assert.equal(only.includes(`functions:${name}`), true);
  }
  assert.equal(only.split(",").length, 4);
  assert.equal(only.includes("functions:grin"), true);
});

test("UNKNOWN anywhere blocks create-absent-only", () => {
  const fixture = mixedFixture();
  fixture.grinUploadEvidence = { presence: "unknown" };
  assert.throws(() => assertCreateAbsentOnlyPlan(fixture), AbsentOnlyAbort);
});

test("all-absent refuses create-absent-only (gate-off-initial path)", () => {
  const fixture = Object.fromEntries(GRIN_FUNCTIONS.map((n) => [n, { presence: "absent" }]));
  assert.throws(() => planCreateAbsentOnly(fixture), /gate-off-initial/);
});

test("all-present refuses create-absent-only", () => {
  const fixture = Object.fromEntries(
    GRIN_FUNCTIONS.map((n) => [n, { presence: "present", sourceOrigin: "gcs" }]),
  );
  assert.throws(() => planCreateAbsentOnly(fixture), /all seven PRESENT/);
});

test("all-seven absent-only argv is unsafe", () => {
  assert.throws(() => buildFirebaseAbsentOnlyArgs([...GRIN_FUNCTIONS]), /all seven/);
  assert.equal(
    firebaseAbsentOnlyIsUnsafe(
      ["deploy", "--only", GRIN_FUNCTIONS.map((n) => `functions:${n}`).join(",")],
      GRIN_FUNCTIONS.slice(3),
    ),
    true,
  );
  assert.equal(firebaseAbsentOnlyIsUnsafe(["deploy", "--only", "functions"], ["grinUploadEvidence"]), true);
});

test("non-GRIN name in absent list is refused", () => {
  assert.throws(() => buildFirebaseAbsentOnlyArgs(["mintClientAuthToken"]), /not a GRIN/);
});

test("classify reports mixed vs incomplete", () => {
  const mixed = classifyGrinInventory(mixedFixture());
  assert.equal(mixed.mixed, true);
  assert.equal(mixed.unknown.length, 0);
  const incomplete = classifyGrinInventory({ grinRegisterGoodsReceipt: { presence: "absent" } });
  assert.equal(incomplete.unknown.length, GRIN_FUNCTIONS.length - 1);
  assert.equal(incomplete.mixed, false);
});

test("journal appends JSONL without env values and refuses secret-like keys", () => {
  const dir = createJournalDirForTests(mkdtempSync(join(tmpdir(), "grin-journal-")));
  const path = appendJournalLine(dir, {
    op: "create-absent-only",
    name: "grinUploadEvidence",
    presence: "absent",
    revision_if_known: null,
    firebase_hash_if_known: null,
    at: "2026-10-06T00:00:00.000Z",
  });
  const text = readFileSync(path, "utf8");
  assert.match(text, /grinUploadEvidence/);
  assert.doesNotMatch(text, /GRIN_GOODS_EVIDENCE_FUNCTIONS/);
  assert.doesNotMatch(text, /Bearer/);
  assert.throws(
    () => appendJournalLine(dir, { op: "enable", name: "grinUploadEvidence", env: { GATE: "true" } }),
    /forbidden/,
  );
  assert.throws(() => appendJournalLine(join(dir, "missing-subdir"), { op: "x", name: "grinUploadEvidence" }), /missing/);
  rmSync(dir, { recursive: true, force: true });
});
