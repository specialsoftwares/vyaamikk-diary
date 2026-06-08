import { AppError } from "@/domain/errors";

export type SyncLockReason = "session_expired" | "unauthorized" | "account_blocked" | null;

type Listener = (reason: SyncLockReason) => void;

let lockReason: SyncLockReason = null;
const listeners = new Set<Listener>();

export const sessionSyncGate = {
  getReason(): SyncLockReason {
    return lockReason;
  },

  isLocked(): boolean {
    return lockReason != null;
  },

  lock(reason: Exclude<SyncLockReason, null>): void {
    lockReason = reason;
    listeners.forEach((l) => l(lockReason));
  },

  unlock(): void {
    lockReason = null;
    listeners.forEach((l) => l(null));
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function isSyncAuthError(error: unknown): boolean {
  const err = error instanceof AppError ? error : null;
  if (!err) {
    const msg = String(error);
    return /unauthorized|permission|auth|token|401|403/i.test(msg);
  }
  return (
    err.code === "session_expired" ||
    err.code === "permission_denied" ||
    err.code === "auth_not_configured"
  );
}
