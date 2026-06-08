/**
 * Vyaamikk Diary — Cloud Functions (identity, email, deletion).
 *
 * Deploy: firebase deploy --only functions
 * Emulator: npm run serve (from functions/)
 */

export {
  resolveOrCreateUserByPhone,
  claimMobile,
} from "./identity/resolveOrCreateUserByPhone";

export {
  startEmailVerification,
  verifyAndBindEmail,
  changeVerifiedEmail,
} from "./email/verification";

export {
  retireIdentity,
  completeAccountDeletion,
  scheduledDeletionCleanup,
} from "./deletion/lifecycle";
