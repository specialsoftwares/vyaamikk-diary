/**
 * Persist the pre-auth consent grant after the email screen is already shown.
 * A failed write leaves the AsyncStorage copy in place for a later authenticated retry.
 */

import type { LegalConsentRecord, PendingLegalConsent } from "@/domain/legalConsent";
import type { UserProfile } from "@/domain/types";
import type { ProfilePatch } from "@/services/auth/types";
import { currentAuthMutationGeneration } from "@/services/auth/authSessionFence";
import { createLogger } from "@/utils/logger";

import { CONSENT_RECONCILE_SOURCE, consentPatchFromPending } from "./pendingConsentReconcile";

const log = createLogger("auth/flowGate");

export type DeferredConsentResult = "written" | "failed" | "skipped";

function sameAccount(pending: PendingLegalConsent, profile: UserProfile): boolean {
  if (pending.phoneE164 !== profile.phoneE164) return false;
  if (pending.record.userId && pending.record.userId !== profile.uid) return false;
  return true;
}

export async function persistDeferredPhoneConsent(input: {
  profile: UserProfile;
  generationAtStart: number;
  currentGeneration?: () => number;
  sessionUid?: () => string | null;
  updateProfile: (patch: ProfilePatch) => Promise<unknown>;
  loadPending?: () => Promise<PendingLegalConsent | null>;
  clearIfUnchanged?: (snapshot: PendingLegalConsent) => Promise<boolean>;
  rebuildRecord?: LegalConsentRecord;
}): Promise<DeferredConsentResult> {
  const generation = input.currentGeneration ?? currentAuthMutationGeneration;
  const loadPending =
    input.loadPending ??
    (async () => {
      const service = await import("./legalConsentService");
      return service.loadPendingConsent();
    });
  const clearIfUnchanged =
    input.clearIfUnchanged ??
    (async (snapshot: PendingLegalConsent) => {
      const service = await import("./legalConsentService");
      return service.clearPendingConsentIfUnchanged(snapshot);
    });
  try {
    if (generation() !== input.generationAtStart) return "skipped";
    const liveUid = input.sessionUid?.() ?? null;
    if (liveUid && liveUid !== input.profile.uid) return "skipped";

    const stored = await loadPending();
    if (generation() !== input.generationAtStart) return "skipped";
    const rebuild =
      input.rebuildRecord ??
      (await import("./legalConsentService")).buildConsentRecord({
        sourceScreen: CONSENT_RECONCILE_SOURCE,
        phoneE164: input.profile.phoneE164,
      });
    const patch = consentPatchFromPending(
      input.profile,
      stored,
      rebuild.consentVersion,
      rebuild
    );
    if (!patch) return "skipped";
    if (generation() !== input.generationAtStart) return "skipped";
    const liveAfterPatch = input.sessionUid?.() ?? null;
    if (liveAfterPatch && liveAfterPatch !== input.profile.uid) return "skipped";

    await input.updateProfile(patch);
    if (stored && sameAccount(stored, input.profile)) {
      await clearIfUnchanged(stored);
    }
    return "written";
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    log.warn("deferred consent persist failed", { name });
    return "failed";
  }
}
