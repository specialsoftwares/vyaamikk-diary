/**
 * Identity screen contracts: media pick once, PIN lookup/confirm, Save enablement.
 */

import assert from "node:assert/strict";

import {
  acceptPinInput,
  applyPinLookupResult,
  confirmPinLocation,
  nextPinLookupRequestId,
  type PinLookupUiState,
} from "@/onboarding/pinConfirmation";
import {
  isIdentityContinueEnabled,
  validateOnboardingDraftForCompletion,
  type OnboardingProfileDraftV2,
} from "@/onboarding/profileIdentityModel";
import { validateIdentityMediaCandidate } from "@/onboarding/identityMediaValidation";
import { shouldQueryOfflinePincodeOnInteractivePath } from "@/services/location/pincodeWarmPolicy";

function baseDraft(over: Partial<OnboardingProfileDraftV2> = {}): OnboardingProfileDraftV2 {
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
    selectedLocality: null,
    confirmedLocation: null,
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

function rendersPinConfirmationUi(status: PinLookupUiState["status"]): boolean {
  return status === "ready_to_confirm" || status === "choices";
}

async function main() {
  // --- CAMERA / GALLERY: URI persistence without base64 bridge ---
  {
    const ok = validateIdentityMediaCandidate({
      mimeType: "image/jpeg",
      width: 512,
      height: 512,
      approxBytes: 80_000,
      uri: "file:///tmp/profile.jpg",
      base64: null,
    });
    assert.equal(ok.ok, true);

    const deniedEmpty = validateIdentityMediaCandidate({
      mimeType: "image/jpeg",
      width: 512,
      height: 512,
      approxBytes: 80_000,
      uri: null,
      base64: null,
    });
    assert.equal(deniedEmpty.ok, false);

    const tooLarge = validateIdentityMediaCandidate({
      mimeType: "image/jpeg",
      width: 512,
      height: 512,
      approxBytes: 600_000,
      uri: "file:///tmp/big.jpg",
      base64: null,
    });
    assert.equal(tooLarge.ok, false);
    if (!tooLarge.ok) assert.equal(tooLarge.reason, "too_large");
  }

  // --- PIN incomplete → no lookup trigger contract (accept only) ---
  {
    assert.equal(acceptPinInput("20101"), "20101");
    assert.equal(acceptPinInput("201016"), "201016");
  }

  // --- Interactive PIN must not query offline until ready ---
  {
    assert.equal(shouldQueryOfflinePincodeOnInteractivePath(false), false);
    assert.equal(shouldQueryOfflinePincodeOnInteractivePath(true), true);
  }

  // --- Singular API-shaped result → ready_to_confirm + confirmation UI ---
  {
    const requestId = nextPinLookupRequestId();
    const next = applyPinLookupResult({
      requestId,
      latestRequestId: requestId,
      pinCode: "201016",
      currentPinCode: "201016",
      resolution: {
        pinCode: "201016",
        success: true,
        source: "api",
        localities: ["Crossing Republik"],
        defaultLocality: "Crossing Republik",
        district: "Ghaziabad",
        state: "Uttar Pradesh",
        country: "India",
      },
    });
    assert.equal(next?.status, "ready_to_confirm");
    if (next?.status === "ready_to_confirm") {
      assert.equal(next.locality, "Crossing Republik");
      assert.equal(next.district, "Ghaziabad");
      assert.equal(next.state, "Uttar Pradesh");
      assert.equal(rendersPinConfirmationUi(next.status), true);
    }
  }

  // --- Ambiguous → choices UI ---
  {
    const requestId = nextPinLookupRequestId();
    const next = applyPinLookupResult({
      requestId,
      latestRequestId: requestId,
      pinCode: "110001",
      currentPinCode: "110001",
      resolution: {
        pinCode: "110001",
        success: true,
        source: "api",
        localities: ["A", "B"],
        defaultLocality: "A",
        district: "New Delhi",
        state: "Delhi",
        country: "India",
      },
    });
    assert.equal(next?.status, "choices");
    assert.equal(rendersPinConfirmationUi(next!.status), true);
  }

  // --- No result / network-style manual failure ---
  {
    const requestId = nextPinLookupRequestId();
    const notFound = applyPinLookupResult({
      requestId,
      latestRequestId: requestId,
      pinCode: "201016",
      currentPinCode: "201016",
      resolution: {
        pinCode: "201016",
        success: false,
        source: "api",
        localities: [],
        defaultLocality: null,
        district: null,
        state: null,
        country: "India",
      },
    });
    assert.equal(notFound?.status, "not_found");
    assert.equal(rendersPinConfirmationUi(notFound!.status), false);

    const unavailable = applyPinLookupResult({
      requestId,
      latestRequestId: requestId,
      pinCode: "201016",
      currentPinCode: "201016",
      resolution: {
        pinCode: "201016",
        success: false,
        source: "manual",
        localities: [],
        defaultLocality: null,
        district: null,
        state: null,
        country: "India",
      },
    });
    assert.equal(unavailable?.status, "unavailable");
    assert.equal(rendersPinConfirmationUi(unavailable!.status), false);
  }

  // --- Stale request ignored ---
  {
    const older = nextPinLookupRequestId();
    const newer = nextPinLookupRequestId();
    const stale = applyPinLookupResult({
      requestId: older,
      latestRequestId: newer,
      pinCode: "201016",
      currentPinCode: "201016",
      resolution: {
        pinCode: "201016",
        success: true,
        source: "api",
        localities: ["Crossing Republik"],
        defaultLocality: "Crossing Republik",
        district: "Ghaziabad",
        state: "Uttar Pradesh",
        country: "India",
      },
    });
    assert.equal(stale, null);
  }

  // --- Save disabled until confirmed; enabled after confirm ---
  {
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
        pinStatus: "ready_to_confirm",
        confirmedLocation: null,
        pinCode: "201016",
      }),
      false
    );
    assert.equal(
      isIdentityContinueEnabled({
        submitting: false,
        mediaBusy: true,
        pinStatus: "confirmed",
        confirmedLocation: confirmPinLocation({
          pinCode: "201016",
          locality: "Crossing Republik",
          district: "Ghaziabad",
          state: "Uttar Pradesh",
          source: "api",
        }),
        pinCode: "201016",
      }),
      false
    );

    const location = confirmPinLocation({
      pinCode: "201016",
      locality: "Crossing Republik",
      district: "Ghaziabad",
      state: "Uttar Pradesh",
      source: "api",
      now: 9,
    });
    assert.equal(
      isIdentityContinueEnabled({
        submitting: false,
        mediaBusy: false,
        pinStatus: "confirmed",
        confirmedLocation: location,
        pinCode: "201016",
      }),
      true
    );

    const unresolved = validateOnboardingDraftForCompletion({
      signedIn: true,
      emailVerified: true,
      phoneE164: "+919876543210",
      email: "a@b.co",
      draft: baseDraft({ confirmedLocation: null }),
    });
    assert.equal(unresolved.ok, false);
    if (!unresolved.ok) assert.equal(unresolved.blocker, "pin_confirmation_required");

    const resolved = validateOnboardingDraftForCompletion({
      signedIn: true,
      emailVerified: true,
      phoneE164: "+919876543210",
      email: "a@b.co",
      draft: baseDraft({
        confirmedLocation: location,
        selectedLocality: "Crossing Republik",
      }),
    });
    assert.equal(resolved.ok, true);
  }

  console.log("identityImagePin.contract.test.ts: ok");
}

void main();
