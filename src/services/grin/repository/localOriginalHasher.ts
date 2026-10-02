/**
 * Production hasher for persistGrinOwnerSession.
 *
 * Uses Expo FileSystem through the retention adapter (tests inject host fs).
 * Does not import node:fs, HostSqlite, or firebase-admin.
 * APP_FILESYSTEM is not NATIVE_DEVICE process-death proof.
 */

import { createGrinSha256ChunkHasher } from "@/screens/grin/grinOriginalHash";
import { resolveGrinOriginalRetentionFs } from "@/screens/grin/grinOriginalRetention";
import { APP_FILESYSTEM, type GrinLocalOriginalHasher } from "@/services/grin/outbox/types";

export function createAppLocalOriginalHasher(): GrinLocalOriginalHasher {
  return {
    executionLabel: APP_FILESYSTEM,
    createHasher: createGrinSha256ChunkHasher,
    async *chunksForPath(localPath: string) {
      const fs = await resolveGrinOriginalRetentionFs();
      yield* fs.readChunks(localPath);
    },
  };
}
