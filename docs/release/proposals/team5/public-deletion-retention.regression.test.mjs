/**
 * Team 5 SOURCE regression: public deletion/retention at application SHA
 * 5d5df3d. Expected FAIL until GRIN paths are in the implemented deletion
 * architecture AND a public-approved window exists.
 *
 * 15-day grace is implemented diary deletion. 180-day requested is neither
 * implemented nor Play-certified. Do not "fix" this suite by weakening
 * purge ownership checks or by treating 180 as closed.
 *
 * Label: SOURCE. Not application CI. Not LIVE_BACKEND.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(rel) {
  return readFileSync(join(repoRoot, rel), "utf8");
}

test("implemented storage purge prefixes include grinEvidence", () => {
  const src = read("functions/src/deletion/userOwnedStoragePaths.ts");
  assert.equal(
    src.includes('"grinEvidence"'),
    true,
    "users/{uid}/grinEvidence/** is not in the implemented deletion prefixes"
  );
});

test("implemented Firestore purge includes GRIN first-level trees", () => {
  const src = read("functions/src/deletion/firestorePurge.ts");
  const listed =
    src.includes("goodsEvidenceAdmission") ||
    src.includes("goodsEvidenceLedgers") ||
    src.includes("grinEvidenceObjectKeys");
  assert.equal(
    listed,
    true,
    "USER_SUBCOLLECTIONS has no goodsEvidence* / grinEvidence* trees"
  );
});

test("functions/src/deletion mentions GRIN evidence paths", () => {
  const combined =
    read("functions/src/deletion/firestorePurge.ts") +
    "\n" +
    read("functions/src/deletion/userOwnedStoragePaths.ts");
  assert.equal(
    /goodsEvidence|grinEvidence/.test(combined),
    true,
    "deletion architecture still has no GRIN path tokens"
  );
});

test("180-day requested window is not the implemented grace", () => {
  const lifecycle = read("src/domain/identityLifecycle.ts");
  const finalPurge = read("functions/src/deletion/finalPurge.ts");
  assert.equal(lifecycle.includes("export const DELETION_GRACE_DAYS = 15;"), true);
  assert.equal(
    finalPurge.includes("export const DELETION_GRACE_MS = 15 * 24 * 60 * 60 * 1000;"),
    true
  );
  assert.equal(lifecycle.includes("DELETION_GRACE_DAYS = 180"), false);
  assert.equal(finalPurge.includes("180 * 24 * 60 * 60 * 1000"), false);
});
