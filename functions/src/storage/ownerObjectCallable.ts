/**
 * Production callable for owner object transfer.
 * Identity is the verified bearer subject. The handler does not read a payload uid
 * as authority. Staging tickets last two minutes; read tickets last one minute.
 */

import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { randomBytes } from "node:crypto";

import { getAdminBucket, getAdminDb } from "../admin";
import { assertAdmittedCallableUser } from "../identity/admitCallableUser";
import { objectKeyPath } from "../goodsEvidence/g2/paths";
import {
  performOwnerObjectTransfer,
  type CopyOutcome,
  type ObjectStat,
  type OwnerObjectPorts,
  type TransferAttempt,
  type TransferRequest,
  type TransferResult,
} from "./ownerObjectTransfer";

type BucketFile = {
  exists(): Promise<[boolean]>;
  getMetadata(): Promise<[{ generation?: string | number; size?: string | number; contentType?: string }]>;
  download(options: { start: number; end: number }): Promise<[Buffer]>;
  getSignedUrl(config: { version: "v4"; action: "read" | "write"; expires: number; contentType?: string }): Promise<[string]>;
  copy(
    destination: BucketFile,
    options: { preconditionOpts: { ifGenerationMatch: number }; metadata: { contentType: string; metadata: Record<string, string> } }
  ): Promise<unknown>;
  delete(options?: { ifGenerationMatch?: number }): Promise<unknown>;
};

function file(path: string): BucketFile {
  return getAdminBucket().file(path) as unknown as BucketFile;
}

function asRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

function mapFailure(result: Extract<TransferResult, { ok: false }>): HttpsError {
  if (result.code === "denied") return new HttpsError("permission-denied", "object_denied");
  if (result.code === "not_found") return new HttpsError("not-found", "object_not_found");
  if (result.code === "conflict") return new HttpsError("aborted", "object_conflict");
  if (result.code === "expired") return new HttpsError("failed-precondition", "object_transfer_expired");
  if (result.code === "unknown") return new HttpsError("unavailable", "object_transfer_unknown");
  return new HttpsError("invalid-argument", `object_${result.code}`);
}

async function stat(path: string): Promise<ObjectStat | null> {
  const target = file(path);
  const [exists] = await target.exists();
  if (!exists) return null;
  const [meta] = await target.getMetadata();
  const size = Number(meta.size);
  if (!Number.isFinite(size)) return null;
  return { generation: String(meta.generation ?? ""), size, contentType: String(meta.contentType ?? "") };
}

function productionPorts(): OwnerObjectPorts {
  const db = getAdminDb();
  return {
    now: () => Date.now(),
    newAttemptId: () => randomBytes(16).toString("hex"),
    async readAccount(uid) {
      const snap = await db.collection("users").doc(uid).get();
      return snap.exists ? (snap.data() as { status?: unknown }) : null;
    },
    async readDeletion(uid) {
      const snap = await db.collection("deletionJobs").doc(uid).get();
      return snap.exists ? (snap.data() as { status?: unknown }) : null;
    },
    async readGrinKey(uid, objectKey) {
      const snap = await db.doc(objectKeyPath(uid, objectKey)).get();
      return snap.exists ? (snap.data() as { ownerUid?: unknown; objectKey?: unknown; state?: unknown }) : null;
    },
    async saveAttempt(attempt) {
      await db.collection("ownerObjectTransfers").doc(attempt.attemptId).set(attempt);
    },
    async readAttempt(attemptId) {
      const snap = await db.collection("ownerObjectTransfers").doc(attemptId).get();
      return snap.exists ? (snap.data() as TransferAttempt) : null;
    },
    async signUpload(stagingPath, contentType, expiresAt) {
      const [url] = await file(stagingPath).getSignedUrl({ version: "v4", action: "write", expires: expiresAt, contentType });
      return url;
    },
    async signRead(path, expiresAt) {
      const [url] = await file(path).getSignedUrl({ version: "v4", action: "read", expires: expiresAt });
      return url;
    },
    stat,
    async readPrefix(path, bytes) {
      const [data] = await file(path).download({ start: 0, end: Math.max(0, bytes - 1) });
      return new Uint8Array(data.subarray(0, bytes));
    },
    async copy(input): Promise<CopyOutcome> {
      try {
        await file(input.from).copy(file(input.to), {
          preconditionOpts: { ifGenerationMatch: input.ifGenerationMatch },
          metadata: { contentType: input.contentType, metadata: input.metadata },
        });
        const copied = await stat(input.to);
        if (!copied) return { outcome: "unknown" };
        return { outcome: "copied", generation: copied.generation, size: copied.size };
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? Number((error as { code: unknown }).code) : 0;
        if (code === 412) return { outcome: "precondition" };
        return { outcome: "unknown" };
      }
    },
    async remove(path, ifGenerationMatch) {
      try {
        await file(path).delete(ifGenerationMatch ? { ifGenerationMatch: Number(ifGenerationMatch) } : undefined);
        return "removed";
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? Number((error as { code: unknown }).code) : 0;
        if (code === 404) return "missing";
        if (code === 412) return "conflict";
        return "unknown";
      }
    },
  };
}

export async function handleOwnerObjectTransfer(request: CallableRequest, ports: OwnerObjectPorts = productionPorts()): Promise<TransferResult> {
  const admitted = await assertAdmittedCallableUser(request);
  const uid = admitted?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");
  const data = asRecord(request.data);
  const operation = data.operation;
  if (operation !== "begin" && operation !== "commit" && operation !== "abort" && operation !== "read" && operation !== "delete") {
    throw new HttpsError("invalid-argument", "object_invalid");
  }
  const payload: TransferRequest = {
    uid,
    operation,
    path: typeof data.path === "string" ? data.path : undefined,
    contentType: typeof data.contentType === "string" ? data.contentType : undefined,
    attemptId: typeof data.attemptId === "string" ? data.attemptId : undefined,
    generation: typeof data.generation === "string" ? data.generation : undefined,
    payloadUid: typeof data.uid === "string" ? data.uid : undefined,
  };
  const result = await performOwnerObjectTransfer(payload, ports);
  if (!result.ok) throw mapFailure(result);
  return result;
}

export const ownerObjectTransfer = onCall(
  { region: "asia-south1", timeoutSeconds: 60, memory: "256MiB" },
  async (request) => handleOwnerObjectTransfer(request)
);
