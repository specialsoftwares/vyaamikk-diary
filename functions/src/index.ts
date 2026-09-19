/**
 * Vyaamikk Diary — Cloud Functions (identity, email, deletion, security).
 *
 * Deploy: firebase deploy --only functions
 * Emulator: npm run serve (from functions/)
 */

// Side-effect import FIRST: applies global cpu/concurrency to every function.
import "./globalOptions";

export {
  resolveOrCreateUserByPhone,
  claimMobile,
} from "./identity/resolveOrCreateUserByPhone";

export { mintClientAuthToken } from "./identity/mintClientAuthToken";

export {
  checkMobileQuarantine,
  rebindQuarantinedMobileCallable,
} from "./identity/mobileQuarantine";

export {
  confirmVerifiedMobileContactChange,
  preflightVerifiedMobileContactChange,
} from "./identity/confirmVerifiedMobileChange";

export {
  startEmailVerification,
  resendEmailVerification,
  verifyAndBindEmail,
  changeVerifiedEmail,
} from "./email/verification";

export {
  startAccountRecovery,
  completeAccountRecovery,
  openManualRecoveryCase,
  resolveManualRecoveryCase,
} from "./recovery/accountRecovery";

export {
  ensureAccountDeletionJob,
  retireIdentity,
  completeAccountDeletion,
  scheduledDeletionCleanup,
} from "./deletion/lifecycle";

export {
  startAccountReactivation,
  completeAccountReactivation,
} from "./reactivation/accountReactivation";

export {
  registerNewDeviceSecurityEvent,
  retryNewDeviceSecurityEmail,
  handleWasNotMeToken,
  handleWasNotMeTokenHttp,
} from "./security/newDeviceSecurity";

/** VYD-40 GST callables: exported for build, production-disabled (fail-closed). */
export { updateBillingDetails } from "./billing/callables/updateBillingDetails";
export { verifyGstinManual } from "./billing/callables/verifyGstinManual";
export { getInvoiceDownloadUrl } from "./billing/callables/getInvoiceDownloadUrl";
export { generateGstr1WorkingPapers } from "./billing/callables/generateGstr1WorkingPapers";
export { markGstr1Filed } from "./billing/callables/markGstr1Filed";
export { reviewSubscriptionTaxCompliance } from "./billing/callables/reviewTaxCompliance";

/** VYD-32 Google Play billing: exported for build, production-disabled (fail-closed). */
export { prepareAndroidBillingAccount } from "./billing/callables/prepareAndroidBillingAccount";
export { validateAndActivateAndroid } from "./billing/callables/validateAndActivateAndroid";
export { androidRtdn } from "./billing/callables/androidRtdn";
export { scheduledBillingReconciliation } from "./billing/scheduled/billingReconciliation";
export { retryReconciliationWorkItem } from "./billing/callables/retryReconciliationWorkItem";

/** VYD-33 App Store billing: exported for build, production-disabled (fail-closed). */
export { prepareIOSBillingAccount } from "./billing/callables/prepareIOSBillingAccount";
export { validateAndActivateIOS } from "./billing/callables/validateAndActivateIOS";
export { appStoreServerNotificationsV2 } from "./billing/callables/appStoreServerNotificationsV2";
