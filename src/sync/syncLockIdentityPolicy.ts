/**
 * Policy for when the module-level session sync lock must clear.
 *
 * The lock is a process-wide singleton. If it survives sign-out / a new
 * identity, `syncEngine.flush` no-ops forever and cloud sync appears dead
 * until the user finds the session-expired banner. Identity transitions
 * must always clear it.
 */

import { sessionSyncGate } from "@/sync/sessionSyncGate";
import { syncSessionOwnership, type SyncSessionToken } from "@/sync/syncSessionOwnership";

export type AuthSyncTransition = {
  prevStatus: "loading" | "signed_out" | "signed_in";
  nextStatus: "loading" | "signed_out" | "signed_in";
  prevUid: string | null;
  nextUid: string | null;
};

export function shouldClearSyncLockOnAuthTransition(
  t: AuthSyncTransition
): boolean {
  // Left the signed-in world (logout, deletion, boot failure → signed_out).
  if (t.prevStatus === "signed_in" && t.nextStatus !== "signed_in") {
    return true;
  }
  // Fresh sign-in after any other status.
  if (t.nextStatus === "signed_in" && t.prevStatus !== "signed_in") {
    return true;
  }
  // Same status signed-in but different account (device switch / rebind).
  if (
    t.prevStatus === "signed_in" &&
    t.nextStatus === "signed_in" &&
    t.prevUid &&
    t.nextUid &&
    t.prevUid !== t.nextUid
  ) {
    return true;
  }
  return false;
}

/**
 * Production auth→sync lifecycle. Call this on every identity transition
 * (including tests). Rotates the session-generation token and clears the
 * process-wide lock so delayed work from the previous session cannot relock
 * or publish into the new one.
 */
export function applyAuthSyncIdentityTransition(t: AuthSyncTransition): SyncSessionToken | null {
  if (!shouldClearSyncLockOnAuthTransition(t)) {
    return syncSessionOwnership.current();
  }
  sessionSyncGate.unlock();
  if (t.nextStatus === "signed_in" && t.nextUid) {
    return syncSessionOwnership.beginSession(t.nextUid);
  }
  syncSessionOwnership.endSession();
  return null;
}
