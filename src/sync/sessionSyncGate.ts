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
  const app = error instanceof AppError ? error : null;
  if (app) {
    return app.code === "session_expired" || app.code === "auth_not_configured";
  }
  if (error && typeof error === "object" && "code" in error) {
    const raw = String((error as { code: unknown }).code).replace(/^firestore\//, "");
    return raw === "unauthenticated";
  }
  return false;
}
