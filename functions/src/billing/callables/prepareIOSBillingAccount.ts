/**
 * prepareIOSBillingAccount — bind the signed-in Firebase uid to a
 * server-generated opaque App Store appAccountToken (VYD-33).
 *
 * Production export is fail-closed while APPSTORE_BILLING_ENABLED is not true.
 */

import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

import { ensureIosBillingAccount } from "../apple/appleOwnership";
import { isAppStoreBillingEnabled, assertAppStoreLiveBillingAllowed } from "../apple/appleConstants";
import { BillingError } from "../errors";
import { throwHttpsFromBilling } from "../google/billingHttps";
import { FirestoreBillingStore } from "../firestoreBillingStore";
import type { BillingStore } from "../store";

export async function handlePrepareIOSBillingAccount(
  store: BillingStore,
  uid: string,
  nowMs: number
): Promise<{ appAccountToken: string }> {
  if (!uid) {
    throw new BillingError({ clientCode: "not_entitled", causeCode: "unauthenticated" });
  }
  return ensureIosBillingAccount(store, uid, nowMs);
}

export const prepareIOSBillingAccount = onCall(
  { region: "asia-south1" },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }
    if (!isAppStoreBillingEnabled()) {
      throw new HttpsError(
        "failed-precondition",
        "App Store billing is not production-enabled."
      );
    }
    try {
      assertAppStoreLiveBillingAllowed();
      const store = new FirestoreBillingStore(getFirestore());
      return await handlePrepareIOSBillingAccount(store, request.auth.uid, Date.now());
    } catch (err) {
      throwHttpsFromBilling(err);
    }
  }
);
