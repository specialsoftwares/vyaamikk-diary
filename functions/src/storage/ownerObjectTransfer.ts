/**
 * Authenticated owner-object transfer.
 *
 * The signed-in uid comes from the verified callable credential. A payload uid
 * is never the owner. A signed URL is only a create-once transport ticket for
 * one staging generation. It is not a grant, and a 60-second read URL stays
 * usable until it expires; it is not revoked when the session ends.
 *
 * Firestore and Storage are not one transaction. Ordering for commit:
 * 1. Claim `validating` in a transaction. Abort can still win from this state.
 * 2. Hash and sniff exactly one staging generation.
 * 3. If that generation set changes, stop. Do not publish a replacement.
 * 4. Claim `publishing` with the generation and the full-content hash.
 *    Abort no longer applies. A later abort is a conflict, not a success
 *    that commit is allowed to overwrite.
 * 5. Recheck session cutoff, restore closure, account, deletion, and any
 *    GRIN reservation.
 * 6. Copy that generation only, destination ifGenerationMatch "0".
 * 7. Recheck the same authority. If it failed, delete only the generation
 *    this attempt just wrote.
 * 8. Record `committed` only while the publication claim still matches.
 * An unknown copy leaves the attempt `publishing`. The same attempt id is
 * retried. A destination generation is accepted only when a generation-bound
 * read carries this attempt id and the full-content hash. An unversioned
 * stat is not identity, and equal size plus a shared prefix is not identity.
 *
 * Generic read and delete do not serve GRIN originals. New GRIN bytes still
 * require the production reservation, ledger, receipt, and new-command
 * admission. Retained GRIN reads stay on the GRIN lifecycle.
 */

import { documentIdError } from "../goodsEvidence/g2/ids";
import { storagePathShapeError } from "../goodsEvidence/evidence";

export const OBJECT_TRANSFER_UPLOAD_TTL_MS = 120_000;
export const OBJECT_TRANSFER_READ_TTL_MS = 60_000;
export const OBJECT_TRANSFER_CREATE_HEADER = "x-goog-if-generation-match";
export const OBJECT_TRANSFER_CREATE_HEADER_VALUE = "0";
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

export type TransferAttemptStatus =
  | "open"
  | "validating"
  | "publishing"
  | "committed"
  | "aborted"
  | "failed"
  | "expired";

export type GrinTransferScope = {
  ledgerId: string;
  receiptId: string;
  evidenceId: string;
};

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
  publicationClaim: string | null;
  stagingGeneration: string | null;
  contentSha256: string | null;
  contentType: string | null;
  publishedGeneration: string | null;
  publishedSize: number | null;
  grin: GrinTransferScope | null;
};

export type StoredGeneration = {
  generation: string;
  size: number;
  contentType: string;
  metadata: Record<string, string>;
};

export type CopyGenerationResult =
  | { outcome: "copied"; generation: string; size: number }
  | { outcome: "precondition" }
  | { outcome: "unknown" };

export type AttemptTransitionResult =
  | { applied: true; attempt: TransferAttempt }
  | { applied: false; attempt: TransferAttempt | null };

export type OwnerObjectPorts = {
  now: () => number;
  newAttemptId: () => string;
  newClaim: () => string;
  admitSession: () => Promise<boolean>;
  admitRestore: () => Promise<boolean>;
  readAccount: (uid: string) => Promise<{ status?: unknown } | null>;
  readDeletion: (uid: string) => Promise<{ status?: unknown } | null>;
  authorizeGrin: (attempt: TransferAttempt) => Promise<boolean>;
  createAttempt: (attempt: TransferAttempt) => Promise<"created" | "exists">;
  readAttempt: (attemptId: string) => Promise<TransferAttempt | null>;
  transition: (
    attemptId: string,
    from: TransferAttemptStatus[],
    expectedClaim: string | null,
    next: (current: TransferAttempt) => TransferAttempt
  ) => Promise<AttemptTransitionResult>;
  signUpload: (
    stagingPath: string,
    contentType: string,
    expiresAt: number
  ) => Promise<{ url: string; requiredHeaders: Record<string, string> }>;
  signRead: (path: string, generation: string, expiresAt: number) => Promise<string>;
  listGenerations: (path: string) => Promise<StoredGeneration[]>;
  readGeneration: (path: string, generation: string) => Promise<StoredGeneration | null>;
  readBytes: (path: string, generation: string, length: number) => Promise<Uint8Array | null>;
  hashGeneration: (path: string, generation: string, maxBytes: number) => Promise<string | null>;
  copyGeneration: (input: {
    from: string;
    fromGeneration: string;
    to: string;
    ifGenerationMatch: string;
    contentType: string;
    metadata: Record<string, string>;
  }) => Promise<CopyGenerationResult>;
  removeGeneration: (path: string, generation: string) => Promise<"removed" | "missing" | "conflict" | "unknown">;
};

export type TransferRequest = {
  uid: string;
  operation: "begin" | "commit" | "abort" | "read" | "delete";
  path?: string;
  contentType?: string;
  attemptId?: string;
  generation?: string;
  payloadUid?: string;
  grin?: GrinTransferScope | null;
};

export type TransferFailureCode =
  | "invalid"
  | "denied"
  | "not_found"
  | "conflict"
  | "expired"
  | "unknown"
  | "too_large"
  | "type";

export type TransferResult =
  | {
      ok: true;
      operation: "begin";
      attemptId: string;
      uploadUrl: string;
      expiresAt: number;
      stagingPath: string;
      requiredHeaders: Record<string, string>;
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
  | { ok: false; code: TransferFailureCode; retryable: boolean };

export type GrinUploadAuthorityInput = {
  uid: string;
  ledgerId: string;
  receiptId: string;
  evidenceId: string;
  objectKey: string;
  storagePath: string;
  user: Record<string, unknown> | null;
  ledger: Record<string, unknown> | null;
  admission: Record<string, unknown> | null;
  receiptExists: boolean;
  evidence: Record<string, unknown> | null;
  objectKeyDoc: Record<string, unknown> | null;
};

const CREATE_HEADERS = {
  [OBJECT_TRANSFER_CREATE_HEADER]: OBJECT_TRANSFER_CREATE_HEADER_VALUE,
};

function fail(code: TransferFailureCode, retryable = false): TransferResult {
  return { ok: false, code, retryable };
}

function isAttempt(value: TransferAttempt | TransferResult): value is TransferAttempt {
  return "status" in value;
}

function generationOrder(a: string, b: string): number {
  if (/^[0-9]+$/.test(a) && /^[0-9]+$/.test(b)) {
    const left = BigInt(a);
    const right = BigInt(b);
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
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

/**
 * New-command GRIN upload authority. This is the upload gate, not a retained
 * read. `newCommands: deny` refuses the upload even when an older object exists.
 */
export function evaluateGrinUploadAuthority(input: GrinUploadAuthorityInput): boolean {
  if (documentIdError("ledgerId", input.ledgerId) || documentIdError("receiptId", input.receiptId) || documentIdError("evidenceId", input.evidenceId)) {
    return false;
  }
  if (!input.user || (input.user.status ?? "active") !== "active") return false;
  if (!input.ledger || input.ledger.ownerUid !== input.uid || input.ledger.status !== "active") return false;
  const policy = input.admission;
  if (!policy || policy.schemaVersion !== 1) return false;
  if (policy.newCommands !== "allow") return false;
  if (policy.reconciliation !== "allow" && policy.reconciliation !== "deny") return false;
  if (!input.receiptExists) return false;
  const evidence = input.evidence;
  if (!evidence) return false;
  if (evidence.ownerUid !== input.uid) return false;
  if (evidence.ledgerId !== input.ledgerId || evidence.receiptId !== input.receiptId || evidence.evidenceId !== input.evidenceId) {
    return false;
  }
  if (evidence.objectKey !== input.objectKey || evidence.storagePath !== input.storagePath) return false;
  if (evidence.state !== "reserved" && evidence.state !== "uploading") return false;
  const mapping = input.objectKeyDoc;
  if (!mapping || mapping.schemaVersion !== 1) return false;
  if (mapping.objectKey !== input.objectKey || mapping.evidenceId !== input.evidenceId) return false;
  if (mapping.ledgerId !== input.ledgerId || mapping.receiptId !== input.receiptId) return false;
  if (mapping.ownerUid != null && mapping.ownerUid !== input.uid) return false;
  if (mapping.state != null && mapping.state !== "reserved" && mapping.state !== "uploading") return false;
  return true;
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

async function publicationAllowed(attempt: TransferAttempt, ports: OwnerObjectPorts): Promise<boolean> {
  if (!(await ports.admitSession()) || !(await ports.admitRestore())) return false;
  if (!(await writeAllowed(attempt.uid, ports))) return false;
  if (attempt.objectClass === "grin_original" && !(await ports.authorizeGrin(attempt))) return false;
  return true;
}

function stagingPathFor(uid: string, attemptId: string): string {
  return `users/${uid}/.objectTransfer/${attemptId}`;
}

function committedResult(attempt: TransferAttempt): TransferResult {
  if (!attempt.publishedGeneration || attempt.publishedSize == null || !attempt.contentType) return fail("unknown", true);
  return {
    ok: true,
    operation: "commit",
    path: attempt.path,
    generation: attempt.publishedGeneration,
    size: attempt.publishedSize,
    contentType: attempt.contentType,
  };
}

async function deleteGenerations(path: string, generations: string[], ports: OwnerObjectPorts): Promise<void> {
  for (const generation of generations) {
    await ports.removeGeneration(path, generation);
  }
}

async function markFailed(attempt: TransferAttempt, ports: OwnerObjectPorts): Promise<void> {
  if (!attempt.publicationClaim) return;
  await ports.transition(attempt.attemptId, ["validating", "publishing"], attempt.publicationClaim, (current) => ({
    ...current,
    status: "failed",
    publicationClaim: null,
  }));
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

function grinScopeError(scope: GrinTransferScope | null | undefined): boolean {
  if (!scope) return true;
  return Boolean(
    documentIdError("ledgerId", scope.ledgerId) ||
      documentIdError("receiptId", scope.receiptId) ||
      documentIdError("evidenceId", scope.evidenceId)
  );
}

async function begin(request: TransferRequest, ports: OwnerObjectPorts): Promise<TransferResult> {
  const object = classifyOwnedObjectPath(request.uid, request.path ?? "");
  const declared = String(request.contentType ?? "");
  if (!object || !declared || declared.length > 128) return fail("invalid");
  if (object.objectClass === "grin_original" && grinScopeError(request.grin)) return fail("invalid");
  if (!(await ports.admitSession()) || !(await ports.admitRestore())) return fail("denied");
  if (!(await writeAllowed(request.uid, ports))) return fail("denied");
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
    publicationClaim: null,
    stagingGeneration: null,
    contentSha256: null,
    contentType: null,
    publishedGeneration: null,
    publishedSize: null,
    grin: object.objectClass === "grin_original" ? request.grin ?? null : null,
  };
  if (attempt.objectClass === "grin_original" && !(await ports.authorizeGrin(attempt))) return fail("denied");
  if ((await ports.createAttempt(attempt)) !== "created") return fail("conflict");
  const signed = await ports.signUpload(attempt.stagingPath, declared, expiresAt);
  return {
    ok: true,
    operation: "begin",
    attemptId,
    uploadUrl: signed.url,
    expiresAt,
    stagingPath: attempt.stagingPath,
    requiredHeaders: { ...CREATE_HEADERS, ...signed.requiredHeaders },
  };
}

async function loadOwnAttempt(request: TransferRequest, ports: OwnerObjectPorts): Promise<TransferAttempt | TransferResult> {
  if (!request.attemptId || !/^[0-9a-f]{32}$/.test(request.attemptId)) return fail("invalid");
  const attempt = await ports.readAttempt(request.attemptId);
  if (!attempt) return fail("not_found");
  if (attempt.uid !== request.uid) return fail("denied");
  if (attempt.stagingPath !== stagingPathFor(attempt.uid, attempt.attemptId)) return fail("denied");
  if (classifyOwnedObjectPath(attempt.uid, attempt.path)?.path !== attempt.path) return fail("denied");
  return attempt;
}

async function commit(request: TransferRequest, ports: OwnerObjectPorts): Promise<TransferResult> {
  const loaded = await loadOwnAttempt(request, ports);
  if (!isAttempt(loaded)) return loaded;
  if (loaded.status === "committed") return committedResult(loaded);
  if (loaded.status === "aborted" || loaded.status === "failed" || loaded.status === "expired") return fail("conflict");
  if (loaded.status === "publishing") return finishPublish(loaded, ports);
  if (loaded.status === "open" && loaded.expiresAt <= ports.now()) {
    await ports.transition(loaded.attemptId, ["open"], null, (current) => ({ ...current, status: "expired" }));
    const listed = await ports.listGenerations(loaded.stagingPath);
    await deleteGenerations(loaded.stagingPath, listed.map((item) => item.generation), ports);
    return fail("expired", true);
  }
  const claim = ports.newClaim();
  const claimed = await ports.transition(loaded.attemptId, [loaded.status === "validating" ? "validating" : "open"], null, (current) => ({
    ...current,
    status: "validating",
    publicationClaim: claim,
  }));
  if (!claimed.applied || !claimed.attempt) {
    const current = claimed.attempt;
    if (!current) return fail("not_found");
    if (current.status === "committed") return committedResult(current);
    if (current.status === "publishing") return finishPublish(current, ports);
    if (current.status === "aborted" || current.status === "failed" || current.status === "expired") return fail("conflict");
    return fail("unknown", true);
  }
  return validateAndPublish(claimed.attempt, ports);
}

async function validateAndPublish(attempt: TransferAttempt, ports: OwnerObjectPorts): Promise<TransferResult> {
  const listed = await ports.listGenerations(attempt.stagingPath);
  if (listed.length === 0) return fail("unknown", true);
  if (listed.length !== 1) {
    await markFailed(attempt, ports);
    await deleteGenerations(attempt.stagingPath, listed.map((item) => item.generation), ports);
    return fail("conflict");
  }
  const staging = listed[0];
  if (!staging || staging.size < 1 || staging.size > attempt.maxBytes) {
    await markFailed(attempt, ports);
    if (staging) await ports.removeGeneration(attempt.stagingPath, staging.generation);
    return fail(staging && staging.size > attempt.maxBytes ? "too_large" : "invalid");
  }
  const prefix = await ports.readBytes(attempt.stagingPath, staging.generation, 16);
  const sniffed = prefix ? sniffObjectBytes(attempt.objectClass, prefix) : null;
  if (!sniffed || (attempt.objectClass === "pdfs" && sniffed !== "application/pdf")) {
    await markFailed(attempt, ports);
    await ports.removeGeneration(attempt.stagingPath, staging.generation);
    return fail("type");
  }
  const contentSha256 = await ports.hashGeneration(attempt.stagingPath, staging.generation, attempt.maxBytes);
  if (!contentSha256) return fail("unknown", true);
  const again = await ports.listGenerations(attempt.stagingPath);
  const sameGeneration = again.length === 1 && again[0]?.generation === staging.generation;
  if (!sameGeneration) {
    await markFailed(attempt, ports);
    await ports.removeGeneration(attempt.stagingPath, staging.generation);
    return fail("conflict");
  }
  const publishing = await ports.transition(attempt.attemptId, ["validating"], attempt.publicationClaim, (current) => ({
    ...current,
    status: "publishing",
    stagingGeneration: staging.generation,
    contentSha256,
    contentType: sniffed,
  }));
  if (!publishing.applied || !publishing.attempt) {
    const current = publishing.attempt;
    if (current?.status === "committed") return committedResult(current);
    if (current?.status === "aborted") return fail("conflict");
    if (current?.status === "publishing") return finishPublish(current, ports);
    return fail("unknown", true);
  }
  return finishPublish(publishing.attempt, ports);
}

async function recoverPublished(attempt: TransferAttempt, ports: OwnerObjectPorts): Promise<{ generation: string; size: number } | null> {
  if (!attempt.contentSha256) return null;
  const listed = await ports.listGenerations(attempt.path);
  for (const item of listed) {
    if (item.metadata.vydAttempt !== attempt.attemptId || item.metadata.vydSha256 !== attempt.contentSha256) continue;
    const bound = await ports.readGeneration(attempt.path, item.generation);
    if (!bound || bound.generation !== item.generation) continue;
    if (bound.metadata.vydAttempt !== attempt.attemptId || bound.metadata.vydSha256 !== attempt.contentSha256) continue;
    if (bound.size !== item.size) continue;
    return { generation: bound.generation, size: bound.size };
  }
  return null;
}

async function finishPublish(attempt: TransferAttempt, ports: OwnerObjectPorts): Promise<TransferResult> {
  if (!attempt.publicationClaim || !attempt.stagingGeneration || !attempt.contentSha256 || !attempt.contentType) {
    return fail("unknown", true);
  }
  if (!(await publicationAllowed(attempt, ports))) {
    await markFailed(attempt, ports);
    await ports.removeGeneration(attempt.stagingPath, attempt.stagingGeneration);
    return fail("denied");
  }
  const source = await ports.readGeneration(attempt.stagingPath, attempt.stagingGeneration);
  if (!source || source.generation !== attempt.stagingGeneration) {
    await markFailed(attempt, ports);
    return fail("conflict");
  }
  const copied = await ports.copyGeneration({
    from: attempt.stagingPath,
    fromGeneration: attempt.stagingGeneration,
    to: attempt.path,
    ifGenerationMatch: OBJECT_TRANSFER_CREATE_HEADER_VALUE,
    contentType: attempt.contentType,
    metadata: {
      vydAttempt: attempt.attemptId,
      vydSha256: attempt.contentSha256,
      ...(attempt.objectClass === "grin_original" ? { vydEvidence: "pending" } : {}),
    },
  });
  if (copied.outcome === "unknown") return fail("unknown", true);
  let published: { generation: string; size: number } | null = null;
  if (copied.outcome === "copied") {
    const bound = await ports.readGeneration(attempt.path, copied.generation);
    if (
      bound &&
      bound.generation === copied.generation &&
      bound.metadata.vydAttempt === attempt.attemptId &&
      bound.metadata.vydSha256 === attempt.contentSha256
    ) {
      published = { generation: bound.generation, size: bound.size };
    } else {
      return fail("unknown", true);
    }
  } else {
    published = await recoverPublished(attempt, ports);
    if (!published) {
      await markFailed(attempt, ports);
      await ports.removeGeneration(attempt.stagingPath, attempt.stagingGeneration);
      return fail("conflict");
    }
  }
  if (!(await publicationAllowed(attempt, ports))) {
    await ports.removeGeneration(attempt.path, published.generation);
    await markFailed(attempt, ports);
    await ports.removeGeneration(attempt.stagingPath, attempt.stagingGeneration);
    return fail("denied");
  }
  const done = await ports.transition(attempt.attemptId, ["publishing"], attempt.publicationClaim, (current) => ({
    ...current,
    status: "committed",
    publishedGeneration: published.generation,
    publishedSize: published.size,
    publicationClaim: null,
  }));
  if (!done.applied || !done.attempt) {
    if (done.attempt?.status === "committed" && done.attempt.publishedGeneration === published.generation) {
      await ports.removeGeneration(attempt.stagingPath, attempt.stagingGeneration);
      return committedResult(done.attempt);
    }
    return fail("unknown", true);
  }
  await ports.removeGeneration(attempt.stagingPath, attempt.stagingGeneration);
  return committedResult(done.attempt);
}

async function abort(request: TransferRequest, ports: OwnerObjectPorts): Promise<TransferResult> {
  const loaded = await loadOwnAttempt(request, ports);
  if (!isAttempt(loaded)) return loaded;
  if (loaded.status === "aborted") return { ok: true, operation: "abort" };
  const moved = await ports.transition(loaded.attemptId, ["open", "validating"], null, (current) => ({
    ...current,
    status: "aborted",
    publicationClaim: null,
  }));
  if (!moved.applied || !moved.attempt) return fail("conflict");
  const generation = moved.attempt.stagingGeneration;
  if (generation) {
    await ports.removeGeneration(moved.attempt.stagingPath, generation);
  } else {
    const listed = await ports.listGenerations(moved.attempt.stagingPath);
    await deleteGenerations(moved.attempt.stagingPath, listed.map((item) => item.generation), ports);
  }
  return { ok: true, operation: "abort" };
}

async function read(request: TransferRequest, ports: OwnerObjectPorts): Promise<TransferResult> {
  const object = classifyOwnedObjectPath(request.uid, request.path ?? "");
  if (!object) return fail("denied");
  if (object.objectClass === "grin_original") return fail("denied");
  if (!(await ports.admitSession()) || !(await ports.admitRestore())) return fail("denied");
  const listed = await ports.listGenerations(object.path);
  const live = [...listed].sort((left, right) => generationOrder(left.generation, right.generation)).at(-1);
  if (!live) return fail("not_found");
  const bound = await ports.readGeneration(object.path, live.generation);
  if (!bound || bound.generation !== live.generation) return fail("unknown", true);
  const expiresAt = ports.now() + OBJECT_TRANSFER_READ_TTL_MS;
  const url = await ports.signRead(object.path, bound.generation, expiresAt);
  return { ok: true, operation: "read", url, contentType: bound.contentType, generation: bound.generation, expiresAt };
}

async function removeOwned(request: TransferRequest, ports: OwnerObjectPorts): Promise<TransferResult> {
  const object = classifyOwnedObjectPath(request.uid, request.path ?? "");
  if (!object || object.objectClass === "grin_original") return fail("denied");
  if (!(await ports.admitSession()) || !(await ports.admitRestore()) || !(await writeAllowed(request.uid, ports))) {
    return fail("denied");
  }
  const listed = await ports.listGenerations(object.path);
  if (listed.length === 0) return { ok: true, operation: "delete" };
  const live = [...listed].sort((left, right) => generationOrder(left.generation, right.generation)).at(-1);
  if (!live) return { ok: true, operation: "delete" };
  if (request.generation && request.generation !== live.generation) return fail("conflict");
  const generation = request.generation && request.generation.length > 0 ? request.generation : live.generation;
  const bound = await ports.readGeneration(object.path, generation);
  if (!bound || bound.generation !== generation) return fail("conflict");
  const removed = await ports.removeGeneration(object.path, generation);
  if (removed === "conflict") return fail("conflict");
  if (removed === "unknown") return fail("unknown", true);
  return { ok: true, operation: "delete" };
}
