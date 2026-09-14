/**
 * Map verified App Store Status + AutoRenewStatus onto Phase B kinds.
 *
 * ASSN notificationType is never an input here. Unknown future statuses
 * fail closed.
 */

import { AutoRenewStatus, Status } from "@apple/app-store-server-library";

import { BillingError } from "../errors";
import type { CanonicalTransitionKind } from "../transition";

export type IosLifecycleKind = Extract<
  CanonicalTransitionKind,
  "activatePaid" | "enterGrace" | "enterOnHold" | "cancel" | "expire"
>;

export function mapAppleSubscriptionStatus(opts: {
  status: unknown;
  autoRenewStatus: unknown;
}): { kind: IosLifecycleKind; statusLabel: string; autoRenewing: boolean } {
  const status = opts.status;
  if (status === Status.ACTIVE) {
    if (opts.autoRenewStatus === AutoRenewStatus.ON) {
      return { kind: "activatePaid", statusLabel: "ACTIVE", autoRenewing: true };
    }
    if (opts.autoRenewStatus === AutoRenewStatus.OFF) {
      return { kind: "cancel", statusLabel: "ACTIVE_AUTO_RENEW_OFF", autoRenewing: false };
    }
    throw new BillingError({
      clientCode: "verification_failed",
      causeCode: "unknown_ios_auto_renew_status",
    });
  }
  if (status === Status.BILLING_GRACE_PERIOD) {
    return { kind: "enterGrace", statusLabel: "BILLING_GRACE_PERIOD", autoRenewing: false };
  }
  if (status === Status.BILLING_RETRY) {
    return { kind: "enterOnHold", statusLabel: "BILLING_RETRY", autoRenewing: false };
  }
  if (status === Status.EXPIRED) {
    return { kind: "expire", statusLabel: "EXPIRED", autoRenewing: false };
  }
  if (status === Status.REVOKED) {
    return { kind: "expire", statusLabel: "REVOKED", autoRenewing: false };
  }
  throw new BillingError({
    clientCode: "verification_failed",
    causeCode: "unknown_ios_subscription_status",
  });
}
