import { Redirect, useRouter } from "expo-router";
import React from "react";

import { BillingUxPreviewLab } from "@/components/billing/BillingUxPreviewLab";
import { isBillingUxPreviewEnabled } from "@/components/billing/billingUxPreviewGate";

/**
 * Dev-only public entry for presentation review (Expo web / Expo Go).
 * Store and production binaries keep the gate false and redirect away.
 * Does not activate purchase, restore, quota, or entitlement writes.
 */
export default function PublicBillingUxPreviewRoute() {
  const router = useRouter();
  if (!isBillingUxPreviewEnabled()) {
    return <Redirect href="/(public)/landing" />;
  }
  return (
    <BillingUxPreviewLab
      onLeave={() => {
        router.replace("/(public)/landing");
      }}
    />
  );
}
