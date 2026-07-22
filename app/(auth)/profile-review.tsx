import React, { useEffect } from "react";
import { useRouter } from "expo-router";

import { ProfileReviewScreen } from "@/auth-v2/screens/ProfileReviewScreen";
import {
  markBootWizardStep,
  shouldSuppressForwardOnboardingGuardSync,
} from "@/auth/onboardingGuardPolicy";
import { useAuth } from "@/state/auth";

/** Profile review — confirm document-facing identity before Complete Profile. */
export default function ProfileReviewRoute() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      router.replace("/");
      return;
    }
    if (shouldSuppressForwardOnboardingGuardSync("profileReview")) {
      return;
    }
    let cancelled = false;
    (async () => {
      if (shouldSuppressForwardOnboardingGuardSync("profileReview")) return;
      if (user.profileCompletedAt && !user.ueidReleasedAt) {
        if (!cancelled) router.replace("/(auth)/ueid");
        return;
      }
      if (user.profileCompletedAt && user.ueidReleasedAt) {
        if (!cancelled) router.replace("/(auth)/ueid");
        return;
      }
      markBootWizardStep("profileReview", user.uid);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  if (!user) return null;

  return <ProfileReviewScreen />;
}
