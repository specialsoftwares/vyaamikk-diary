/**
 * Atomic onboarding completion — injectable IO for durable logo + profile write.
 */

import { AppError } from "@/domain/errors";
import type { UserProfile } from "@/domain/types";
import type { ProfilePatch } from "@/services/auth/types";
import {
  buildDocumentFacingIdentity,
  validateOnboardingDraftForCompletion,
  type OnboardingProfileDraftV2,
} from "@/onboarding/profileIdentityModel";
import type { IssuerIdentitySnapshotRecord } from "@/onboarding/issuerIdentitySnapshot";

const inFlightByUid = new Map<string, Promise<CompleteOnboardingResult>>();

export interface CompleteOnboardingInput {
  user: UserProfile;
  draft: OnboardingProfileDraftV2;
  updateProfile: (patch: ProfilePatch) => Promise<UserProfile>;
  persistSnapshot: (record: IssuerIdentitySnapshotRecord) => Promise<void>;
  assertDurableLogo: (draft: OnboardingProfileDraftV2) => Promise<void>;
  clearDraft: (uid: string) => Promise<void>;
  now?: number;
}

export interface CompleteOnboardingResult {
  profile: UserProfile;
  snapshot: IssuerIdentitySnapshotRecord;
}

async function completeOnce(input: CompleteOnboardingInput): Promise<CompleteOnboardingResult> {
  const now = input.now ?? Date.now();
  const email = input.user.normalizedEmail ?? input.user.businessEmail ?? "";
  const validation = validateOnboardingDraftForCompletion({
    signedIn: true,
    emailVerified:
      input.user.emailStatus === "verified" && Boolean(input.user.emailVerifiedAt),
    phoneE164: input.user.phoneE164,
    email,
    draft: input.draft,
  });
  if (!validation.ok) {
    throw new AppError("unknown", validation.message, undefined, {
      blocker: validation.blocker,
    });
  }
  if (input.draft.uid !== input.user.uid) {
    throw new AppError("auth_failed", "Profile draft does not match the signed-in account.");
  }

  await input.assertDurableLogo(input.draft);

  const snapshotVersion = 1;
  const identity = buildDocumentFacingIdentity({
    draft: input.draft,
    phoneE164: input.user.phoneE164,
    email,
    snapshotVersion,
    now,
  });
  const snapshotId = `iss_${input.user.uid}_${now}_${snapshotVersion}`;
  const snapshot: IssuerIdentitySnapshotRecord = {
    uid: input.user.uid,
    snapshotId,
    identity,
    defaultShowMobile: true,
    defaultShowEmail: true,
  };

  await input.persistSnapshot(snapshot);

  const patch: ProfilePatch = {
    displayName: input.draft.displayName.trim(),
    businessName:
      input.draft.accountKind === "business" ? input.draft.businessName.trim() : null,
    workType:
      input.draft.accountKind === "business" && input.draft.constitution.trim()
        ? input.draft.constitution.trim()
        : null,
    designation: null,
    profileLogo: input.draft.profileLogo,
    accountKind: input.draft.accountKind,
    pinCode: input.draft.confirmedLocation!.pinCode,
    pinLocality: input.draft.confirmedLocation!.locality,
    pinDistrict: input.draft.confirmedLocation!.district,
    pinState: input.draft.confirmedLocation!.state,
    gstin: input.draft.gstin.trim() || null,
    gstinVerificationState: input.draft.gstin.trim()
      ? input.draft.gstinVerificationState
      : "notProvided",
    issuerIdentitySnapshotId: snapshotId,
    onboardingProfileVersion: 2,
    profileCompletedAt: now,
  };

  try {
    const profile = await input.updateProfile(patch);
    await input.clearDraft(input.user.uid);
    return { profile, snapshot };
  } catch (e) {
    throw e instanceof AppError
      ? e
      : new AppError("save_failed", "Could not complete profile. Your draft was kept.", e);
  }
}

export async function completeOnboardingProfileWithDeps(
  input: CompleteOnboardingInput
): Promise<CompleteOnboardingResult> {
  const existing = inFlightByUid.get(input.user.uid);
  if (existing) return existing;

  const run = completeOnce(input).finally(() => {
    inFlightByUid.delete(input.user.uid);
  });
  inFlightByUid.set(input.user.uid, run);
  return run;
}

export function __resetCompleteOnboardingFlightForTests(): void {
  inFlightByUid.clear();
}
