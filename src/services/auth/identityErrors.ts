import { AppError } from "@/domain/errors";
import { deletionScheduledFor } from "@/services/accountDeletion/accountStatus";
import type { UserProfile } from "@/domain/types";

export function throwPendingDeletionLoginBlocked(profile: UserProfile): never {
  const scheduled = deletionScheduledFor(profile);
  throw new AppError(
    "account_pending_deletion",
    "Account deletion is in progress. You can cancel it before the scheduled date or wait for deletion to complete.",
    undefined,
    {
      phoneE164: profile.phoneE164,
      deletionScheduledFor: scheduled,
      ueid: profile.ueid,
    }
  );
}
