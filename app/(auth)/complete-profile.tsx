import React, { useEffect } from "react";
import { useRouter } from "expo-router";

import { BusinessIdentityScreen } from "@/auth-v2/screens/BusinessIdentityScreen";
import { isReviewingPreviousStep, loadOnboardingNavigationState } from "@/auth/onboardingNavigationStore";
import { markBootWizardStep } from "@/auth/onboardingGuardPolicy";
import { useAuth } from "@/state/auth";

/** Business identity onboarding — Indigo Auth v2 shell only. */
export default function CompleteProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        if (!cancelled) router.replace("/");
        return;
      }
      const nav = await loadOnboardingNavigationState();
      // Reviewing this step after profileCompletedAt — stay put.
      if (isReviewingPreviousStep(nav) && nav?.currentStep === "businessIdentity") {
        return;
      }
      // Boot/continue after profile complete → advance via boot index (idempotent).
      if (user.profileCompletedAt && !user.ueidReleasedAt) {
        const target = "/(auth)/ueid";
        if (!cancelled) router.replace(target);
        return;
      }
      await markBootWizardStep("businessIdentity", user.uid);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  if (!user) return null;
  // Allow render while async review check runs; screen itself handles drafts.

  return <BusinessIdentityScreen />;
}
