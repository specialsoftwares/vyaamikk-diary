/**
 * Client transport for the owner-object callable.
 * A returned URL is a short-lived, generation-bound ticket. Callers must not
 * store it as the durable object location. The ticket remains usable until
 * its expiry; ending the session does not cancel it.
 * A timeout leaves the same attempt open. It does not start another attempt
 * and it does not cancel the server operation.
 * Abort after a retired session, a failed PUT, or a non-success status uses
 * the same wait bound. If that abort does not settle, the attempt stays
 * pending and the result is unknown. The deadline does not mean the object
 * was deleted. An expired attempt, which the server reaches only when no
 * bytes were published, may be replaced by a later begin.
 * A same-account session replacement after begin or commit keeps the existing
 * attempt id. The current session commits that attempt and accepts the result
 * only when path, generation, and size match. It does not abort a committed or
 * publishing attempt. A different account never adopts that attempt.
 */

import {
  mayIssueRemoteWork,
  type SyncSessionToken,
} from "@/sync/syncSessionOwnership";

import { StorageUploadOwnershipError } from "./userStorageUploadCore";

export const OBJECT_TRANSFER_CLIENT_WAIT_MS = 20_000;

export type OwnerObjectFailureCode =
  | "denied"
  | "not_found"
  | "network"
  | "unknown"
  | "conflict"
  | "expired"
  | "type"
  | "unsupported";

const PUBLIC_MESSAGE: Record<OwnerObjectFailureCode, string> = {
  denied: "You don't have access to this file anymore.",
  not_found: "That file is no longer available.",
  network: "The connection dropped before the file finished.",
  unknown: "The file transfer didn't finish. You can try again.",
  conflict: "That file changed before it could be saved.",
  expired: "The upload timed out. Start it again.",
  type: "This file type can't be saved.",
  unsupported: "This file has to be opened from the goods record.",
};

export class OwnerObjectTransferError extends Error {
  readonly code: OwnerObjectFailureCode;
  readonly attemptId: string | null;
  readonly retryable: boolean;

  constructor(code: OwnerObjectFailureCode, attemptId: string | null = null, retryable = false) {
    super(PUBLIC_MESSAGE[code]);
    this.name = "OwnerObjectTransferError";
    this.code = code;
    this.attemptId = attemptId;
    this.retryable = retryable;
  }
}

export type OwnerObjectCall = (data: Record<string, unknown>) => Promise<unknown>;
export type OwnerObjectPut = (input: {
  url: string;
  localUri?: string;
  bytes?: Uint8Array;
  contentType: string;
  headers: Record<string, string>;
}) => Promise<number>;

export type OwnerObjectGatewayPorts = {
  call: OwnerObjectCall;
  put: OwnerObjectPut;
  localBytes: (localUri: string) => Promise<number>;
  waitMs?: number;
};

export type OwnedObjectTicket = {
  url: string;
  contentType: string;
  generation: string;
  expiresAt: number;
};

type OkRecord = Record<string, unknown> & { ok: true };

function asOk(value: unknown): OkRecord {
  if (!value || typeof value !== "object" || (value as { ok?: unknown }).ok !== true) {
    throw new OwnerObjectTransferError("unknown", null, true);
  }
  return value as OkRecord;
}

function codeOf(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  return String((error as { code: unknown }).code);
}

export function mapOwnerObjectCallError(error: unknown, attemptId: string | null): OwnerObjectTransferError {
  if (error instanceof OwnerObjectTransferError) return error;
  if (error instanceof StorageUploadOwnershipError) throw error;
  const code = codeOf(error);
  const message = error instanceof Error ? error.message : "";
  if (code.endsWith("permission-denied") || message === "object_denied") return new OwnerObjectTransferError("denied", attemptId);
  if (code.endsWith("not-found") || message === "object_not_found") return new OwnerObjectTransferError("not_found", attemptId);
  if (code.endsWith("aborted") || message === "object_conflict") return new OwnerObjectTransferError("conflict", attemptId);
  if (code.endsWith("failed-precondition") || message === "object_transfer_expired") {
    return new OwnerObjectTransferError("expired", attemptId, true);
  }
  if (message.startsWith("object_type") || message === "object_type") return new OwnerObjectTransferError("type", attemptId);
  if (code === "") return new OwnerObjectTransferError("network", attemptId, true);
  return new OwnerObjectTransferError("unknown", attemptId, true);
}

function withBound<T>(work: Promise<T>, waitMs: number, attemptId: string | null): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new OwnerObjectTransferError("unknown", attemptId, true));
    }, waitMs);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function isGrinPath(path: string): boolean {
  return path.split("/").includes("grinEvidence");
}

export function createOwnerObjectGateway(ports: OwnerObjectGatewayPorts) {
  const waitMs = ports.waitMs ?? OBJECT_TRANSFER_CLIENT_WAIT_MS;
  const pending = new Map<string, string>();
  const inflight = new Map<string, { attemptId: string; pendingKey: string; sessionGeneration: number | null }>();

  async function call(data: Record<string, unknown>, attemptId: string | null): Promise<OkRecord> {
    try {
      return asOk(await withBound(ports.call(data), waitMs, attemptId));
    } catch (error) {
      throw mapOwnerObjectCallError(error, attemptId);
    }
  }

  async function abortAttempt(attemptId: string): Promise<"aborted" | "unknown"> {
    try {
      const value = await withBound(ports.call({ operation: "abort", attemptId }), waitMs, attemptId);
      if (!value || typeof value !== "object" || (value as { ok?: unknown }).ok !== true) return "unknown";
      return "aborted";
    } catch {
      return "unknown";
    }
  }

  function finishCleanup(
    attemptId: string,
    pendingKey: string,
    flightKey: string,
    cleanup: "aborted" | "unknown",
    settled: Error
  ): never {
    if (cleanup === "aborted") {
      pending.delete(pendingKey);
      inflight.delete(flightKey);
    }
    if (cleanup === "unknown") throw new OwnerObjectTransferError("unknown", attemptId, true);
    throw settled;
  }

  return {
    async upload(input: {
      storagePath: string;
      contentType: string;
      localUri?: string;
      bytes?: Uint8Array;
      userId?: string;
      session?: SyncSessionToken | null;
      grin?: { ledgerId: string; receiptId: string; evidenceId: string };
      attemptId?: string;
    }): Promise<{ storagePath: string; generation: string; localBytes: number; remoteBytes: number }> {
      const userId = input.userId;
      const session = input.session;
      const still = () => session === undefined || (Boolean(userId) && mayIssueRemoteWork(session, userId ?? ""));
      if (!still()) throw new StorageUploadOwnershipError();
      const pendingKey = `${userId ?? ""}#${session?.generation ?? ""}#${input.storagePath}`;
      const flightKey = input.storagePath;
      const localBytes = input.bytes ? input.bytes.byteLength : await ports.localBytes(input.localUri ?? "");
      if (!still()) throw new StorageUploadOwnershipError();
      const ownsPath = Boolean(userId) && input.storagePath.startsWith(`users/${userId}/`);
      const flight = inflight.get(flightKey);
      let attemptId = input.attemptId || pending.get(pendingKey) || "";
      if (!attemptId && flight) {
        const sameSession = session === undefined || flight.sessionGeneration === (session?.generation ?? null);
        if (sameSession || ownsPath) {
          attemptId = flight.attemptId;
          if (flight.pendingKey !== pendingKey) pending.delete(flight.pendingKey);
          pending.set(pendingKey, attemptId);
          inflight.set(flightKey, {
            attemptId,
            pendingKey,
            sessionGeneration: session === undefined ? flight.sessionGeneration : session?.generation ?? null,
          });
        } else {
          const cleanup = await abortAttempt(flight.attemptId);
          if (cleanup !== "aborted") throw new OwnerObjectTransferError("unknown", flight.attemptId, true);
          pending.delete(flight.pendingKey);
          inflight.delete(flightKey);
        }
      }
      if (!attemptId) {
        const begun = await call(
          {
            operation: "begin",
            path: input.storagePath,
            contentType: input.contentType,
            ...(input.grin
              ? { ledgerId: input.grin.ledgerId, receiptId: input.grin.receiptId, evidenceId: input.grin.evidenceId }
              : {}),
          },
          null
        );
        attemptId = String(begun.attemptId ?? "");
        const uploadUrl = String(begun.uploadUrl ?? "");
        const headers = begun.requiredHeaders;
        if (!attemptId || !uploadUrl || !headers || typeof headers !== "object") {
          throw new OwnerObjectTransferError("unknown", attemptId || null, true);
        }
        const requiredHeaders = headers as Record<string, string>;
        if (requiredHeaders["x-goog-if-generation-match"] !== "0") {
          throw new OwnerObjectTransferError("unknown", attemptId, true);
        }
        pending.set(pendingKey, attemptId);
        inflight.set(flightKey, { attemptId, pendingKey, sessionGeneration: session?.generation ?? null });
        if (!still()) {
          finishCleanup(attemptId, pendingKey, flightKey, await abortAttempt(attemptId), new StorageUploadOwnershipError());
        }
        let status = 0;
        try {
          status = await withBound(
            ports.put({
              url: uploadUrl,
              localUri: input.localUri,
              bytes: input.bytes,
              contentType: input.contentType,
              headers: { "Content-Type": input.contentType, ...requiredHeaders },
            }),
            waitMs,
            attemptId
          );
        } catch (error) {
          if (error instanceof OwnerObjectTransferError && error.code === "unknown") throw error;
          if (error instanceof StorageUploadOwnershipError) throw error;
          const mapped = error instanceof OwnerObjectTransferError ? error : mapOwnerObjectCallError(error, attemptId);
          finishCleanup(attemptId, pendingKey, flightKey, await abortAttempt(attemptId), mapped);
        }
        if (!still() || status < 200 || status >= 300) {
          const reason = !still()
            ? new StorageUploadOwnershipError()
            : new OwnerObjectTransferError("unknown", attemptId, true);
          finishCleanup(attemptId, pendingKey, flightKey, await abortAttempt(attemptId), reason);
        }
      }
      if (!still()) throw new StorageUploadOwnershipError();
      let committed: OkRecord;
      try {
        committed = await call({ operation: "commit", attemptId }, attemptId);
      } catch (error) {
        if (error instanceof OwnerObjectTransferError && error.code === "expired") {
          pending.delete(pendingKey);
          inflight.delete(flightKey);
        }
        throw error;
      }
      if (!still()) throw new StorageUploadOwnershipError();
      const remoteBytes = Number(committed.size);
      const generation = String(committed.generation ?? "");
      if (!generation || !Number.isFinite(remoteBytes) || remoteBytes !== localBytes) {
        throw new OwnerObjectTransferError("unknown", attemptId, true);
      }
      pending.delete(pendingKey);
      inflight.delete(flightKey);
      return {
        storagePath: String(committed.path ?? input.storagePath),
        generation,
        localBytes,
        remoteBytes,
      };
    },
    async read(path: string): Promise<OwnedObjectTicket> {
      if (isGrinPath(path)) throw new OwnerObjectTransferError("unsupported");
      try {
        const result = await call({ operation: "read", path }, null);
        const url = String(result.url ?? "");
        const generation = String(result.generation ?? "");
        const expiresAt = Number(result.expiresAt);
        if (!url || !generation || !Number.isFinite(expiresAt)) throw new OwnerObjectTransferError("unknown", null, true);
        return { url, contentType: String(result.contentType ?? ""), generation, expiresAt };
      } catch (error) {
        throw mapOwnerObjectCallError(error, null);
      }
    },
    async remove(path: string, generation?: string): Promise<void> {
      if (isGrinPath(path)) throw new OwnerObjectTransferError("unsupported");
      await call({ operation: "delete", path, generation }, null);
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
      if (!input.localUri) throw new OwnerObjectTransferError("unknown", null, true);
      const result = await FileSystem.uploadAsync(input.url, input.localUri, {
        httpMethod: "PUT",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: input.headers,
      });
      return result.status;
    },
    async localBytes(localUri) {
      const FileSystem = await import("expo-file-system/legacy");
      const info = await FileSystem.getInfoAsync(localUri);
      if (!info.exists || !("size" in info) || typeof info.size !== "number" || info.size <= 0) {
        throw new OwnerObjectTransferError("unknown", null, true);
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
