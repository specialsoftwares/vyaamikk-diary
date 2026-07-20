/**
 * Local device behaviour when cloud account deletion is in flight or finished.
 *
 * Cloud Functions cannot erase SQLite / AsyncStorage / SecureStore on a device
 * that is offline or uninstalled.
 *
 * Policy (see LOCAL_DEVICE_DELETION_DECISION.md):
 * - During 15-day grace: retain local data for reactivation.
 * - After final deletion detection: purge user-scoped local data for that uid.
 */

import type { UserProfile } from "@/domain/types";
import { resolveAccountStatus } from "@/services/accountDeletion/accountStatus";
import {
  decideLocalDataAction,
  type LocalDeletionPolicyAction,
} from "@/services/accountDeletion/localDevicePolicyDecision";
import { purgeLocalAccountData } from "@/services/accountDeletion/purgeLocal";
import { createLogger } from "@/utils/logger";

export type { LocalDeletionPolicyAction };
export { decideLocalDataAction } from "@/services/accountDeletion/localDevicePolicyDecision";

const log = createLogger("accountDeletion/localDevice");

/**
 * Apply local policy after session revalidation. Never touches other users' rows.
 */
export async function applyLocalDeletionPolicy(input: {
  cachedUser: UserProfile | null;
  liveUser: UserProfile | null;
  liveMissingOrDeleted: boolean;
}): Promise<LocalDeletionPolicyAction> {
  const liveStatus = input.liveUser
    ? resolveAccountStatus(input.liveUser)
    : null;
  const action = decideLocalDataAction({
    liveStatus,
    hasCachedUser: Boolean(input.cachedUser),
    liveMissingOrDeleted: input.liveMissingOrDeleted,
  });
  const uid = input.cachedUser?.uid ?? input.liveUser?.uid;
  if (action === "purge_user_scoped_local" && uid) {
    log.info("purging local data after final deletion detection", { uid });
    await purgeLocalAccountData({
      userId: uid,
      profileLogo:
        input.cachedUser?.profileLogo ?? input.liveUser?.profileLogo ?? null,
    });
  }
  return action;
}
