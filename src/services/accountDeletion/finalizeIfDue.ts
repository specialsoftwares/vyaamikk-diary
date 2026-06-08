import type { UserProfile } from "@/domain/types";
import {
  isDeletionGraceElapsed,
  isPendingDeletionAccount,
} from "@/services/accountDeletion/accountStatus";
import { completeAccountDeletion } from "@/services/accountDeletion/completeDeletion";
import { createLogger } from "@/utils/logger";

const log = createLogger("accountDeletion/finalize");

/**
 * If pending deletion grace has elapsed, run final purge + retirement.
 * Returns true when the account was finalized (caller should treat login as fresh).
 */
export async function finalizeDeletionIfDue(profile: UserProfile): Promise<boolean> {
  if (!isPendingDeletionAccount(profile)) return false;
  if (!isDeletionGraceElapsed(profile)) return false;

  log.info("finalizeDeletionIfDue", { uid: profile.uid, ueid: profile.ueid });
  await completeAccountDeletion(profile);
  return true;
}
