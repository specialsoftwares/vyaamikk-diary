/**
 * Shared mutable Review session for the onboarding UX harness.
 *
 * Mutation Propagation Contract (harness):
 * command success → patch this session → consumers read session → UI shows new value.
 * Editors must commit narrow field patches; never replace the whole session from a stale snapshot.
 */

import type { GstinVerificationState } from "@/onboarding/profileIdentityModel";

import type { ConfirmedPinPreview } from "./IdentityLocationPreview";

export type HarnessReviewSession = {
  displayName: string;
  businessName: string;
  constitution: string;
  gstin: string;
  gstinState: GstinVerificationState;
  pinCode: string;
  confirmedPin: ConfirmedPinPreview | null;
  phoneE164: string;
  email: string;
  logoUri: string | null;
};

export type HarnessReviewSessionPatch = Partial<HarnessReviewSession>;

/** Field ownership for Review editors — prevents lost-update whole-object replaces. */
export const HARNESS_REVIEW_EDITOR_FIELDS = {
  identity: ["displayName", "businessName"] as const,
  media: ["logoUri"] as const,
  contacts: ["phoneE164", "email"] as const,
  location: ["pinCode", "confirmedPin"] as const,
  gstin: ["gstin", "gstinState"] as const,
  constitution: ["constitution"] as const,
} as const;

export type HarnessReviewEditorTarget = keyof typeof HARNESS_REVIEW_EDITOR_FIELDS;

/**
 * Apply a narrow patch immutably. Unknown keys are ignored.
 * Contact fields only change when explicitly present in the patch (pending never leaks).
 */
export function applyHarnessReviewSessionPatch(
  session: HarnessReviewSession,
  patch: HarnessReviewSessionPatch
): HarnessReviewSession {
  const next: HarnessReviewSession = { ...session };
  if (patch.displayName !== undefined) next.displayName = patch.displayName;
  if (patch.businessName !== undefined) next.businessName = patch.businessName;
  if (patch.constitution !== undefined) next.constitution = patch.constitution;
  if (patch.gstin !== undefined) next.gstin = patch.gstin;
  if (patch.gstinState !== undefined) next.gstinState = patch.gstinState;
  if (patch.pinCode !== undefined) next.pinCode = patch.pinCode;
  if (patch.confirmedPin !== undefined) next.confirmedPin = patch.confirmedPin;
  if (patch.phoneE164 !== undefined) next.phoneE164 = patch.phoneE164;
  if (patch.email !== undefined) next.email = patch.email;
  if (patch.logoUri !== undefined) next.logoUri = patch.logoUri;
  return next;
}

/** Restrict a patch to fields owned by one editor (lost-update guard). */
export function narrowHarnessEditorPatch(
  target: HarnessReviewEditorTarget,
  patch: HarnessReviewSessionPatch
): HarnessReviewSessionPatch {
  const allowed = new Set<string>(HARNESS_REVIEW_EDITOR_FIELDS[target]);
  const out: HarnessReviewSessionPatch = {};
  for (const key of Object.keys(patch) as (keyof HarnessReviewSessionPatch)[]) {
    if (allowed.has(key) && patch[key] !== undefined) {
      (out as Record<string, unknown>)[key] = patch[key];
    }
  }
  return out;
}

export function commitVerifiedMobile(
  session: HarnessReviewSession,
  phoneE164: string
): HarnessReviewSession {
  return applyHarnessReviewSessionPatch(session, { phoneE164 });
}

export function commitVerifiedEmail(
  session: HarnessReviewSession,
  email: string
): HarnessReviewSession {
  return applyHarnessReviewSessionPatch(session, { email });
}

export function createInitialHarnessReviewSession(
  overrides?: Partial<HarnessReviewSession>
): HarnessReviewSession {
  return {
    displayName: "Shivam A",
    businessName: "Acme Practice",
    constitution: "Proprietorship",
    gstin: "27ABCDE1234F1Z5",
    gstinState: "formatValid",
    pinCode: "400001",
    confirmedPin: {
      locality: "Fort",
      district: "Mumbai",
      state: "Maharashtra",
    },
    phoneE164: "+919876543210",
    email: "owner@example.com",
    logoUri: null,
    ...overrides,
  };
}
