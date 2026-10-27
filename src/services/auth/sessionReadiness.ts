/**
 * A session is saved or restored only after the local account key is ready.
 * Failure clears the retained auth session and leaves encrypted rows in place.
 */

import {
  LocalKeyUnavailable,
  type LocalKeyResult,
} from "@/services/accountDeletion/localDataKey";

export async function commitSessionAfterLocalReadiness(input: {
  userId: string;
  prepare: (userId: string) => Promise<LocalKeyResult>;
  save: () => Promise<void>;
}): Promise<void> {
  const ready = await input.prepare(input.userId);
  if (ready.state !== "ready") throw new LocalKeyUnavailable(ready.reason);
  await input.save();
}

export async function retainedSessionMayPublish(input: {
  userId: string;
  prepare: (userId: string) => Promise<LocalKeyResult>;
  clearRetainedSession: () => Promise<void>;
}): Promise<boolean> {
  let ready: LocalKeyResult;
  try {
    ready = await input.prepare(input.userId);
  } catch (error) {
    await input.clearRetainedSession();
    if (error instanceof LocalKeyUnavailable) return false;
    throw error;
  }
  if (ready.state === "ready") return true;
  await input.clearRetainedSession();
  return false;
}
