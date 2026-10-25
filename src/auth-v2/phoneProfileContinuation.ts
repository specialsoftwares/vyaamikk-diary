/**
 * Production phone-profile continuation and the authenticated account retry.
 * Deferred consent is started and not awaited. Email navigation runs from the
 * acknowledgement callback while that work is still pending.
 * The retry joins the bridge before it continues; it does not send another SMS.
 */

import type { UserProfile } from "@/domain/types";

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
  nativeUid: string | null;
  begin: () => void;
  end: () => void;
  resolveAccount: (phoneE164: string) => Promise<{ profile: UserProfile }>;
  requireBridge: () => Promise<unknown>;
  applyServerProfile: (profile: UserProfile) => Promise<unknown>;
  continueAfterProfile: (profile: UserProfile) => Promise<unknown>;
  onInactiveSession: () => void;
  onFailure: (error: unknown) => void;
}): Promise<AuthenticatedRetryResult> {
  if (!input.phoneE164) return "skipped";
  if (input.inFlight) return "skipped";
  if (!input.nativeUid) {
    input.onInactiveSession();
    return "needs_otp";
  }
  input.begin();
  try {
    const result = await input.resolveAccount(input.phoneE164);
    await input.requireBridge();
    await input.applyServerProfile(result.profile);
    await input.continueAfterProfile(result.profile);
    return "continued";
  } catch (error) {
    input.onFailure(error);
    return "failed";
  } finally {
    input.end();
  }
}
