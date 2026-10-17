/**
 * The letterhead editor no longer saves. Firestore template writes that
 * remain for older queued work still recheck the session.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("retired screens do not save a template", () => {
  for (const rel of ["../../../app/(app)/letterhead/setup.tsx", "../../../app/(app)/letterhead/generate.tsx"]) {
    const src = fs.readFileSync(path.join(import.meta.dirname, rel), "utf8");
    assert.doesNotMatch(src, /\.save\(/);
    assert.doesNotMatch(src, /createLetterheadSetupEditorRuntime/);
  }
});

test("firebase letterhead repository still checks the dispatched session", () => {
  const firebase = fs.readFileSync(path.join(import.meta.dirname, "firebase.ts"), "utf8");
  assert.match(firebase, /assertDispatchedSession\(session, userId\)/);
  assert.match(
    firebase,
    /uploadLetterheadImage\(\s*userId,\s*incomingImage,\s*undefined,\s*session\s*\)/
  );
});
