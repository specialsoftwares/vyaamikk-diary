/**
 * The profile document is issued only while the session that started the
 * write still owns it. Preparation may await the bridge, the profile read,
 * and sealing; the ownership check is the last step before setDoc.
 * A missing or unreadable UID is not ownership.
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
  if (!claim.uid || !live.uid) return false;
  if (live.uid !== claim.uid) return false;
  return live.generation === claim.generation;
}

/**
 * Native builds trust the native phone-auth UID. Web trusts the JS Auth UID.
 * Neither source may be replaced by null.
 */
export function authoritativeProfileWriteUid(input: {
  platform: string | null;
  nativeUid: string | null;
  jsUid: string | null;
}): string | null {
  if (!input.platform) return null;
  const source = input.platform === "web" ? input.jsUid : input.nativeUid;
  if (!source) return null;
  return source;
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
