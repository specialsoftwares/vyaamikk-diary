/**
 * Known out-of-scope App Store Server Notification V2 shapes (VYD-33).
 *
 * After SignedDataVerifier succeeds, these documented 3.1.0 types do not
 * carry Vyaamikk subscription-billing `data.signedTransactionInfo`:
 * `RENEWAL_EXTENSION` + `Subtype.SUMMARY`, `EXTERNAL_PURCHASE_TOKEN`,
 * and `RESCIND_CONSENT` (`appData`). Acknowledge HTTP 200 without
 * mutation. Unknown future shapes remain fail-closed.
 */

import {
  NotificationTypeV2,
  Subtype,
  type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";

export function ignoredIosAssnAction(
  notification: ResponseBodyV2DecodedPayload
): string | null {
  if (
    notification.notificationType === NotificationTypeV2.RENEWAL_EXTENSION &&
    notification.subtype === Subtype.SUMMARY
  ) {
    return "renewal_extension_summary_ignored";
  }
  if (notification.notificationType === NotificationTypeV2.EXTERNAL_PURCHASE_TOKEN) {
    return "external_purchase_token_ignored";
  }
  if (notification.notificationType === NotificationTypeV2.RESCIND_CONSENT) {
    return "non_billing_rescind_consent_ignored";
  }
  return null;
}
