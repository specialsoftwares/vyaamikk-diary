import React, { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

import {
  BusinessIdentityScreen,
  type BusinessIdentitySection,
} from "@/auth-v2/screens/BusinessIdentityScreen";
import {
  isReviewingPreviousStep,
  loadOnboardingNavigationState,
} from "@/auth/onboardingNavigationStore";
import { markBootWizardStep } from "@/auth/onboardingGuardPolicy";
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
      // Remediation: profileCompletedAt set but v2 fields missing — stay here.
      const { resolveProfileRemediation } = await import("@/onboarding/profileRemediation");
      const remediation = resolveProfileRemediation(user);
      if (
        user.profileCompletedAt &&
        remediation !== "fullyCompliant" &&
        remediation !== "emailRemediationRequired"
      ) {
        await markBootWizardStep("businessIdentity", user.uid);
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

  return <BusinessIdentityScreen initialSection={initialSection} />;
}
