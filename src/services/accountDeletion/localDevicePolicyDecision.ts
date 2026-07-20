/**
 * Pure local-device deletion policy decisions (Node-testable).
 */

import type { AccountStatus } from "@/domain/accountDeletion";

export type LocalDeletionPolicyAction =
  | "retain_for_grace_or_reactivation"
  | "purge_user_scoped_local"
  | "none";

export function decideLocalDataAction(input: {
  liveStatus: AccountStatus | null;
  hasCachedUser: boolean;
  liveMissingOrDeleted: boolean;
}): LocalDeletionPolicyAction {
  if (input.liveStatus === "pending_deletion") {
    return "retain_for_grace_or_reactivation";
  }
  if (input.liveStatus === "deleted") {
    return "purge_user_scoped_local";
  }
  if (input.liveMissingOrDeleted && input.hasCachedUser) {
    return "purge_user_scoped_local";
  }
  return "none";
}
