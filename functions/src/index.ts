/**
 * Vyaamikk Diary — Cloud Functions (identity, email, deletion, security).
 *
 * Deploy: firebase deploy --only functions
 * Emulator: npm run serve (from functions/)
 */

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
