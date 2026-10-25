/**
 * Production phone-profile continuation and the authenticated account retry.
 * Deferred consent is started and not awaited. Email navigation runs from the
 * acknowledgement callback while that work is still pending.
 * The retry joins the bridge before it continues; it does not send another SMS.
 */

import type { UserProfile } from "@/domain/types";
import {
  profileWriteStillOwned,
  type ProfileWriteLive,
} from "@/services/auth/profileWriteOwnership";

export type PhoneProfileOwnership = {
  uid: string;
  generation: number;
};

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

export type AuthenticatedRetryResult = "skipped" | "needs_otp" | "continued" | "failed";

export async function retryAuthenticatedAccountSetup(input: {
  phoneE164: string | null;
  inFlight: boolean;
  readLive: () => ProfileWriteLive;
  begin: () => void;
  end: () => void;
  resolveAccount: (phoneE164: string) => Promise<{ profile: UserProfile }>;
  requireBridge: () => Promise<unknown>;
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
  const ownership: PhoneProfileOwnership = {
    uid: opening.uid,
    generation: opening.generation,
  };
  input.begin();
  try {
    const result = await input.resolveAccount(input.phoneE164);
    if (!phoneProfileOwnershipHeld(ownership, input.readLive(), result.profile.uid)) {
      throw new Error("session_changed");
    }
    await input.requireBridge();
    if (!phoneProfileOwnershipHeld(ownership, input.readLive(), result.profile.uid)) {
      throw new Error("session_changed");
    }
    await input.applyServerProfile(result.profile, ownership);
    await input.continueAfterProfile(result.profile, ownership);
    return "continued";
  } catch (error) {
    input.onFailure(error);
    return "failed";
  } finally {
    input.end();
  }
}
