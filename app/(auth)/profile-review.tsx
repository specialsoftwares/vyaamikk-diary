import React, { useEffect } from "react";
import { useRouter } from "expo-router";

import { ProfileReviewScreen } from "@/auth-v2/screens/ProfileReviewScreen";
import {
  isReviewingPreviousStep,
  loadOnboardingNavigationState,
} from "@/auth/onboardingNavigationStore";
import { markBootWizardStep } from "@/auth/onboardingGuardPolicy";
import { useAuth } from "@/state/auth";

/** Profile review — confirm document-facing identity before Complete Profile. */
export default function ProfileReviewRoute() {
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
      if (isReviewingPreviousStep(nav) && nav?.currentStep === "profileReview") {
        return;
      }
      if (user.profileCompletedAt && !user.ueidReleasedAt) {
        if (!cancelled) router.replace("/(auth)/ueid");
        return;
      }
      if (user.profileCompletedAt && user.ueidReleasedAt) {
        if (!cancelled) router.replace("/(auth)/ueid");
        return;
      }
      await markBootWizardStep("profileReview", user.uid);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  if (!user) return null;

  return <ProfileReviewScreen />;
}
