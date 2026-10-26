/**
 * A persisted session is usable only after local-key preparation succeeds
 * for the same sign-in that started the attempt.
 */

import {
  LocalKeyUnavailable,
  type LocalKeyResult,
} from "@/services/accountDeletion/localDataKey";

export function sessionChangedError(): Error {
  const error = new Error("session_changed");
  Object.defineProperty(error, "reason", { value: "session_changed", enumerable: true });
  return error;
}

export function requireReadyLocalKey(result: LocalKeyResult): void {
  if (result.state !== "ready") {
    throw new LocalKeyUnavailable(result.reason, result.cause);
  }
}

export async function commitAfterLocalReadiness(input: {
  isCurrent: () => boolean;
  prepare: () => Promise<LocalKeyResult>;
  save: () => Promise<void>;
}): Promise<void> {
  if (!input.isCurrent()) throw sessionChangedError();
  const ready = await input.prepare();
  if (!input.isCurrent()) throw sessionChangedError();
  requireReadyLocalKey(ready);
  if (!input.isCurrent()) throw sessionChangedError();
  await input.save();
}
