/**
 * The profile document is issued only while the session that started the
 * write still owns it. Preparation may await the bridge, the profile read,
 * and sealing; the ownership check is the last step before setDoc.
 */

import type { ProfileWriteClaim } from "@/services/auth/types";

export type ProfileWriteLive = {
  uid: string | null;
  generation: number;
};

export function profileWriteStillOwned(
  claim: ProfileWriteClaim,
  live: ProfileWriteLive
): boolean {
  if (live.generation !== claim.generation) return false;
  if (live.uid != null && live.uid !== claim.uid) return false;
  return true;
}

export async function issueProfileDocumentIfOwned(input: {
  claim: ProfileWriteClaim;
  readLive: () => ProfileWriteLive;
  prepare: () => Promise<void>;
  setDoc: () => Promise<void>;
}): Promise<void> {
  await input.prepare();
  if (!profileWriteStillOwned(input.claim, input.readLive())) {
    throw new Error("session_changed");
  }
  await input.setDoc();
}
