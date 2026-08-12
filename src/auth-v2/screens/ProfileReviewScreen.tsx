import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";

import {
  ProfileReviewPresentation,
  type ProfileReviewEditSection,
} from "@/auth-v2/screens/ProfileReviewPresentation";
import { hasAuthoritativeVerifiedEmail } from "@/auth/identityRouteState";
import {
  clearWizardNavigationSession,
  markReviewingWizardStep,
} from "@/auth/onboardingGuardPolicy";
import { completeOnboardingProfile } from "@/onboarding/completeOnboardingProfile";
import { loadOnboardingProfileDraftV2 } from "@/onboarding/onboardingProfileDraftV2";
import type { OnboardingProfileDraftV2 } from "@/onboarding/profileIdentityModel";
import { useAuth } from "@/state/auth";

/**
 * Production Profile Review — authoritative persistence via completeOnboardingProfile.
 *
 * Review composite state contract:
 * - Ordinary profile draft fields (name, logo, PIN, GSTIN, constitution) → onboarding draft
 * - Verified mobile/email → live Auth/session user (applyServerProfile), never a frozen mount snapshot
 * - Contact verification success patches central user before return; pending OTP never enters Review
 */
export function ProfileReviewScreen() {
  const router = useRouter();
  const { user, updateProfile } = useAuth();
  const [draft, setDraft] = useState<OnboardingProfileDraftV2 | null>(null);
  const [ready, setReady] = useState(false);

  const loadDraft = useCallback(async () => {
    if (!user) return;
    const fromUser =
      user.accountKind === "individual" || user.accountKind === "business"
        ? user.accountKind
        : null;
    if (fromUser) {
      setDraft(await loadOnboardingProfileDraftV2(user.uid, fromUser));
      setReady(true);
      return;
    }
    const business = await loadOnboardingProfileDraftV2(user.uid, "business");
    const individual = await loadOnboardingProfileDraftV2(user.uid, "individual");
    const preferBusiness =
      business.displayName.trim() ||
      business.businessName.trim() ||
      business.updatedAt >= individual.updatedAt;
    setDraft(preferBusiness ? business : individual);
    setReady(true);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        router.replace("/");
        return;
      }
      await loadDraft();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router, loadDraft]);

  if (!user || !ready || !draft) {
    return null;
  }

  const goEdit = (section: ProfileReviewEditSection) => {
    markReviewingWizardStep("businessIdentity", user.uid, {
      phoneE164: user.phoneE164,
      verifiedEmail: user.normalizedEmail ?? user.businessEmail,
    });
    router.push({
      pathname: "/(auth)/complete-profile",
      params: { section, intent: "review" },
    });
  };

  const goBack = () => {
    markReviewingWizardStep("businessIdentity", user.uid, {
      phoneE164: user.phoneE164,
      verifiedEmail: user.normalizedEmail ?? user.businessEmail,
    });
    router.replace({
      pathname: "/(auth)/complete-profile",
      params: { intent: "review" },
    });
  };

  return (
    <ProfileReviewPresentation
      model={{
        accountKind: draft.accountKind === "individual" ? "individual" : "business",
        displayName: draft.displayName,
        businessName: draft.businessName,
        constitution: draft.constitution,
        gstin: draft.gstin,
        gstinVerificationState: draft.gstinVerificationState,
        pinCode: draft.pinCode,
        confirmedLocation: draft.confirmedLocation,
        logoPreviewUri: draft.logoPreviewUri ?? draft.profileLogo?.localUri ?? null,
        logoPersisted: draft.logoPersisted,
        phoneE164: user.phoneE164,
        email: user.normalizedEmail ?? user.businessEmail ?? "",
        emailVerified: hasAuthoritativeVerifiedEmail(user),
      }}
      onConfirmPersist={async () => {
        await completeOnboardingProfile({
          user,
          draft,
          updateProfile,
        });
      }}
      onSuccessNavigate={() => {
        clearWizardNavigationSession();
        router.replace("/(app)/(tabs)/you");
      }}
      onBack={goBack}
      onEdit={goEdit}
    />
  );
}
