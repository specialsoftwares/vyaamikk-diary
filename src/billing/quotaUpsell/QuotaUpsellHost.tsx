/**
 * Shared UpgradeSheet host for ordinary-family quota_exhausted.
 *
 * Uses the existing IapProvider / SubscriptionProvider. Does not start a
 * second purchase listener, write entitlements, or auto-retry the save.
 * Presentation visibility is owned by the session-bound host runtime.
 */

import React from "react";

import { useIap } from "@/billing/iap";
import { UpgradeSheet } from "@/components/billing/UpgradeSheet";
import { BenefitEducationScreen } from "@/components/billing/BenefitEducationScreen";
import { useT } from "@/i18n";
import { useAuth } from "@/state/auth";
import { useSubscription } from "@/subscription";

import { QuotaUpsellHostView } from "./QuotaUpsellHostView";

export function QuotaUpsellHost({ children }: { children: React.ReactNode }) {
  const t = useT();
  const { status: authStatus, user } = useAuth();
  const iap = useIap();
  const subscription = useSubscription();

  return (
    <QuotaUpsellHostView
      t={t}
      authStatus={authStatus}
      uid={user?.uid ?? null}
      iap={iap}
      subscription={subscription}
      renderSheet={(props) => <UpgradeSheet {...props} />}
      renderEducation={(props) =>
        props.open ? (
          <BenefitEducationScreen
            reducedMotion={false}
            onContinue={props.onContinue}
            onClose={props.onClose}
          />
        ) : null
      }
    >
      {children}
    </QuotaUpsellHostView>
  );
}
