/**
 * Live identity read immediately before a session is stored or published.
 * Native builds use the native phone-auth UID. Web uses the JS Auth UID.
 */

import { authoritativeProfileWriteUid } from "@/services/auth/profileWriteOwnership";
import type { SessionLive } from "@/services/accountDeletion/sessionLocalReadiness";

export function sessionPublicationLive(input: {
  platform: string | null;
  nativeUid: string | null;
  jsUid: string | null;
  generation: number;
  epoch: number;
}): SessionLive {
  return {
    uid: authoritativeProfileWriteUid({
      platform: input.platform,
      nativeUid: input.nativeUid,
      jsUid: input.jsUid,
    }),
    generation: input.generation,
    epoch: input.epoch,
  };
}
