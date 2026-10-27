/**
 * A persisted session is usable only after local-key preparation succeeds
 * for the same sign-in that started the attempt.
 * A null or different live UID is not that sign-in.
 */

import {
  LocalKeyUnavailable,
  type LocalKeyResult,
} from "@/services/accountDeletion/localDataKey";
import { profileWriteStillOwned } from "@/services/auth/profileWriteOwnership";
import type { ProfileWriteClaim } from "@/services/auth/types";

export type SessionClaim = ProfileWriteClaim & { epoch: number };

export type SessionLive = {
  uid: string | null;
  generation: number;
  epoch: number;
};

export function sessionChangedError(): Error {
  const error = new Error("session_changed");
  Object.defineProperty(error, "reason", { value: "session_changed", enumerable: true });
  return error;
}

export function sessionStillOwned(claim: SessionClaim, live: SessionLive): boolean {
  return (
    profileWriteStillOwned(claim, live) &&
    claim.epoch === live.epoch
  );
}

export function requireReadyLocalKey(result: LocalKeyResult): void {
  if (result.state !== "ready") {
    throw new LocalKeyUnavailable(result.reason, result.cause);
  }
}

export async function commitAfterLocalReadiness(input: {
  claim: SessionClaim;
  readLive: () => SessionLive;
  prepare: () => Promise<LocalKeyResult>;
  save: () => Promise<void>;
}): Promise<void> {
  const owned = () => sessionStillOwned(input.claim, input.readLive());
  if (!owned()) throw sessionChangedError();
  const ready = await input.prepare();
  if (!owned()) throw sessionChangedError();
  requireReadyLocalKey(ready);
  if (!owned()) throw sessionChangedError();
  await input.save();
  if (!owned()) throw sessionChangedError();
}

/**
 * Startup may retry this. A failure keeps the stored session and does not
 * publish it as ready. A later successful prepare is the recovery path.
 */
export async function openRetainedSession(input: {
  session: { user: { uid: string } } | null;
  prepare: (uid: string) => Promise<LocalKeyResult>;
  liveUid: string | null;
}): Promise<{ action: "absent" } | { action: "hold"; reason: string } | { action: "publish" }> {
  const uid = input.session?.user.uid;
  if (!uid) return { action: "absent" };
  if (input.liveUid && input.liveUid !== uid) {
    return { action: "hold", reason: "session_changed" };
  }
  try {
    const ready = await input.prepare(uid);
    if (ready.state !== "ready") return { action: "hold", reason: ready.reason };
    return { action: "publish" };
  } catch (error) {
    if (error instanceof LocalKeyUnavailable) return { action: "hold", reason: error.reason };
    throw error;
  }
}
