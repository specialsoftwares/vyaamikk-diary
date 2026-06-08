import type { AccountDeletionResult } from "@/domain/accountDeletion";
import type { UserProfile } from "@/domain/types";
import { sessionStore } from "@/services/session";

import { cancelAccountDeletion } from "./cancelDeletion";
import { completeAccountDeletion } from "./completeDeletion";
import { finalizeDeletionIfDue } from "./finalizeIfDue";
import { requestDeletionGraceResult } from "./markPendingDeletion";

export type { AccountDeletionResult } from "@/domain/accountDeletion";
export {
  isActiveAccount,
  isDeletedAccount,
  isPendingDeletionAccount,
  isLoginBlockedAccount,
  isDeletionGraceElapsed,
  deletionScheduledFor,
} from "./accountStatus";
export { isPhoneRetiredLocally, isPhoneRetiredFirestore } from "./retiredIdentity";
export { cancelAccountDeletion } from "./cancelDeletion";
export { finalizeDeletionIfDue } from "./finalizeIfDue";

/**
 * Request account deletion — starts grace period (`pending_deletion`).
 * Does not purge local data until deletion completes.
 */
export async function requestAccountDeletion(
  profile: UserProfile
): Promise<AccountDeletionResult> {
  return requestDeletionGraceResult(profile);
}

/**
 * Final deletion (after grace or admin). Purges device + retires identity.
 */
export async function executeAccountDeletion(
  profile: UserProfile
): Promise<AccountDeletionResult> {
  return completeAccountDeletion(profile);
}
