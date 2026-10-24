/**
 * Production hasher for persistGrinOwnerSession.
 *
 * Uses Expo FileSystem through the retention adapter (tests inject host fs).
 * Does not import node:fs, HostSqlite, or firebase-admin.
 * APP_FILESYSTEM is not NATIVE_DEVICE process-death proof.
 */

import { iterateBoundedChunks, limitChunks, MAX_ORIGINAL_READ_BYTES } from "@/goodsEvidence/boundedRead";
import { createGrinSha256ChunkHasher } from "@/screens/grin/grinOriginalHash";
import { resolveGrinOriginalRetentionFs } from "@/screens/grin/grinOriginalRetention";
import { APP_FILESYSTEM, type GrinLocalOriginalHasher } from "@/services/grin/outbox/types";

export function createAppLocalOriginalHasher(): GrinLocalOriginalHasher {
  return {
    executionLabel: APP_FILESYSTEM,
    createHasher: createGrinSha256ChunkHasher,
    async *chunksForPath(localPath: string) {
      const fs = await resolveGrinOriginalRetentionFs();
      if (fs.openHandle) {
        yield* iterateBoundedChunks(() => fs.openHandle!(localPath), { maxBytes: MAX_ORIGINAL_READ_BYTES });
        return;
      }
      yield* limitChunks(fs.readChunks(localPath), { maxBytes: MAX_ORIGINAL_READ_BYTES });
    },
  };
}
