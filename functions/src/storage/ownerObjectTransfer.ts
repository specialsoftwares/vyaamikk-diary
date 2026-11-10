/**
 * Authenticated owner-object transfer.
 *
 * The signed-in uid comes from the verified callable credential. A payload uid
 * is never the owner. Storage Rules are not the authority for this path:
 * a short-lived signed URL is only a transport ticket for one staging object.
 * Commit, read, and delete recheck the account, deletion job, and, for a GRIN
 * original, the server-written object-key reservation.
 *
 * A 60-second read ticket can still be used after a later revocation until it
 * expires. Commit and delete do not trust that ticket. Firestore and Storage
 * are not one transaction: an uncertain copy stays retryable and is not success.
 * Cleanup deletes only that attempt's staging object, never the published path
 * and never another attempt.
 */

import { storagePathShapeError } from "../goodsEvidence/evidence";

export const OBJECT_TRANSFER_UPLOAD_TTL_MS = 120_000;
export const OBJECT_TRANSFER_READ_TTL_MS = 60_000;
const IMAGE_OR_SEAL_MAX_BYTES = 10 * 1024 * 1024;
const PDF_MAX_BYTES = 15 * 1024 * 1024;
const NAME = /^[A-Za-z0-9._-]{1,128}$/;

export type OwnedObjectClass = "letterhead" | "attachments" | "pdfs" | "grin_original";

export type OwnedObjectRef = {
  objectClass: OwnedObjectClass;
  path: string;
  maxBytes: number;
  objectKey: string | null;
};

export type TransferAttemptStatus = "open" | "committed" | "aborted" | "failed" | "expired";

export type TransferAttempt = {
  attemptId: string;
  uid: string;
  path: string;
  objectClass: OwnedObjectClass;
  stagingPath: string;
  declaredType: string;
  maxBytes: number;
  status: TransferAttemptStatus;
  expiresAt: number;
  generation: string | null;
  size: number | null;
};

export type ObjectStat = {
  generation: string;
  size: number;
  contentType: string;
};

export type CopyOutcome =
  | { outcome: "copied"; generation: string; size: number }
  | { outcome: "precondition" }
  | { outcome: "unknown" };

export type OwnerObjectPorts = {
  now: () => number;
  newAttemptId: () => string;
  readAccount: (uid: string) => Promise<{ status?: unknown } | null>;
  readDeletion: (uid: string) => Promise<{ status?: unknown } | null>;
  readGrinKey: (
    uid: string,
    objectKey: string
  ) => Promise<{ ownerUid?: unknown; objectKey?: unknown; state?: unknown } | null>;
  saveAttempt: (attempt: TransferAttempt) => Promise<void>;
  readAttempt: (attemptId: string) => Promise<TransferAttempt | null>;
  signUpload: (stagingPath: string, contentType: string, expiresAt: number) => Promise<string>;
  signRead: (path: string, expiresAt: number) => Promise<string>;
  stat: (path: string) => Promise<ObjectStat | null>;
  readPrefix: (path: string, bytes: number) => Promise<Uint8Array>;
  copy: (input: {
    from: string;
    to: string;
    ifGenerationMatch: number;
    contentType: string;
    metadata: Record<string, string>;
  }) => Promise<CopyOutcome>;
  remove: (path: string, ifGenerationMatch?: string) => Promise<"removed" | "missing" | "conflict" | "unknown">;
};

export type TransferRequest = {
  uid: string;
  operation: "begin" | "commit" | "abort" | "read" | "delete";
  path?: string;
  contentType?: string;
  attemptId?: string;
  generation?: string;
  payloadUid?: string;
};

export type TransferResult =
  | {
      ok: true;
      operation: "begin";
      attemptId: string;
      uploadUrl: string;
      expiresAt: number;
      stagingPath: string;
    }
  | {
      ok: true;
      operation: "commit";
      path: string;
      generation: string;
      size: number;
      contentType: string;
    }
  | { ok: true; operation: "abort" | "delete" }
  | {
      ok: true;
      operation: "read";
      url: string;
      contentType: string;
      generation: string;
      expiresAt: number;
    }
  | { ok: false; code: "invalid" | "denied" | "not_found" | "conflict" | "expired" | "unknown" | "too_large" | "type"; retryable: boolean };

function fail(code: "invalid" | "denied" | "not_found" | "conflict" | "expired" | "unknown" | "too_large" | "type", retryable = false): TransferResult {
  return { ok: false, code, retryable };
}

function isAttempt(value: TransferAttempt | TransferResult): value is TransferAttempt {
  return "status" in value;
}

export function classifyOwnedObjectPath(uid: string, path: string): OwnedObjectRef | null {
  if (!uid || path.startsWith("/") || path.includes("\\") || path.includes("..") || path.includes("//")) return null;
  const parts = path.split("/");
  if (parts[0] !== "users" || parts[1] !== uid || parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    return null;
  }
  if (parts[2] === "letterhead" && parts.length === 4 && NAME.test(parts[3])) {
    return { objectClass: "letterhead", path, maxBytes: IMAGE_OR_SEAL_MAX_BYTES, objectKey: null };
  }
  if ((parts[2] === "attachments" || parts[2] === "pdfs") && parts.length === 5 && NAME.test(parts[3]) && NAME.test(parts[4])) {
    return {
      objectClass: parts[2],
      path,
      maxBytes: parts[2] === "pdfs" ? PDF_MAX_BYTES : IMAGE_OR_SEAL_MAX_BYTES,
      objectKey: null,
    };
  }
  if (parts[2] === "grinEvidence" && parts.length === 5 && parts[4] === "original" && storagePathShapeError(path) == null) {
    return { objectClass: "grin_original", path, maxBytes: PDF_MAX_BYTES, objectKey: parts[3] };
  }
  return null;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(bytes[start + i] ?? 0);
  return out;
}

export function sniffObjectBytes(objectClass: OwnedObjectClass, bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return objectClass === "pdfs" ? null : "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return objectClass === "pdfs" ? null : "image/jpeg";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return objectClass === "pdfs" ? null : "image/webp";
  }
  if (bytes.length >= 6 && (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")) {
    return objectClass === "pdfs" ? null : "image/gif";
  }
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === "%PDF") return "application/pdf";
  if ((objectClass === "letterhead" || objectClass === "attachments") && bytes[0] === 0x7b) {
    return "application/vnd.vyaamikk.content-seal+json";
  }
  return null;
}

function accountActive(profile: { status?: unknown } | null): boolean {
  if (!profile) return false;
  const status = profile.status == null ? "active" : String(profile.status);
  return status === "active";
}

function deletionAllows(job: { status?: unknown } | null): boolean {
  return job == null || String(job.status ?? "") !== "completed";
}

async function writeAllowed(uid: string, ports: OwnerObjectPorts): Promise<boolean> {
  return accountActive(await ports.readAccount(uid)) && deletionAllows(await ports.readDeletion(uid));
}

async function grinWritable(uid: string, objectKey: string, ports: OwnerObjectPorts): Promise<boolean> {
  const key = await ports.readGrinKey(uid, objectKey);
  if (!key || key.ownerUid !== uid || key.objectKey !== objectKey) return false;
  return key.state === "reserved" || key.state === "uploading";
}

function stagingPathFor(uid: string, attemptId: string): string {
  return `users/${uid}/.objectTransfer/${attemptId}`;
}

async function removeStaging(attempt: TransferAttempt, ports: OwnerObjectPorts): Promise<void> {
  if (attempt.stagingPath !== stagingPathFor(attempt.uid, attempt.attemptId)) return;
  await ports.remove(attempt.stagingPath);
}

export async function performOwnerObjectTransfer(
  request: TransferRequest,
  ports: OwnerObjectPorts
): Promise<TransferResult> {
  if (!request.uid || (request.payloadUid != null && request.payloadUid !== request.uid)) return fail("denied");
  if (request.operation === "begin") return begin(request, ports);
  if (request.operation === "commit") return commit(request, ports);
  if (request.operation === "abort") return abort(request, ports);
  if (request.operation === "read") return read(request, ports);
  if (request.operation === "delete") return removeOwned(request, ports);
  return fail("invalid");
}

async function begin(request: TransferRequest, ports: OwnerObjectPorts): Promise<TransferResult> {
  const object = classifyOwnedObjectPath(request.uid, request.path ?? "");
  const declared = String(request.contentType ?? "");
  if (!object || !declared || declared.length > 128) return fail("invalid");
  if (!(await writeAllowed(request.uid, ports))) return fail("denied");
  if (object.objectClass === "grin_original" && !(await grinWritable(request.uid, object.objectKey ?? "", ports))) {
    return fail("denied");
  }
  const attemptId = ports.newAttemptId();
  if (!/^[0-9a-f]{32}$/.test(attemptId)) return fail("invalid");
  const expiresAt = ports.now() + OBJECT_TRANSFER_UPLOAD_TTL_MS;
  const attempt: TransferAttempt = {
    attemptId,
    uid: request.uid,
    path: object.path,
    objectClass: object.objectClass,
    stagingPath: stagingPathFor(request.uid, attemptId),
    declaredType: declared,
    maxBytes: object.maxBytes,
    status: "open",
    expiresAt,
    generation: null,
    size: null,
  };
  await ports.saveAttempt(attempt);
  const uploadUrl = await ports.signUpload(attempt.stagingPath, declared, expiresAt);
  return { ok: true, operation: "begin", attemptId, uploadUrl, expiresAt, stagingPath: attempt.stagingPath };
}

async function loadOwnAttempt(request: TransferRequest, ports: OwnerObjectPorts): Promise<TransferAttempt | TransferResult> {
  if (!request.attemptId || !/^[0-9a-f]{32}$/.test(request.attemptId)) return fail("invalid");
  const attempt = await ports.readAttempt(request.attemptId);
  if (!attempt) return fail("not_found");
  if (attempt.uid !== request.uid) return fail("denied");
  if (attempt.stagingPath !== stagingPathFor(attempt.uid, attempt.attemptId)) return fail("denied");
  return attempt;
}

async function commit(request: TransferRequest, ports: OwnerObjectPorts): Promise<TransferResult> {
  const loaded = await loadOwnAttempt(request, ports);
  if (!isAttempt(loaded)) return loaded;
  if (loaded.status === "committed" && loaded.generation && loaded.size != null) {
    const contentType = sniffObjectBytes(loaded.objectClass, await ports.readPrefix(loaded.path, 16)) ?? loaded.declaredType;
    return { ok: true, operation: "commit", path: loaded.path, generation: loaded.generation, size: loaded.size, contentType };
  }
  if (loaded.status !== "open") return fail("conflict");
  if (loaded.expiresAt <= ports.now()) {
    await removeStaging(loaded, ports);
    await ports.saveAttempt({ ...loaded, status: "expired" });
    return fail("expired", true);
  }
  if (!(await writeAllowed(request.uid, ports))) return fail("denied");
  const object = classifyOwnedObjectPath(request.uid, loaded.path);
  if (!object) return fail("invalid");
  if (object.objectClass === "grin_original" && !(await grinWritable(request.uid, object.objectKey ?? "", ports))) {
    return fail("denied");
  }
  const staging = await ports.stat(loaded.stagingPath);
  if (!staging) return fail("unknown", true);
  if (staging.size < 1 || staging.size > loaded.maxBytes) {
    await removeStaging(loaded, ports);
    await ports.saveAttempt({ ...loaded, status: "failed" });
    return fail("too_large");
  }
  const prefix = await ports.readPrefix(loaded.stagingPath, 16);
  const sniffed = sniffObjectBytes(loaded.objectClass, prefix);
  if (!sniffed) {
    await removeStaging(loaded, ports);
    await ports.saveAttempt({ ...loaded, status: "failed" });
    return fail("type");
  }
  if (loaded.objectClass === "pdfs" && sniffed !== "application/pdf") return fail("type");
  const copied = await ports.copy({
    from: loaded.stagingPath,
    to: loaded.path,
    ifGenerationMatch: 0,
    contentType: sniffed,
    metadata: loaded.objectClass === "grin_original" ? { vydEvidence: "pending" } : {},
  });
  if (copied.outcome === "unknown") return fail("unknown", true);
  if (copied.outcome === "precondition") {
    const published = await ports.stat(loaded.path);
    const publishedPrefix = published ? await ports.readPrefix(loaded.path, 16) : new Uint8Array();
    const sameBytes = published != null && published.size === staging.size && ascii(publishedPrefix, 0, prefix.length) === ascii(prefix, 0, prefix.length);
    if (!sameBytes) {
      await removeStaging(loaded, ports);
      await ports.saveAttempt({ ...loaded, status: "failed" });
      return fail("conflict");
    }
    await ports.saveAttempt({ ...loaded, status: "committed", generation: published.generation, size: published.size });
    await removeStaging(loaded, ports);
    return { ok: true, operation: "commit", path: loaded.path, generation: published.generation, size: published.size, contentType: sniffed };
  }
  await ports.saveAttempt({ ...loaded, status: "committed", generation: copied.generation, size: copied.size });
  await removeStaging(loaded, ports);
  return { ok: true, operation: "commit", path: loaded.path, generation: copied.generation, size: copied.size, contentType: sniffed };
}

async function abort(request: TransferRequest, ports: OwnerObjectPorts): Promise<TransferResult> {
  const loaded = await loadOwnAttempt(request, ports);
  if (!isAttempt(loaded)) return loaded;
  if (loaded.status === "aborted") return { ok: true, operation: "abort" };
  if (loaded.status !== "open") return fail("conflict");
  await removeStaging(loaded, ports);
  await ports.saveAttempt({ ...loaded, status: "aborted" });
  return { ok: true, operation: "abort" };
}

async function read(request: TransferRequest, ports: OwnerObjectPorts): Promise<TransferResult> {
  const object = classifyOwnedObjectPath(request.uid, request.path ?? "");
  if (!object) return fail("denied");
  if (object.objectClass === "grin_original") {
    const key = await ports.readGrinKey(request.uid, object.objectKey ?? "");
    if (!key || key.ownerUid !== request.uid || key.objectKey !== object.objectKey) return fail("denied");
  }
  const stat = await ports.stat(object.path);
  if (!stat) return fail("not_found");
  const expiresAt = ports.now() + OBJECT_TRANSFER_READ_TTL_MS;
  const url = await ports.signRead(object.path, expiresAt);
  return { ok: true, operation: "read", url, contentType: stat.contentType, generation: stat.generation, expiresAt };
}

async function removeOwned(request: TransferRequest, ports: OwnerObjectPorts): Promise<TransferResult> {
  const object = classifyOwnedObjectPath(request.uid, request.path ?? "");
  if (!object) return fail("denied");
  if (!(await writeAllowed(request.uid, ports))) return fail("denied");
  const current = await ports.stat(object.path);
  if (!current) return { ok: true, operation: "delete" };
  const generation = request.generation && request.generation.length > 0 ? request.generation : current.generation;
  if (request.generation && request.generation !== current.generation) return fail("conflict");
  const removed = await ports.remove(object.path, generation);
  if (removed === "conflict") return fail("conflict");
  if (removed === "unknown") return fail("unknown", true);
  return { ok: true, operation: "delete" };
}
