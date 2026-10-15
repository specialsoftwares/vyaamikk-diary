import { syncSessionOwnership } from "@/sync/syncSessionOwnership";

import { CashPaidPhotoError } from "./cashPaidPhotoRef";

export type SessionUidReader = () => string | null;

export function defaultSessionUidReader(): string | null {
  return syncSessionOwnership.current()?.uid ?? null;
}

/**
 * Bind a photo operation to the owner captured before the first await.
 * A later session for a different uid, or a logout, must not write.
 */
export function captureCashPhotoOwner(expectedUid: string, readSessionUid?: SessionUidReader) {
  const read = readSessionUid ?? defaultSessionUidReader;
  const start = read();
  if (start != null && start !== expectedUid) {
    throw new CashPaidPhotoError("owner_changed");
  }
  const startedBound = start != null;
  return {
    assertStillOwner(): void {
      const live = read();
      if (startedBound) {
        if (live !== expectedUid) throw new CashPaidPhotoError("owner_changed");
        return;
      }
      if (live != null && live !== expectedUid) throw new CashPaidPhotoError("owner_changed");
    },
  };
}
