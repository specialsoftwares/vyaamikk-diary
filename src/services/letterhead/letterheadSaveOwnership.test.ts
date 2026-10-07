/**
 * Source wiring: setup/generate/firebase pass session into save.
 * Acceptance ownership behaviour lives in letterheadSetupEditor.runtime.test.ts
 * (production runtime + real memory repository — not a mirrored save stub).
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("setup/generate/firebase source pass session into save", () => {
  const setup = fs.readFileSync(
    path.join(import.meta.dirname, "../../../app/(app)/letterhead/setup.tsx"),
    "utf8"
  );
  const generate = fs.readFileSync(
    path.join(import.meta.dirname, "../../../app/(app)/letterhead/generate.tsx"),
    "utf8"
  );
  const firebase = fs.readFileSync(
    path.join(import.meta.dirname, "firebase.ts"),
    "utf8"
  );
  const runtime = fs.readFileSync(
    path.join(import.meta.dirname, "letterheadSetupEditorRuntime.ts"),
    "utf8"
  );
  assert.match(setup, /createLetterheadSetupEditorRuntime/);
  assert.match(setup, /runtime\.save\(/);
  assert.match(generate, /\.save\(\s*user\.uid,\s*\{[\s\S]*\},\s*session\s*\)/);
  assert.match(
    firebase,
    /uploadLetterheadImage\(\s*userId,\s*incomingImage,\s*undefined,\s*session\s*\)/
  );
  assert.match(firebase, /assertDispatchedSession\(session, userId\)/);
  assert.match(runtime, /stillOwns\(opOwner\)/);
  assert.match(runtime, /clearedRetiredOwnerFields/);
  assert.match(runtime, /neither restore|Stale completion|return \{ navigate: false \}/);
});
