/**
 * Review Mutation Propagation Contract
 *
 * MUTATION COMMAND SUCCESS != FEATURE SUCCESS
 *
 * A user-visible Review mutation is complete only when:
 * 1. command/service succeeds
 * 2. authoritative state is updated
 * 3. local/session/domain state reconciles
 * 4. dependent consumers receive the new state
 * 5. user returns to the correct route
 * 6. consuming screen renders the new value
 * 7. stale draft/fixture/snapshot cannot overwrite it
 * 8. remount/reopen reflects the committed value where persistence applies
 *
 * Ordering:
 * VERIFY → AUTHORITATIVE BIND → RECEIVE UPDATED IDENTITY → APPLY CENTRAL STATE
 * → CONFIRM CENTRAL STATE → SUCCESS ACK → RETURN TO CONSUMER
 */

import type { UserProfile } from "@/domain/types";

export type ReviewVerifiedContactsSnapshot = {
  phoneE164: string;
  email: string;
  emailVerified: boolean;
};

/** Merge authoritative verified contacts into a Review presentation model. */
export function mergeVerifiedContactsIntoReviewModel<T extends ReviewVerifiedContactsSnapshot>(
  model: T,
  contacts: ReviewVerifiedContactsSnapshot
): T {
  return {
    ...model,
    phoneE164: contacts.phoneE164,
    email: contacts.email,
    emailVerified: contacts.emailVerified,
  };
}

/**
 * After verified contact bind, derive the Review-facing contact snapshot from
 * the authoritative profile (never from pending OTP input alone).
 */
export function reviewContactsFromAuthoritativeProfile(
  profile: UserProfile,
  emailVerified: boolean
): ReviewVerifiedContactsSnapshot {
  return {
    phoneE164: profile.phoneE164,
    email: (profile.normalizedEmail ?? profile.businessEmail ?? "").trim(),
    emailVerified,
  };
}

/**
 * Assert central state already shows the committed contact before success navigation.
 * Throws in DEV-oriented tests; production callers treat false as reconciliation failure.
 */
export function assertContactPropagated(args: {
  expectedPhoneE164?: string;
  expectedEmail?: string;
  centralPhoneE164: string;
  centralEmail: string;
}): boolean {
  if (
    args.expectedPhoneE164 != null &&
    args.centralPhoneE164 !== args.expectedPhoneE164
  ) {
    return false;
  }
  if (args.expectedEmail != null && args.centralEmail !== args.expectedEmail) {
    return false;
  }
  return true;
}

/** Narrow identity patch — never carries stale phone/email/gstin/etc. */
export type ReviewIdentityPatch = {
  displayName: string;
  businessName: string;
};

export type ReviewLogoPatch = {
  logoUri: string | null;
};

export type ReviewLocationPatch = {
  pinCode: string;
  confirmedLocation: {
    locality: string | null;
    district: string;
    state: string;
  } | null;
};

export type ReviewGstinPatch = {
  gstin: string;
  gstinVerificationState: string;
};

export type ReviewConstitutionPatch = {
  constitution: string;
};
