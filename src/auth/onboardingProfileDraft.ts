/**
 * Authenticated onboarding profile draft — survives Back/forward within
 * the same phone identity. Cleared on phone-account switch / sign-out restart.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { OnboardingProfileDraftFields } from "@/auth/onboardingWizard";

const PREFIX = "vyd_onboarding_profile_draft_v1_";

function key(uid: string): string {
  return `${PREFIX}${uid}`;
}

export async function loadOnboardingProfileDraft(
  uid: string
): Promise<OnboardingProfileDraftFields | null> {
  try {
    const raw = await AsyncStorage.getItem(key(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingProfileDraftFields>;
    if (typeof parsed.displayName !== "string") return null;
    return {
      accountKind: parsed.accountKind === "individual" ? "individual" : "business",
      displayName: parsed.displayName,
      businessName: typeof parsed.businessName === "string" ? parsed.businessName : "",
      workType: typeof parsed.workType === "string" ? parsed.workType : "",
      designation: typeof parsed.designation === "string" ? parsed.designation : "",
    };
  } catch {
    return null;
  }
}

export async function saveOnboardingProfileDraft(
  uid: string,
  draft: OnboardingProfileDraftFields
): Promise<void> {
  await AsyncStorage.setItem(key(uid), JSON.stringify(draft));
}

export async function clearOnboardingProfileDraft(uid: string): Promise<void> {
  await AsyncStorage.removeItem(key(uid));
}
