import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  OPTIONAL_MEDIA_ABSENT_MUST_NOT_SAY,
  OPTIONAL_MEDIA_PENDING_MESSAGE,
  classifyIdentityMediaForCompletion,
  optionalIdentityMediaCompletionError,
} from "@/onboarding/optionalIdentityMedia";

const root = join(__dirname, "../..");

assert.equal(
  classifyIdentityMediaForCompletion({
    profileLogo: null,
    logoPersisted: false,
    logoPreviewUri: null,
  }),
  "absent"
);
assert.equal(
  optionalIdentityMediaCompletionError("absent"),
  null,
  "missing optional image must not block completion"
);
assert.equal(
  classifyIdentityMediaForCompletion({
    profileLogo: { localUri: "file://logo.jpg" },
    logoPersisted: true,
  }),
  "durable"
);
assert.equal(optionalIdentityMediaCompletionError("durable"), null);
assert.equal(
  classifyIdentityMediaForCompletion({
    profileLogo: { localUri: "file://tmp.jpg" },
    logoPersisted: false,
  }),
  "pending"
);
assert.equal(
  classifyIdentityMediaForCompletion({
    profileLogo: null,
    logoPersisted: false,
    logoPreviewUri: "file://preview.jpg",
  }),
  "pending"
);
assert.equal(optionalIdentityMediaCompletionError("pending"), OPTIONAL_MEDIA_PENDING_MESSAGE);

const completion = readFileSync(
  join(root, "src/onboarding/completeOnboardingProfile.ts"),
  "utf8"
);
assert.doesNotMatch(completion, /if \(!uri \|\| !draft\.logoPersisted\)/);
assert.equal(completion.includes(OPTIONAL_MEDIA_ABSENT_MUST_NOT_SAY), false);
assert.match(completion, /classifyIdentityMediaForCompletion/);

const presentation = readFileSync(
  join(root, "src/auth-v2/screens/ProfileReviewPresentation.tsx"),
  "utf8"
);
assert.ok(
  presentation.indexOf("await onConfirmPersist()") <
    presentation.indexOf('setPhase("workspace")')
);

console.log("optionalIdentityMedia.contract.test.ts: ok");
