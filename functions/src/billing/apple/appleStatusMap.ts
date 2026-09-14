/**
 * Map verified App Store Status + AutoRenewStatus onto Phase B kinds.
 *
 * ASSN notificationType is never an input here. Unknown future statuses
 * fail closed. `autoRenewing` is metadata and must reflect Apple's verified
 * AutoRenewStatus — it is not invented from lifecycle kind.
 */

import { AutoRenewStatus, Status } from "@apple/app-store-server-library";

import { BillingError } from "../errors";
import type { CanonicalTransitionKind } from "../transition";

export type IosLifecycleKind = Extract<
  CanonicalTransitionKind,
  "activatePaid" | "enterGrace" | "enterOnHold" | "cancel" | "expire"
>;

function verifiedAutoRenewing(autoRenewStatus: unknown, required: boolean): boolean {
  if (autoRenewStatus === AutoRenewStatus.ON) return true;
  if (autoRenewStatus === AutoRenewStatus.OFF) return false;
  if (!required && (autoRenewStatus == null)) return false;
  throw new BillingError({
    clientCode: "verification_failed",
    causeCode: "unknown_ios_auto_renew_status",
  });
}

export function mapAppleSubscriptionStatus(opts: {
  status: unknown;
  autoRenewStatus: unknown;
}): { kind: IosLifecycleKind; statusLabel: string; autoRenewing: boolean } {
  const status = opts.status;
  if (status === Status.ACTIVE) {
    const autoRenewing = verifiedAutoRenewing(opts.autoRenewStatus, true);
    if (autoRenewing) {
      return { kind: "activatePaid", statusLabel: "ACTIVE", autoRenewing: true };
    }
    return { kind: "cancel", statusLabel: "ACTIVE_AUTO_RENEW_OFF", autoRenewing: false };
  }
  if (status === Status.BILLING_GRACE_PERIOD) {
    return {
      kind: "enterGrace",
      statusLabel: "BILLING_GRACE_PERIOD",
      autoRenewing: verifiedAutoRenewing(opts.autoRenewStatus, true),
    };
  }
  if (status === Status.BILLING_RETRY) {
    return {
      kind: "enterOnHold",
      statusLabel: "BILLING_RETRY",
      autoRenewing: verifiedAutoRenewing(opts.autoRenewStatus, true),
    };
  }
  if (status === Status.EXPIRED) {
    return {
      kind: "expire",
      statusLabel: "EXPIRED",
      autoRenewing: verifiedAutoRenewing(opts.autoRenewStatus, false),
    };
  }
  if (status === Status.REVOKED) {
    return {
      kind: "expire",
      statusLabel: "REVOKED",
      autoRenewing: verifiedAutoRenewing(opts.autoRenewStatus, false),
    };
  }
  throw new BillingError({
    clientCode: "verification_failed",
    causeCode: "unknown_ios_subscription_status",
  });
}
