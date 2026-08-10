import React from "react";
import { Redirect } from "expo-router";

import { OnboardingUxPreviewLab } from "@/auth-v2/preview/OnboardingUxPreviewLab";
import { isOnboardingUxPreviewEnabled } from "@/auth-v2/preview/onboardingPreviewGate";

/** Dev-only presentation lab. Production / store binaries redirect away. */
export default function OnboardingUxPreviewRoute() {
  if (!isOnboardingUxPreviewEnabled()) {
    return <Redirect href="/(auth)/v2" />;
  }
  return <OnboardingUxPreviewLab />;
}
