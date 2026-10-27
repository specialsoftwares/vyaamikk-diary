/**
 * A session is published only after the local account key is ready and the
 * attempt still owns it. A temporary failure leaves the retained session,
 * the key, and encrypted rows where they are. The app stays signed out.
 */

import {
  LocalKeyUnavailable,
  type LocalKeyResult,
} from "@/services/accountDeletion/localDataKey";

export async function commitSessionAfterLocalReadiness(input: {
  userId: string;
  prepare: (userId: string) => Promise<LocalKeyResult>;
  stillCurrent?: () => boolean;
  save: () => Promise<void>;
}): Promise<void> {
  let ready: LocalKeyResult;
  try {
    ready = await input.prepare(input.userId);
  } catch (error) {
    if (input.stillCurrent && !input.stillCurrent()) throw new Error("session_changed");
    throw error;
  }
  if (input.stillCurrent && !input.stillCurrent()) throw new Error("session_changed");
  if (ready.state !== "ready") throw new LocalKeyUnavailable(ready.reason);
  await input.save();
}

export async function retainedSessionMayPublish(input: {
  userId: string;
  prepare: (userId: string) => Promise<LocalKeyResult>;
  stillCurrent: () => boolean;
}): Promise<boolean> {
  let ready: LocalKeyResult;
  try {
    ready = await input.prepare(input.userId);
  } catch (error) {
    if (!input.stillCurrent()) return false;
    if (error instanceof LocalKeyUnavailable) return false;
    throw error;
  }
  if (!input.stillCurrent()) return false;
  return ready.state === "ready";
}
