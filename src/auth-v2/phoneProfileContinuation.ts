/**
 * Production phone-profile continuation and the authenticated account retry.
 * Deferred consent is started and not awaited. Email navigation runs from the
 * acknowledgement callback while that work is still pending.
 * The retry joins the bridge before it continues; it does not send another SMS.
 */

import type { UserProfile } from "@/domain/types";
import { AppError } from "@/domain/errors";
import { routeAccountSetupFailure } from "@/services/auth/reactivationRouting";
import {
  profileWriteStillOwned,
  type ProfileWriteLive,
} from "@/services/auth/profileWriteOwnership";
import { phoneAuthCopy } from "@/auth-v2/phoneAuthCopy";
import {
  PHONE_ACCOUNT_BOUND_MS,
  PHONE_SESSION_BOUND_MS,
  type PhoneAuthOperations,
} from "@/auth-v2/phoneAuthOperation";

export type PhoneProfileOwnership = {
  uid: string;
  generation: number;
  /** Session epoch captured when this retry was accepted. */
  epoch?: number;
};

export type PhoneProfileLive = ProfileWriteLive & { epoch?: number };

export function phoneProfileOwnershipHeld(
  ownership: PhoneProfileOwnership,
  live: ProfileWriteLive,
  profileUid: string
): boolean {
  return profileWriteStillOwned(ownership, live) && profileUid === ownership.uid;
}

export type PhoneProfileRoute = "app" | "business" | "email";

export async function continueAfterPhoneProfileTransition(input: {
  route: PhoneProfileRoute;
  startDeferredConsent: () => Promise<unknown>;
  onDeferredConsentRejected: (error: unknown) => void;
  markPhoneProven: () => void;
  markEmailComplete: () => Promise<void>;
  markEmailPending: () => Promise<void>;
  prepareEmailScreen: () => void;
  scheduleAfterAcknowledgement: (navigate: () => void) => void;
  navigateToApp: () => void;
  navigateToBusiness: () => void;
  navigateToEmail: () => void;
}): Promise<void> {
  void input.startDeferredConsent().catch(input.onDeferredConsentRejected);
  input.markPhoneProven();
  if (input.route === "app") {
    await input.markEmailComplete();
    input.scheduleAfterAcknowledgement(() => {
      input.navigateToApp();
    });
    return;
  }
  if (input.route === "business") {
    await input.markEmailComplete();
    input.scheduleAfterAcknowledgement(() => {
      input.navigateToBusiness();
    });
    return;
  }
  await input.markEmailPending();
  input.prepareEmailScreen();
  input.scheduleAfterAcknowledgement(() => {
    input.navigateToEmail();
  });
}

export type AuthenticatedRetryResult = "skipped" | "needs_otp" | "continued" | "failed" | "reactivation";

function retryStillOwned(ownership: PhoneProfileOwnership, live: PhoneProfileLive, profileUid: string): boolean {
  if (!phoneProfileOwnershipHeld(ownership, live, profileUid)) return false;
  if (ownership.epoch == null) return true;
  return live.epoch === ownership.epoch;
}

export async function retryAuthenticatedAccountSetup(input: {
  ops: PhoneAuthOperations;
  phoneE164: string | null;
  inFlight: boolean;
  readLive: () => PhoneProfileLive;
  /** Called once, at accept, before any await that could observe a replacement epoch. */
  captureEpoch?: () => number;
  begin: () => void;
  end: () => void;
  resolveAccount: (phoneE164: string, ownership: PhoneProfileOwnership) => Promise<{ profile: UserProfile }>;
  requireBridge: (ownership: PhoneProfileOwnership) => Promise<unknown>;
  applyServerProfile: (profile: UserProfile, ownership: PhoneProfileOwnership) => Promise<unknown>;
  continueAfterProfile: (profile: UserProfile, ownership: PhoneProfileOwnership) => Promise<unknown>;
  onInactiveSession: () => void;
  onFailure: (error: unknown) => void;
}): Promise<AuthenticatedRetryResult> {
  if (!input.phoneE164) return "skipped";
  if (input.inFlight) return "skipped";
  const opening = input.readLive();
  if (!opening.uid) {
    input.onInactiveSession();
    return "needs_otp";
  }
  const accepted = input.ops.accept("account", PHONE_ACCOUNT_BOUND_MS);
  if (!accepted.accepted) return "skipped";
  const ownership: PhoneProfileOwnership = {
    uid: opening.uid,
    generation: opening.generation,
    epoch: input.captureEpoch ? input.captureEpoch() : opening.epoch,
  };
  input.begin();
  const owned = (profileUid: string) => retryStillOwned(ownership, input.readLive(), profileUid);
  const unknownResult = (): AuthenticatedRetryResult => {
    input.onFailure(
      new AppError("otp_send_failed", phoneAuthCopy("en").resultUnknown, undefined, {
        phoneAuthSettlement: "unknown",
      })
    );
    return "failed";
  };
  try {
    const resolved = await input.ops.bounded(
      accepted.id,
      input.resolveAccount(input.phoneE164, ownership),
      input.ops.stageBudget(accepted.id, PHONE_ACCOUNT_BOUND_MS)
    );
    if (!input.ops.sameAttempt(accepted.id) || resolved.status === "cancelled") return "failed";
    if (resolved.status === "unknown") return unknownResult();
    if (!owned(resolved.value.profile.uid)) throw new Error("session_changed");
    const bridged = await input.ops.bounded(
      accepted.id,
      input.requireBridge(ownership),
      input.ops.stageBudget(accepted.id, PHONE_ACCOUNT_BOUND_MS)
    );
    if (!input.ops.sameAttempt(accepted.id) || bridged.status === "cancelled") return "failed";
    if (bridged.status === "unknown") return unknownResult();
    if (!owned(resolved.value.profile.uid)) throw new Error("session_changed");
    const applied = await input.ops.bounded(
      accepted.id,
      input.applyServerProfile(resolved.value.profile, ownership),
      input.ops.stageBudget(accepted.id, PHONE_SESSION_BOUND_MS)
    );
    if (!input.ops.sameAttempt(accepted.id) || applied.status === "cancelled") return "failed";
    if (applied.status !== "ok") return unknownResult();
    if (!owned(resolved.value.profile.uid)) throw new Error("session_changed");
    const continued = await input.ops.bounded(
      accepted.id,
      input.continueAfterProfile(resolved.value.profile, ownership),
      input.ops.stageBudget(accepted.id, PHONE_SESSION_BOUND_MS)
    );
    if (!input.ops.sameAttempt(accepted.id) || continued.status === "cancelled") return "failed";
    if (continued.status !== "ok") return unknownResult();
    if (!owned(resolved.value.profile.uid)) throw new Error("session_changed");
    return "continued";
  } catch (error) {
    if (!input.ops.sameAttempt(accepted.id)) return "failed";
    const pending = routeAccountSetupFailure({
      error,
      stillCurrent: true,
      fallbackPhoneE164: input.phoneE164,
    });
    input.onFailure(error);
    return pending.kind === "reactivation" ? "reactivation" : "failed";
  } finally {
    if (input.ops.sameAttempt(accepted.id)) {
      input.ops.settle(accepted.id, "off");
      input.end();
    }
  }
}
