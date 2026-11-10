/**
 * Client transport for the owner-object callable.
 * A returned URL is a short-lived read or upload ticket. Callers must not store it
 * as the durable object location. The durable location is the canonical storage path.
 */

import {
  mayIssueRemoteWork,
  type SyncSessionToken,
} from "@/sync/syncSessionOwnership";

import { StorageUploadOwnershipError } from "./userStorageUploadCore";

export type OwnerObjectCall = (data: Record<string, unknown>) => Promise<unknown>;
export type OwnerObjectPut = (input: { url: string; localUri?: string; bytes?: Uint8Array; contentType: string }) => Promise<number>;

export type OwnerObjectGatewayPorts = {
  call: OwnerObjectCall;
  put: OwnerObjectPut;
  localBytes: (localUri: string) => Promise<number>;
};

type OkRecord = Record<string, unknown> & { ok: true };

function asOk(value: unknown): OkRecord {
  if (!value || typeof value !== "object" || (value as { ok?: unknown }).ok !== true) {
    throw new Error("object_transfer_unknown");
  }
  return value as OkRecord;
}

export function createOwnerObjectGateway(ports: OwnerObjectGatewayPorts) {
  async function call(data: Record<string, unknown>): Promise<OkRecord> {
    return asOk(await ports.call(data));
  }

  return {
    async upload(input: {
      storagePath: string;
      contentType: string;
      localUri?: string;
      bytes?: Uint8Array;
      userId?: string;
      session?: SyncSessionToken | null;
    }): Promise<{ storagePath: string; generation: string; localBytes: number; remoteBytes: number }> {
      if (input.session !== undefined && (!input.userId || !mayIssueRemoteWork(input.session, input.userId))) {
        throw new StorageUploadOwnershipError();
      }
      const localBytes = input.bytes ? input.bytes.byteLength : await ports.localBytes(input.localUri ?? "");
      const begun = await call({ operation: "begin", path: input.storagePath, contentType: input.contentType });
      const attemptId = String(begun.attemptId ?? "");
      const uploadUrl = String(begun.uploadUrl ?? "");
      if (!attemptId || !uploadUrl) throw new Error("object_transfer_unknown");
      if (input.session !== undefined && (!input.userId || !mayIssueRemoteWork(input.session, input.userId))) {
        await ports.call({ operation: "abort", attemptId }).catch(() => undefined);
        throw new StorageUploadOwnershipError();
      }
      let status = 0;
      try {
        status = await ports.put({ url: uploadUrl, localUri: input.localUri, bytes: input.bytes, contentType: input.contentType });
      } catch (error) {
        await ports.call({ operation: "abort", attemptId }).catch(() => undefined);
        throw error;
      }
      if (status < 200 || status >= 300) {
        await ports.call({ operation: "abort", attemptId }).catch(() => undefined);
        throw new Error("object_transfer_unknown");
      }
      const committed = await call({ operation: "commit", attemptId });
      const remoteBytes = Number(committed.size);
      if (!Number.isFinite(remoteBytes) || remoteBytes !== localBytes) {
        throw new Error("object_transfer_unknown");
      }
      return {
        storagePath: String(committed.path ?? input.storagePath),
        generation: String(committed.generation ?? ""),
        localBytes,
        remoteBytes,
      };
    },
    async read(path: string): Promise<{ url: string; contentType: string; generation: string } | null> {
      try {
        const result = await call({ operation: "read", path });
        const url = String(result.url ?? "");
        if (!url) return null;
        return { url, contentType: String(result.contentType ?? ""), generation: String(result.generation ?? "") };
      } catch {
        return null;
      }
    },
    async remove(path: string, generation?: string): Promise<void> {
      await call({ operation: "delete", path, generation });
    },
  };
}

async function productionPorts(): Promise<OwnerObjectGatewayPorts> {
  const { getFunctions, httpsCallable } = await import("firebase/functions");
  const { getFirebaseApp } = await import("@/config/firebase");
  const { canonicalFunctionsRegion } = await import("@/services/auth/authFlowErrorPresentation");
  const callable = httpsCallable(getFunctions(getFirebaseApp(), canonicalFunctionsRegion()), "ownerObjectTransfer");
  return {
    async call(data) {
      const result = await callable(data);
      return result.data;
    },
    async put(input) {
      const FileSystem = await import("expo-file-system/legacy");
      if (!input.localUri) throw new Error("object_transfer_unknown");
      const result = await FileSystem.uploadAsync(input.url, input.localUri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { "Content-Type": input.contentType },
      });
      return result.status;
    },
    async localBytes(localUri) {
      const FileSystem = await import("expo-file-system/legacy");
      const info = await FileSystem.getInfoAsync(localUri);
      if (!info.exists || !("size" in info) || typeof info.size !== "number" || info.size <= 0) {
        throw new Error("Local file missing or size unknown for Storage upload.");
      }
      return info.size;
    },
  };
}

let cached: ReturnType<typeof createOwnerObjectGateway> | null = null;

export async function ownerObjectGateway(): Promise<ReturnType<typeof createOwnerObjectGateway>> {
  if (!cached) cached = createOwnerObjectGateway(await productionPorts());
  return cached;
}
