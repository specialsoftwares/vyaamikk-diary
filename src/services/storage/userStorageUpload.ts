/**
 * Authenticated Firebase Storage upload that never constructs RN Blobs.
 *
 * Production path: Expo legacy `uploadAsync` BINARY_CONTENT → Storage media
 * REST with the signed-in user's ID token. Size verified via getMetadata.
 *
 * Ports are injectable for execution tests (see userStorageUploadCore.ts).
 * When FIREBASE_STORAGE_EMULATOR_HOST is set, URLs target the emulator —
 * never the production host.
 */

import * as FileSystem from "expo-file-system/legacy";
import { getDownloadURL, getMetadata, ref } from "firebase/storage";

import { env } from "@/config/env";
import { getFirebaseAuth, getFirebaseStorage } from "@/config/firebase";
import type { SyncSessionToken } from "@/sync/syncSessionOwnership";
import { createLogger } from "@/utils/logger";

import {
  buildMediaUploadUrl as buildMediaUploadUrlCore,
  uploadLocalFileViaMediaApi as uploadViaPorts,
  type MediaUploadPorts,
  type VerifiedStorageUpload,
} from "./userStorageUploadCore";

export {
  FIREBASE_STORAGE_MULTIPART_THRESHOLD_BYTES,
  StorageUploadOwnershipError,
  wouldUseMultipartInJsSdk,
  type MediaUploadPorts,
  type VerifiedStorageUpload,
} from "./userStorageUploadCore";

const log = createLogger("storage/userUpload");

export function storageBucketNameFromEnv(
  raw: string | null | undefined = env.firebase.storageBucket
): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) throw new Error("Firebase Storage bucket is not configured.");
  return trimmed.replace(/^gs:\/\//, "").replace(/\/$/, "");
}

/** Convenience wrapper: bucket from env when omitted. */
export function buildMediaUploadUrl(
  storagePath: string,
  opts?: { bucket?: string; emulatorHost?: string | null }
): string {
  return buildMediaUploadUrlCore(storagePath, {
    bucket: opts?.bucket ?? storageBucketNameFromEnv(),
    emulatorHost: opts?.emulatorHost,
  });
}

export function createDefaultMediaUploadPorts(): MediaUploadPorts {
  return {
    async getLocalBytes(localUri) {
      const info = await FileSystem.getInfoAsync(localUri);
      if (!info.exists || !("size" in info) || typeof info.size !== "number") {
        throw new Error("Local file missing or size unknown for Storage upload.");
      }
      if (info.size <= 0) throw new Error("Local file is empty.");
      return info.size;
    },
    async getAuthHeaders(contentType) {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error("Not signed in for Storage upload.");
      const idToken = await user.getIdToken();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": contentType,
      };
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const appCheckMod = require("@react-native-firebase/app-check") as {
          default: () => { getToken?: (force?: boolean) => Promise<{ token: string }> };
        };
        const inst = appCheckMod.default();
        if (typeof inst.getToken === "function") {
          const { token } = await inst.getToken(false);
          if (token) headers["X-Firebase-AppCheck"] = token;
        }
      } catch {
        // optional
      }
      return headers;
    },
    buildUploadUrl(storagePath) {
      return buildMediaUploadUrl(storagePath);
    },
    async uploadBinary({ url, localUri, headers }) {
      const result = await FileSystem.uploadAsync(url, localUri, {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers,
      });
      return { status: result.status, body: result.body };
    },
    async getRemoteSize(storagePath) {
      const objectRef = ref(getFirebaseStorage(), storagePath);
      const meta = await getMetadata(objectRef);
      return typeof meta.size === "number" ? meta.size : -1;
    },
    async getDownloadUrl(storagePath) {
      try {
        return await getDownloadURL(ref(getFirebaseStorage(), storagePath));
      } catch (e) {
        log.warn("getDownloadURL after media upload", e);
        return undefined;
      }
    },
  };
}

/**
 * Upload via media REST. Uses injected ports or production Expo/Firebase defaults.
 */
export async function uploadLocalFileViaMediaApi(input: {
  storagePath: string;
  localUri: string;
  contentType: string;
  userId?: string;
  session?: SyncSessionToken | null;
  ports?: MediaUploadPorts;
}): Promise<VerifiedStorageUpload> {
  return uploadViaPorts({
    ...input,
    ports: input.ports ?? createDefaultMediaUploadPorts(),
  });
}
