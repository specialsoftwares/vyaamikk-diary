import React, { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

import {
  BusinessIdentityScreen,
  type BusinessIdentitySection,
} from "@/auth-v2/screens/BusinessIdentityScreen";
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
  const params = useLocalSearchParams<{ section?: string | string[]; intent?: string }>();
  const initialSection = parseSection(params.section);

  useEffect(() => {
    if (!user) {
      router.replace("/");
      return;
    }

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
      // Remediation: profileCompletedAt set but v2 fields missing — stay here.
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
      // Boot/continue after profile complete → advance (idempotent).
      if (user.profileCompletedAt && !user.ueidReleasedAt) {
        if (shouldSuppressForwardOnboardingGuardSync("businessIdentity")) return;
        if (!cancelled) router.replace("/(auth)/ueid");
        return;
      }
      markBootWizardStep("businessIdentity", user.uid);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  if (!user) return null;

  return <BusinessIdentityScreen initialSection={initialSection} />;
}
