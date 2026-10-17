/**
 * prepareAndroidBillingAccount — bind the signed-in Firebase uid to a
 * non-PII Google Play obfuscatedAccountId (VYD-32, consumed later by VYD-35).
 *
 * Production export is fail-closed while PLAY_BILLING_ENABLED is not true.
 * After enablement, PLAY_BILLING_TESTER_UIDS is a fail-closed UID allowlist
 * (empty/absent denies all). This callable does not enable billing.
 */

import { HttpsError, onCall } from "firebase-functions/v2/https";

import { BillingError } from "../errors";
import { throwHttpsFromBilling } from "../google/billingHttps";
import {
  assertPlayBillingTesterAllowed,
  isPlayBillingEnabled,
} from "../google/playConstants";
import { ensurePlayAccountIndex } from "../google/playOwnership";
import type { BillingStore } from "../store";
import { FirestoreBillingStore } from "../firestoreBillingStore";
import { getFirestore } from "firebase-admin/firestore";

export async function handlePrepareAndroidBillingAccount(
  store: BillingStore,
  uid: string,
  nowMs: number
): Promise<{ obfuscatedAccountId: string }> {
  if (!uid) {
    throw new BillingError({ clientCode: "not_entitled", causeCode: "unauthenticated" });
  }
  return ensurePlayAccountIndex(store, uid, nowMs);
}

export const prepareAndroidBillingAccount = onCall(
  { region: "asia-south1" },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }
    if (!isPlayBillingEnabled()) {
      throw new HttpsError(
        "failed-precondition",
        "Play billing is not production-enabled."
      );
    }
    try {
      assertPlayBillingTesterAllowed(request.auth.uid);
      const store = new FirestoreBillingStore(getFirestore());
      return await handlePrepareAndroidBillingAccount(store, request.auth.uid, Date.now());
    } catch (err) {
      throwHttpsFromBilling(err);
    }
  }
);
