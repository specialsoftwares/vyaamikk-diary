import assert from "node:assert/strict";

import {
  describeLetterheadSaveFailure,
  lastLetterheadSaveDiagnostic,
  recordLetterheadSaveDiagnostic,
  resetLetterheadSaveDiagnostic,
} from "./letterheadSaveDiagnostics";
import { letterheadSetupFailureMessage } from "./letterheadSetupSaveError";

resetLetterheadSaveDiagnostic();
const missing = describeLetterheadSaveFailure(
  new Error("Local file missing or size unknown for Storage upload. file:///private/photo.jpg"),
  "upload"
);
assert.equal(missing, "letterhead_stage:upload:local_file_missing");
assert.doesNotMatch(missing, /file:|private|photo/);

const http = describeLetterheadSaveFailure(new Error("Storage upload failed (HTTP 403)."), "upload");
assert.equal(http, "letterhead_stage:upload:http_403");

const pathy = describeLetterheadSaveFailure(
  new Error("ENOENT: /Users/owner/Library/Caches/tpl.jpg"),
  "upload"
);
assert.equal(pathy, "letterhead_stage:upload:failed");
assert.doesNotMatch(pathy, /Users|Caches|tpl/);

assert.equal(describeLetterheadSaveFailure(new Error("transient"), "upload"), "transient");
assert.equal(
  describeLetterheadSaveFailure(new Error("letterhead_stage:crop:crop_failed"), "upload"),
  "letterhead_stage:crop:crop_failed"
);

recordLetterheadSaveDiagnostic("upload", "failed", missing);
assert.deepEqual(lastLetterheadSaveDiagnostic(), {
  stage: "upload",
  outcome: "failed",
  code: missing,
});

const shown = letterheadSetupFailureMessage({
  error: missing,
  needImage: "need",
  loadFailed: "load",
  unchanged: "Could not save; your current letterhead is unchanged.",
});
assert.match(shown ?? "", /not available to upload/);
assert.match(shown ?? "", /unchanged/);
assert.doesNotMatch(shown ?? "", /file:|private/);

console.log("letterheadSaveDiagnostics.test.ts: ok");
