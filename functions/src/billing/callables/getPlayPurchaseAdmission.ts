/**
 * getPlayPurchaseAdmission — whether this signed-in user may open a Play
 * purchase sheet. Returns only { purchaseAllowed }. Does not return tester
 * UIDs, emails, or any other account. Does not enable billing and does not grant
 * a plan. prepareAndroidBillingAccount and validateAndActivateAndroid remain
 * the enforcement on an actual purchase.
 */

import { HttpsError, onCall } from "firebase-functions/v2/https";

import { throwHttpsFromBilling } from "../google/billingHttps";
import { playPurchaseAllowedForAuthUid } from "../google/playConstants";

export function handleGetPlayPurchaseAdmission(
  uid: string | undefined
): { purchaseAllowed: boolean } {
  return { purchaseAllowed: playPurchaseAllowedForAuthUid(uid) };
}

export const getPlayPurchaseAdmission = onCall(
  { region: "asia-south1" },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }
    try {
      return handleGetPlayPurchaseAdmission(request.auth.uid);
    } catch (err) {
      throwHttpsFromBilling(err);
    }
  }
);
