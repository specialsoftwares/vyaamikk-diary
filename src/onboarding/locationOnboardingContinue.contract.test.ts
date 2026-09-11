/**
 * VYD-21: confirmed PIN enables Continue; persist once; pending chrome;
 * stale persist cannot navigate after cancel; invalid PIN blocked; persist failure.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { confirmPinLocation } from "@/onboarding/pinConfirmation";
import {
  isIdentityContinueEnabled,
  validateOnboardingDraftForCompletion,
  type OnboardingProfileDraftV2,
} from "@/onboarding/profileIdentityModel";
import {
  createGenerationGuard,
  decideLocationContinueAction,
  decideLocationContinueAfterPersist,
  LOCATION_CONTINUE_REVIEW_HREF,
  locationContinueChrome,
} from "@/onboarding/locationOnboardingContinue";

const confirmed = confirmPinLocation({
  pinCode: "201016",
  locality: "Crossing Republik",
  district: "Ghaziabad",
  state: "Uttar Pradesh",
  source: "api",
  now: 9,
});

function draft(over: Partial<OnboardingProfileDraftV2> = {}): OnboardingProfileDraftV2 {
  return {
    schemaVersion: 2,
    uid: "u1",
    environment: "local-mock",
    accountKind: "individual",
    displayName: "Ada Lovelace",
    businessName: "",
    constitution: "",
    gstin: "",
    gstinVerificationState: "notProvided",
    pinCode: "201016",
    pinLocalityChoices: [],
    selectedLocality: "Crossing Republik",
    confirmedLocation: confirmed,
    profileLogo: {
      localUri: "file:///tmp/logo.jpg",
      mimeType: "image/jpeg",
      updatedAt: 1,
    },
    logoPreviewUri: "file:///tmp/logo.jpg",
    logoPersisted: true,
    updatedAt: 1,
    ...over,
  };
}

async function main() {
  // A. confirmed valid PIN enables progression
  assert.equal(
    isIdentityContinueEnabled({
      submitting: false,
      mediaBusy: false,
      pinStatus: "confirmed",
      confirmedLocation: confirmed,
      pinCode: "201016",
    }),
    true
  );

  const validationOk = validateOnboardingDraftForCompletion({
    signedIn: true,
    emailVerified: true,
    phoneE164: "+919876543210",
    email: "a@b.co",
    draft: draft(),
  });
  assert.equal(validationOk.ok, true);

  const proceed = decideLocationContinueAction({
    continueEnabled: true,
    validationOk: true,
  });
  assert.equal(proceed.kind, "persist-then-review");
  assert.equal(LOCATION_CONTINUE_REVIEW_HREF, "/(auth)/profile-review");

  // B. Continue progression exactly once (second begin invalidates first)
  const guard = createGenerationGuard();
  const first = guard.begin();
  const second = guard.begin();
  assert.equal(guard.isCurrent(first), false);
  assert.equal(guard.isCurrent(second), true);
  assert.equal(
    decideLocationContinueAfterPersist({
      generationCurrent: guard.isCurrent(first),
      persistOk: true,
    }),
    "ignore"
  );
  assert.equal(
    decideLocationContinueAfterPersist({
      generationCurrent: guard.isCurrent(second),
      persistOk: true,
    }),
    "navigate-review"
  );

  // C. pending persist produces visible pending chrome, not a dead enabled button
  assert.deepEqual(
    locationContinueChrome({ submitting: true, continueEnabled: true }),
    { loading: true, disabled: true }
  );
  assert.deepEqual(
    locationContinueChrome({ submitting: false, continueEnabled: true }),
    { loading: false, disabled: false }
  );

  // D. stale/obsolete persist cannot navigate after back/cancel
  const live = createGenerationGuard();
  const inFlight = live.begin();
  live.invalidate();
  assert.equal(
    decideLocationContinueAfterPersist({
      generationCurrent: live.isCurrent(inFlight),
      persistOk: true,
    }),
    "ignore"
  );

  // E. invalid / unconfirmed PIN cannot proceed
  assert.equal(
    isIdentityContinueEnabled({
      submitting: false,
      mediaBusy: false,
      pinStatus: "looking_up",
      confirmedLocation: null,
      pinCode: "201016",
    }),
    false
  );
  assert.equal(
    isIdentityContinueEnabled({
      submitting: false,
      mediaBusy: false,
      pinStatus: "idle",
      confirmedLocation: null,
      pinCode: "20101",
    }),
    false
  );
  const invalid = validateOnboardingDraftForCompletion({
    signedIn: true,
    emailVerified: true,
    phoneE164: "+919876543210",
    email: "a@b.co",
    draft: draft({ pinCode: "20101", confirmedLocation: null }),
  });
  assert.equal(invalid.ok, false);
  const blocked = decideLocationContinueAction({
    continueEnabled: false,
    validationOk: false,
    validationMessage: invalid.ok ? undefined : invalid.message,
  });
  assert.equal(blocked.kind, "blocked");

  // F. persistence failure surfaces error, allows retry (generation still current)
  const retryGuard = createGenerationGuard();
  const attempt = retryGuard.begin();
  assert.equal(
    decideLocationContinueAfterPersist({
      generationCurrent: retryGuard.isCurrent(attempt),
      persistOk: false,
      persistMessage: "Could not save. Try again.",
    }),
    "show-error"
  );
  assert.equal(retryGuard.isCurrent(attempt), true);

  const screen = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../auth-v2/screens/BusinessIdentityScreen.tsx"),
    "utf8"
  );
  assert.match(screen, /createGenerationGuard/);
  assert.match(screen, /decideLocationContinueAfterPersist/);
  assert.match(screen, /LOCATION_CONTINUE_REVIEW_HREF/);
  assert.match(screen, /Keyboard\.dismiss/);

  console.log("locationOnboardingContinue.contract.test.ts: ok");
}

void main();
