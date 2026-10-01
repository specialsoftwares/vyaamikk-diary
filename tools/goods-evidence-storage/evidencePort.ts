/**
 * INJECTED GrinEvidenceUploadPort for G3 outbox (src/services/grin/outbox/ports.ts).
 * Wraps GoodsEvidenceStorageAdapter. Client hash is a claim; trusted verify hashes stored bytes.
 * Not a live callable. Does not mint public download URLs. Does not encode whole files as base64.
 *
 * Category is a declared assertion, not proof of document contents. Missing/invalid category fails.
 * SQLITE_HOST / INJECTED default reader is Node readFile of the whole local file — not a native
 * memory-safety claim. STORAGE_EMULATOR hashing stays on the adapter open() chunk path.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  evidenceReplayIdentityError,
  isAllowedOriginalMime,
  isRetainedOriginalState,
  isSha256Hex,
  isWave1OriginalCategory,
  originalEvidenceFromVerifiedResult,
  originalSizeError,
  reservationIdentityError,
  type AllowedOriginalMime,
  type EvidenceReplayIdentity,
  type OriginalEvidence,
  type Wave1OriginalCategory,
} from "../../src/goodsEvidence/evidence";
import type { VerifiedEvidenceResult } from "../../src/goodsEvidence/ports";
import type { GrinEvidenceUploadPort, GrinEvidenceUploadResult } from "../../src/services/grin/outbox/ports";
import { GoodsEvidenceStorageAdapter } from "./adapter";
import { isRetryable } from "./retry";
import type {
  G2BlobStore,
  G2Deny,
  G2LifecycleResult,
  G2ReserveResult,
  G2RetrieveResult,
  G2RetrieveSuccess,
} from "./types";

export type GrinEvidencePort = GrinEvidenceUploadPort & {
  portKind: "INJECTED";
  /**
   * Extra method until Team 3 adds retrieve on GrinEvidenceUploadPort.
   * Retained originals remain readable when newCommands=deny. Not a base64 download.
   */
  retrieveRetainedOriginal(input: {
    uid: string;
    ledgerId: string;
    receiptId: string;
    evidenceId: string;
  }): Promise<GrinEvidenceRetrieveResult>;
  /**
   * Extra method until Team 3 adds list+retrieve. Does not allocate evidence objects.
   */
  listRetainedOriginals(input: {
    uid: string;
    ledgerId: string;
    receiptId: string;
  }): Promise<GrinEvidenceListResult>;
  /**
   * Extra method until Team 3 adds link. Requires newCommands=allow (a mutation).
   * Upload already verify+links; this is for a stored VerifiedEvidenceResult.
   */
  linkVerified(input: { uid: string; verified: VerifiedEvidenceResult }): Promise<GrinEvidencePortResult>;
};

export type GrinEvidenceUploadInput = Parameters<GrinEvidenceUploadPort["upload"]>[0];

/**
 * Local extension until Team 3 adds `category` to the outbox upload input.
 * Do not edit src/services/grin/outbox/ports.ts from this team.
 */
export type GrinEvidencePortUploadInput = GrinEvidenceUploadInput & {
  category?: unknown;
};

/**
 * Local extension until Team 3 adds the same fields to GrinEvidenceUploadResult.
 * reservationId is null when the original is not durable (not verified+linked for this identity).
 */
export type GrinEvidencePortResult = GrinEvidenceUploadResult & {
  evidenceId: string;
  receiptId: string;
  ledgerId: string;
  category: Wave1OriginalCategory | null;
  claimedSha256: string | null;
  actualSha256: string | null;
  reservationId: string | null;
};

/**
 * Authorized retained original. `original` is set only for verified/linked.
 * File bytes are not included. SQLITE_HOST Node readFile is not used here —
 * hashing is the adapter chunked open() path.
 */
export type GrinEvidenceRetrieveResult =
  | (G2RetrieveSuccess & {
      original: OriginalEvidence | null;
      originalDurable: boolean;
    })
  | (G2Deny & { original: null; originalDurable: false });

export type GrinEvidenceListResult =
  | { ok: true; retained: Array<Extract<GrinEvidenceRetrieveResult, { ok: true }>>; unverifiable: string[] }
  | G2Deny;

export type InjectedGrinEvidencePortDeps = {
  adapter: GoodsEvidenceStorageAdapter;
  blobs: G2BlobStore;
  /**
   * SQLITE_HOST / INJECTED host file reader. Default is Node readFile of localPath.
   * That whole-file buffer is not a native memory-safety claim and not a Storage download URL.
   */
  readLocalFile?: (localPath: string) => Promise<Uint8Array>;
  /**
   * Hosts may inject a Wave 1 category until the outbox input carries one.
   * Invalid or missing values fail. There is no silent invoice default.
   */
  originalCategory?: Wave1OriginalCategory | ((input: GrinEvidencePortUploadInput, bytes: Uint8Array) => unknown);
};

const PERMANENT_DENY = new Set<G2Deny["code"]>(["forbidden", "policy_denied", "invalid", "integrity"]);

function claimSha256(claimed: string | null, bytes: Uint8Array): string {
  if (claimed && isSha256Hex(claimed.toLowerCase())) return claimed.toLowerCase();
  return createHash("sha256").update(bytes).digest("hex");
}

function localSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sniffOriginalMime(bytes: Uint8Array, localPath: string): AllowedOriginalMime | null {
  if (bytes.byteLength >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "application/pdf";
  }
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.byteLength >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  const lower = localPath.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return null;
}

function identityResult(
  input: GrinEvidencePortUploadInput,
  extras: {
    ok: boolean;
    originalDurable: boolean;
    generation: string | null;
    retryable: boolean;
    category: Wave1OriginalCategory | null;
    claimedSha256: string | null;
    actualSha256: string | null;
    reservationId: string | null;
  }
): GrinEvidencePortResult {
  return {
    ok: extras.ok,
    originalDurable: extras.originalDurable,
    generation: extras.generation,
    retryable: extras.retryable,
    evidenceId: input.evidenceId,
    receiptId: input.receiptId,
    ledgerId: input.ledgerId,
    category: extras.category,
    claimedSha256: extras.claimedSha256,
    actualSha256: extras.actualSha256,
    reservationId: extras.reservationId,
  };
}

function fail(
  input: GrinEvidencePortUploadInput,
  retryable: boolean,
  generation: string | null = null,
  category: Wave1OriginalCategory | null = null,
  claimedSha256: string | null = null,
  actualSha256: string | null = null
): GrinEvidencePortResult {
  return identityResult(input, {
    ok: false,
    originalDurable: false,
    generation,
    retryable,
    category,
    claimedSha256,
    actualSha256,
    reservationId: null,
  });
}

function mapDeny(
  input: GrinEvidencePortUploadInput,
  denied: G2Deny,
  generation: string | null = null,
  category: Wave1OriginalCategory | null = null,
  claimedSha256: string | null = null
): GrinEvidencePortResult {
  if (denied.code === "unauthenticated" || denied.code === "not_found") {
    return fail(input, true, generation, category, claimedSha256);
  }
  if (PERMANENT_DENY.has(denied.code)) return fail(input, false, generation, category, claimedSha256);
  return fail(input, true, generation, category, claimedSha256);
}

function mapLifecycle(
  input: GrinEvidencePortUploadInput,
  result: G2LifecycleResult,
  category: Wave1OriginalCategory,
  claimedSha256: string
): GrinEvidencePortResult {
  if (!result.ok) return mapDeny(input, result, null, category, claimedSha256);
  const generation = result.verified?.generation ?? null;
  const actualSha256 = result.actualSha256 ?? result.verified?.rawSha256 ?? null;
  const linked = result.state === "linked";
  const durable = linked && Boolean(generation && result.reservationId);
  return identityResult(input, {
    ok: durable,
    originalDurable: durable,
    generation: durable ? generation : generation,
    retryable: durable ? false : result.state === "rejected" ? false : true,
    category,
    claimedSha256,
    actualSha256,
    reservationId: durable ? result.reservationId : null,
  });
}

/** SQLITE_HOST / INJECTED whole-file reader. Not native streaming. */
async function defaultReadLocalFile(localPath: string): Promise<Uint8Array> {
  const buf = await readFile(localPath);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function resolveCategory(
  input: GrinEvidencePortUploadInput,
  bytes: Uint8Array,
  originalCategory: InjectedGrinEvidencePortDeps["originalCategory"]
): Wave1OriginalCategory | null {
  if (Object.prototype.hasOwnProperty.call(input, "category")) {
    return isWave1OriginalCategory(input.category) ? input.category : null;
  }
  if (typeof originalCategory === "function") {
    const resolved = originalCategory(input, bytes);
    return isWave1OriginalCategory(resolved) ? resolved : null;
  }
  if (originalCategory !== undefined) {
    return isWave1OriginalCategory(originalCategory) ? originalCategory : null;
  }
  return null;
}

export function createInjectedGrinEvidencePort(deps: InjectedGrinEvidencePortDeps): GrinEvidencePort {
  const readLocalFile = deps.readLocalFile ?? defaultReadLocalFile;
  const port: GrinEvidencePort = {
    portKind: "INJECTED",
    async upload(input) {
      const portInput = input as GrinEvidencePortUploadInput;
      if (portInput.role === "thumbnail" || portInput.role === "metadata") {
        return uploadDerivative(deps.adapter, deps.blobs, readLocalFile, portInput);
      }
      return uploadOriginal(deps, readLocalFile, portInput);
    },
    async retrieveRetainedOriginal(input) {
      const { uid, ledgerId, receiptId, evidenceId } = input;
      return mapRetrieve(await deps.adapter.retrieveOriginal({ uid }, { ledgerId, receiptId, evidenceId }));
    },
    async listRetainedOriginals(input) {
      return listAndRetrieve(deps.adapter, input);
    },
    async linkVerified(input) {
      return mapLinkVerified(deps.adapter, input.uid, input.verified);
    },
  };
  return port;
}

async function uploadDerivative(
  adapter: GoodsEvidenceStorageAdapter,
  blobs: G2BlobStore,
  readLocalFile: (localPath: string) => Promise<Uint8Array>,
  input: GrinEvidencePortUploadInput
): Promise<GrinEvidencePortResult> {
  let bytes: Uint8Array;
  try {
    bytes = await readLocalFile(input.localPath);
  } catch {
    return fail(input, true);
  }
  const kind = input.role === "thumbnail" ? "thumbnail" : "preview";
  // Team 3 owns local-original retain/release. Thumbnail success is not originalDurable
  // and must not release the local original.
  try {
    const reserved = await adapter.reserveDerivative(
      { uid: input.uid },
      { evidenceId: input.evidenceId, ledgerId: input.ledgerId, kind }
    );
    if (!reserved.ok) {
      return mapDeny(input, reserved);
    }
    const mime = sniffOriginalMime(bytes, input.localPath) ?? "image/jpeg";
    const put = await blobs.putIfAbsent(reserved.storagePath, bytes, mime);
    const generation = put.ok ? put.generation : null;
    return identityResult(input, {
      ok: put.ok,
      originalDurable: false,
      generation,
      retryable: !put.ok,
      category: null,
      claimedSha256: isSha256Hex((input.claimedSha256 ?? "").toLowerCase()) ? input.claimedSha256!.toLowerCase() : null,
      actualSha256: null,
      reservationId: null,
    });
  } catch (err) {
    return fail(input, isRetryable(err) || true);
  }
}

async function uploadOriginal(
  deps: InjectedGrinEvidencePortDeps,
  readLocalFile: (localPath: string) => Promise<Uint8Array>,
  input: GrinEvidencePortUploadInput
): Promise<GrinEvidencePortResult> {
  let bytes: Uint8Array;
  try {
    bytes = await readLocalFile(input.localPath);
  } catch {
    return fail(input, true);
  }
  const mime = sniffOriginalMime(bytes, input.localPath);
  if (!mime || !isAllowedOriginalMime(mime)) return fail(input, false);
  const sizeErr = originalSizeError(mime, bytes.byteLength);
  if (sizeErr) return fail(input, false);
  const category = resolveCategory(input, bytes, deps.originalCategory);
  if (!category) return fail(input, false);
  const claimedSha256 = claimSha256(input.claimedSha256, bytes);
  const localHash = localSha256(bytes);
  const caller = { uid: input.uid };
  const lifecycle = { evidenceId: input.evidenceId, ledgerId: input.ledgerId, receiptId: input.receiptId };
  try {
    const existing = await deps.adapter.getRecord(caller, lifecycle);
    if (!existing.ok) {
      if (existing.code !== "not_found") return mapDeny(input, existing, null, category, claimedSha256);
      return driveFromReserve(deps, input, caller, lifecycle, bytes, mime, category, claimedSha256);
    }
    const replayErr = replayIdentityError(existing, input, category, claimedSha256, bytes.byteLength, localHash);
    if (replayErr) {
      return fail(input, false, existing.verified?.generation ?? null, category, claimedSha256, existing.actualSha256);
    }
    if (existing.state === "rejected") return fail(input, false, existing.verified?.generation ?? null, category, claimedSha256);
    return driveMatching(deps, input, caller, lifecycle, bytes, mime, category, claimedSha256, existing);
  } catch (err) {
    return fail(input, isRetryable(err) || true, null, category, claimedSha256);
  }
}

function replayIdentityError(
  existing: Extract<G2LifecycleResult, { ok: true }>,
  input: GrinEvidencePortUploadInput,
  category: Wave1OriginalCategory,
  claimedSha256: string,
  claimedByteSize: number,
  localHash: string
): string | null {
  if (!isWave1OriginalCategory(existing.category)) return "stored category is not a Wave 1 original category";
  const stored: EvidenceReplayIdentity = {
    ownerUid: existing.ownerUid,
    ledgerId: existing.ledgerId,
    receiptId: existing.receiptId,
    evidenceId: existing.evidenceId,
    category: existing.category,
    claimedSha256: existing.claimedSha256,
    claimedByteSize: existing.claimedByteSize,
  };
  const claimed: EvidenceReplayIdentity = {
    ownerUid: input.uid,
    ledgerId: input.ledgerId,
    receiptId: input.receiptId,
    evidenceId: input.evidenceId,
    category,
    claimedSha256,
    claimedByteSize,
  };
  const identityErr = evidenceReplayIdentityError(stored, claimed);
  if (identityErr) return identityErr;
  const reservationErr = reservationIdentityError(existing.reservationId, existing.reservationId);
  if (reservationErr) return reservationErr;
  if (existing.actualSha256 && existing.actualSha256 !== localHash) {
    return "local bytes do not match stored original";
  }
  if (
    (existing.state === "verified" || existing.state === "linked") &&
    localHash !== existing.claimedSha256
  ) {
    return "local bytes do not match stored original";
  }
  return null;
}

async function driveFromReserve(
  deps: InjectedGrinEvidencePortDeps,
  input: GrinEvidencePortUploadInput,
  caller: { uid: string },
  lifecycle: { evidenceId: string; ledgerId: string; receiptId: string },
  bytes: Uint8Array,
  mime: AllowedOriginalMime,
  category: Wave1OriginalCategory,
  claimedSha256: string
): Promise<GrinEvidencePortResult> {
  const reserved = await deps.adapter.reserve(caller, {
    evidenceId: input.evidenceId,
    ledgerId: input.ledgerId,
    receiptId: input.receiptId,
    category,
    mime,
    claimedSha256,
    claimedByteSize: bytes.byteLength,
  });
  if (!reserved.ok) return mapDeny(input, reserved, null, category, claimedSha256);
  return putCompleteVerifyLink(deps, input, caller, lifecycle, bytes, mime, category, claimedSha256, reserved);
}

async function driveMatching(
  deps: InjectedGrinEvidencePortDeps,
  input: GrinEvidencePortUploadInput,
  caller: { uid: string },
  lifecycle: { evidenceId: string; ledgerId: string; receiptId: string },
  bytes: Uint8Array,
  mime: AllowedOriginalMime,
  category: Wave1OriginalCategory,
  claimedSha256: string,
  existing: Extract<G2LifecycleResult, { ok: true }>
): Promise<GrinEvidencePortResult> {
  if (existing.state === "orphan_pending_review") {
    const recovered = await deps.adapter.recoverOrphan(caller, lifecycle);
    return mapLifecycle(input, await finishVerifyAndLink(deps.adapter, caller, lifecycle, recovered), category, claimedSha256);
  }
  if (existing.state === "uploaded_unverified" || existing.state === "verified" || existing.state === "linked") {
    return mapLifecycle(input, await finishVerifyAndLink(deps.adapter, caller, lifecycle, existing), category, claimedSha256);
  }
  const reserved = await deps.adapter.reserve(caller, {
    evidenceId: input.evidenceId,
    ledgerId: input.ledgerId,
    receiptId: input.receiptId,
    category,
    mime,
    claimedSha256,
    claimedByteSize: bytes.byteLength,
  });
  if (!reserved.ok) return mapDeny(input, reserved, null, category, claimedSha256);
  return putCompleteVerifyLink(deps, input, caller, lifecycle, bytes, mime, category, claimedSha256, reserved);
}

async function putCompleteVerifyLink(
  deps: InjectedGrinEvidencePortDeps,
  input: GrinEvidencePortUploadInput,
  caller: { uid: string },
  lifecycle: { evidenceId: string; ledgerId: string; receiptId: string },
  bytes: Uint8Array,
  mime: AllowedOriginalMime,
  category: Wave1OriginalCategory,
  claimedSha256: string,
  reserved: Extract<G2ReserveResult, { ok: true }>
): Promise<GrinEvidencePortResult> {
  const began = await deps.adapter.beginUpload(caller, lifecycle);
  if (!began.ok) return mapDeny(input, began, null, category, claimedSha256);
  await deps.blobs.putIfAbsent(reserved.storagePath, bytes, mime);
  const completed = await deps.adapter.completeUpload(caller, lifecycle);
  if (!completed.ok) {
    if (completed.code === "not_found") {
      const recovered = await deps.adapter.recoverOrphan(caller, lifecycle);
      return mapLifecycle(input, await finishVerifyAndLink(deps.adapter, caller, lifecycle, recovered), category, claimedSha256);
    }
    return mapDeny(input, completed, null, category, claimedSha256);
  }
  if (completed.state === "rejected") {
    return fail(input, false, completed.verified?.generation ?? null, category, claimedSha256, completed.actualSha256);
  }
  return mapLifecycle(input, await finishVerifyAndLink(deps.adapter, caller, lifecycle, completed), category, claimedSha256);
}

async function finishVerifyAndLink(
  adapter: GoodsEvidenceStorageAdapter,
  caller: { uid: string },
  lifecycle: { evidenceId: string; ledgerId: string; receiptId: string },
  prior: G2LifecycleResult
): Promise<G2LifecycleResult> {
  if (!prior.ok) return prior;
  if (prior.state === "rejected") return prior;
  let current: G2LifecycleResult = prior;
  if (current.ok && current.state !== "verified" && current.state !== "linked") {
    current = await adapter.verify(caller, lifecycle);
  } else if (current.ok) {
    current = await adapter.verify(caller, lifecycle);
  }
  if (!current.ok) return current;
  if (current.state === "rejected") return current;
  if (!current.verified) return current;
  if (current.verified.receiptId !== lifecycle.receiptId) {
    return { ok: false, code: "invalid", detail: "receipt does not match stored evidence" };
  }
  return adapter.link(caller, current.verified);
}

function mapRetrieve(result: G2RetrieveResult): GrinEvidenceRetrieveResult {
  if (!result.ok) {
    return { ...result, original: null, originalDurable: false };
  }
  const verifiedOrLinked = result.state === "verified" || result.state === "linked";
  const original =
    verifiedOrLinked && result.verified
      ? originalEvidenceFromVerifiedResult(result.verified, { originalFileName: result.originalFileName })
      : null;
  return {
    ...result,
    original,
    originalDurable: verifiedOrLinked && Boolean(result.reservationId && result.generation),
  };
}

async function listAndRetrieve(
  adapter: GoodsEvidenceStorageAdapter,
  input: { uid: string; ledgerId: string; receiptId: string }
): Promise<GrinEvidenceListResult> {
  const listed = await adapter.listReceiptEvidenceIds(
    { uid: input.uid },
    { ledgerId: input.ledgerId, receiptId: input.receiptId }
  );
  if (!listed.ok) return listed;
  const retained: Array<Extract<GrinEvidenceRetrieveResult, { ok: true }>> = [];
  const unverifiable: string[] = [];
  for (const evidenceId of listed.evidenceIds) {
    const retrieved = mapRetrieve(
      await adapter.retrieveOriginal(
        { uid: input.uid },
        { evidenceId, ledgerId: input.ledgerId, receiptId: input.receiptId }
      )
    );
    if (retrieved.ok && isRetainedOriginalState(retrieved.state)) {
      retained.push(retrieved);
    } else {
      unverifiable.push(evidenceId);
    }
  }
  return { ok: true, retained, unverifiable };
}

async function mapLinkVerified(
  adapter: GoodsEvidenceStorageAdapter,
  uid: string,
  verified: VerifiedEvidenceResult
): Promise<GrinEvidencePortResult> {
  const input: GrinEvidencePortUploadInput = {
    uid,
    ledgerId: verified.ledgerId,
    receiptId: verified.receiptId,
    evidenceId: verified.evidenceId,
    role: "original",
    localPath: "",
    claimedSha256: verified.rawSha256,
    category: verified.category,
    sizeBytes: verified.byteSize,
  };
  const category = isWave1OriginalCategory(verified.category) ? verified.category : null;
  if (!category) return fail(input, false, verified.generation, null, verified.rawSha256);
  try {
    const linked = await adapter.link({ uid }, verified);
    if (!linked.ok) return mapDeny(input, linked, verified.generation, category, verified.rawSha256);
    return mapLifecycle(input, linked, category, verified.rawSha256);
  } catch (err) {
    return fail(input, isRetryable(err) || true, verified.generation, category, verified.rawSha256);
  }
}
