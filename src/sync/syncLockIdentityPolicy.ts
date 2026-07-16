/**
 * Policy for when the module-level session sync lock must clear.
 *
 * The lock is a process-wide singleton. If it survives sign-out / a new
 * identity, `syncEngine.flush` no-ops forever and cloud sync appears dead
 * until the user finds the session-expired banner. Identity transitions
 * must always clear it.
 */

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
