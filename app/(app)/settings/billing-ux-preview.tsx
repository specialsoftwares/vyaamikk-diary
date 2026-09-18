import { Redirect, useRouter } from "expo-router";
import React from "react";

import { BillingUxPreviewLab } from "@/components/billing/BillingUxPreviewLab";
import { isBillingUxPreviewEnabled } from "@/components/billing/billingUxPreviewGate";

/** Dev-only billing presentation lab. Production / store binaries redirect away. */
export default function BillingUxPreviewRoute() {
  const router = useRouter();
  if (!isBillingUxPreviewEnabled()) {
    return <Redirect href="/(app)/(tabs)/settings" />;
  }
  return <BillingUxPreviewLab onLeave={() => router.back()} />;
}
