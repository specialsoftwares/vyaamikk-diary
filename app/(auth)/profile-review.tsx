import React, { useEffect, useRef } from "react";
import { useRouter } from "expo-router";

import { ProfileReviewScreen } from "@/auth-v2/screens/ProfileReviewScreen";
import {
  markBootWizardStep,
  shouldSuppressForwardOnboardingGuardSync,
} from "@/auth/onboardingGuardPolicy";
import { useAuth } from "@/state/auth";

/**
 * Profile review — confirm document-facing identity before Confirm & continue.
 * Does not steal navigation when profileCompletedAt flips during the in-screen
 * workspace-ready success sequence (that screen owns exactly-once replace → You).
 */
export default function ProfileReviewRoute() {
  const router = useRouter();
  const { user } = useAuth();
  const wasCompleteOnMountRef = useRef(Boolean(user?.profileCompletedAt));

  useEffect(() => {
    if (!user) {
      router.replace("/");
      return;
    }
    if (shouldSuppressForwardOnboardingGuardSync("profileReview")) {
      return;
    }
    // Cold/wrong-stack resume only — leave in-flight Confirm success alone.
    if (wasCompleteOnMountRef.current && user.profileCompletedAt) {
      router.replace("/(app)/(tabs)/you");
      return;
    }
    markBootWizardStep("profileReview", user.uid);
  }, [user, router]);

  if (!user) return null;

  return <ProfileReviewScreen />;
}
