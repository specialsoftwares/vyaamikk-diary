/**
 * Complete server bind after native Auth phone was updated to B.
 * Also used by boot recovery when Auth=B and profile still A.
 */

import { AppError } from "@/domain/errors";
import type { PhoneE164, UserProfile } from "@/domain/types";
import { normalizePhoneE164 } from "@/utils/mobileHash";
import { createLogger } from "@/utils/logger";

import {
  callConfirmVerifiedMobileContactChange,
  callPreflightVerifiedMobileContactChange,
} from "./identityCallable";
import {
  clearPendingMobileContactChange,
  loadPendingMobileContactChange,
  savePendingMobileContactChange,
  shouldRetryServerMobileBind,
} from "./pendingMobileContactChange";
import { getNativeAuthPhoneE164, getNativeAuthUid } from "./nativePhoneAuth";
import { requireJsAuthSessionForFirestore } from "./jsAuthBridge";

const log = createLogger("auth/reconcilePendingMobile");

export async function preflightProductionMobileChange(
  newerPhoneE164: PhoneE164
): Promise<{ operationId: string }> {
  const result = await callPreflightVerifiedMobileContactChange(newerPhoneE164);
  return { operationId: result.operationId };
}

export async function completeServerMobileBindAfterAuthUpdate(args: {
  uid: string;
  oldPhoneE164: PhoneE164;
  newerPhoneE164: PhoneE164;
  operationId: string;
}): Promise<UserProfile> {
  const newer = normalizePhoneE164(args.newerPhoneE164);
  const authPhone = getNativeAuthPhoneE164();
  const authUid = getNativeAuthUid();
  if (!authUid || authUid !== args.uid) {
    throw new AppError(
      "auth_failed",
      "Your signed-in session no longer matches this account. Sign in again."
    );
  }
  if (!authPhone || authPhone !== newer) {
    throw new AppError(
      "auth_failed",
      "Verified Auth phone must match the new number before server bind."
    );
  }

  await savePendingMobileContactChange({
    uid: args.uid,
    oldPhoneE164: normalizePhoneE164(args.oldPhoneE164),
    newPhoneE164: newer,
    operationId: args.operationId,
    authUpdatedAt: Date.now(),
    purpose: "contact_change",
  });

  await requireJsAuthSessionForFirestore("mobile_contact_change_bind");
  const profile = await callConfirmVerifiedMobileContactChange({
    newerPhoneE164: newer,
    operationId: args.operationId,
  });
  if (profile.uid !== args.uid) {
    throw new AppError(
      "auth_failed",
      "Server bind returned a different account. No local identity was switched."
    );
  }
  await clearPendingMobileContactChange();
  return profile;
}

/**
 * Boot / post-sign-in recovery: finish bind if Auth already moved to B.
 * Returns updated profile when bind completed; null when no work needed.
 */
export async function reconcilePendingMobileContactChange(
  profile: UserProfile
): Promise<UserProfile | null> {
  const authPhone = getNativeAuthPhoneE164();
  const authUid = getNativeAuthUid();
  if (!authUid || authUid !== profile.uid) return null;

  const pending = await loadPendingMobileContactChange();
  const decision = shouldRetryServerMobileBind({
    uid: profile.uid,
    authPhoneE164: authPhone,
    profilePhoneE164: profile.phoneE164,
    pending,
  });

  if (!decision.retry) {
    if (pending && pending.uid === profile.uid) {
      const authNorm = authPhone ? normalizePhoneE164(authPhone) : null;
      const profileNorm = normalizePhoneE164(profile.phoneE164);
      if (authNorm && authNorm === profileNorm) {
        await clearPendingMobileContactChange();
      }
    }
    return null;
  }

  log.info("reconciling pending mobile contact change", {
    uidSuffix: profile.uid.slice(-6),
    operationId: decision.operationId,
  });

  try {
    // Force-refresh native token before bind retry.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const authMod = require("@react-native-firebase/auth") as {
        default: () => { currentUser: { getIdToken: (f?: boolean) => Promise<string> } | null };
      };
      await authMod.default().currentUser?.getIdToken(true);
    } catch {
      // best-effort
    }

    await requireJsAuthSessionForFirestore("mobile_contact_change_reconcile");
    const next = await callConfirmVerifiedMobileContactChange({
      newerPhoneE164: decision.newerPhoneE164,
      operationId: decision.operationId,
    });
    await clearPendingMobileContactChange();
    return next;
  } catch (e) {
    log.warn("pending mobile reconcile failed; leaving recoverable pending state", {
      uidSuffix: profile.uid.slice(-6),
      code: e instanceof AppError ? e.code : "unknown",
    });
    // Keep pending so a later retry can finish. Do not clear.
    throw e;
  }
}

/** Explicit UI retry after Auth update succeeded but server bind failed. */
export async function retryServerMobileBindForCurrentSession(
  profile: UserProfile
): Promise<UserProfile> {
  const next = await reconcilePendingMobileContactChange(profile);
  if (next) return next;
  // Already consistent
  const authPhone = getNativeAuthPhoneE164();
  if (authPhone && normalizePhoneE164(authPhone) === normalizePhoneE164(profile.phoneE164)) {
    await clearPendingMobileContactChange();
    return profile;
  }
  throw new AppError(
    "unknown",
    "Mobile update is still finishing. Keep the app open and tap Retry.",
    undefined,
    { mobileChangeRecoveryRequired: true, authPhase: "post_auth" }
  );
}
