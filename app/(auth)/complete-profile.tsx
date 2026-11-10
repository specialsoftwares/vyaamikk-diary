import React, { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

import {
  BusinessIdentityScreen,
  type BusinessIdentitySection,
} from "@/auth-v2/screens/BusinessIdentityScreen";
import { ReviewSectionEditorScreen } from "@/auth-v2/screens/ReviewSectionEditorScreen";
import {
  isReviewEditIntent,
  parseReviewEditTarget,
} from "@/auth-v2/reviewEditIntent";
import {
  markBootWizardStep,
  shouldSuppressForwardOnboardingGuardSync,
} from "@/auth/onboardingGuardPolicy";
import {
  getWizardSnapshot,
  isReviewIntentActive,
} from "@/auth/wizardNavigationController";
import { useAuth } from "@/state/auth";

const SECTIONS = new Set<string>([
  "identity",
  "media",
  "contacts",
  "location",
  "gstin",
  "constitution",
]);

function parseSection(raw: string | string[] | undefined): BusinessIdentitySection | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !SECTIONS.has(value)) return null;
  return value as BusinessIdentitySection;
}

/** Business identity onboarding — Indigo Auth v2 shell only. */
export default function CompleteProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    section?: string | string[];
    intent?: string | string[];
  }>();
  const initialSection = parseSection(params.section);
  const reviewEditTarget = isReviewEditIntent(params.intent)
    ? parseReviewEditTarget(params.section)
    : null;

  useEffect(() => {
    if (!user) {
      router.replace("/");
      return;
    }

    // Targeted Review edit owns its own Back/Save → Review contract.
    if (reviewEditTarget) return;

    // Sync-first: never forward while user is reviewing this or an earlier step.
    if (shouldSuppressForwardOnboardingGuardSync("businessIdentity")) {
      return;
    }
    if (
      isReviewIntentActive() &&
      getWizardSnapshot().currentLogicalStep === "businessIdentity"
    ) {
      return;
    }

    let cancelled = false;
    (async () => {
      const { resolveProfileRemediation } = await import("@/onboarding/profileRemediation");
      if (cancelled) return;
      if (shouldSuppressForwardOnboardingGuardSync("businessIdentity")) return;

      const remediation = resolveProfileRemediation(user);
      if (
        user.profileCompletedAt &&
        remediation !== "fullyCompliant" &&
        remediation !== "emailRemediationRequired"
      ) {
        markBootWizardStep("businessIdentity", user.uid);
        return;
      }
      if (user.profileCompletedAt) {
        if (shouldSuppressForwardOnboardingGuardSync("businessIdentity")) return;
        if (!cancelled) router.replace("/(app)/(tabs)/you");
        return;
      }
      markBootWizardStep("businessIdentity", user.uid);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router, reviewEditTarget]);

  if (!user) return null;

  if (reviewEditTarget) {
    return <ReviewSectionEditorScreen target={reviewEditTarget} />;
  }

  return <BusinessIdentityScreen initialSection={initialSection} />;
}
