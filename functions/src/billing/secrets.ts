/**
 * Diagnostic HMAC secret for billing functions that call diagnosticUidHmac.
 *
 * `secrets: BILLING_DIAG_RUNTIME_SECRETS` is the binding. A Secret Manager
 * secret and an IAM grant do not inject the value until each consuming
 * function lists this parameter. The value must never be logged.
 *
 * After any owned purchase, leave this binding and KMS decrypt in place.
 * Stop new admission with PLAY_BILLING_ENABLED and the UID allowlist.
 * Removing this binding is pre-purchase cleanup only.
 */

import { defineSecret } from "firebase-functions/params";

export const billingDiagUidSecret = defineSecret("BILLING_DIAG_UID_SECRET");

export const BILLING_DIAG_RUNTIME_SECRETS = [billingDiagUidSecret];
