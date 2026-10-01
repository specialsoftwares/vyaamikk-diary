/**
 * INJECTED GrinEvidenceUploadPort for G3 outbox (src/services/grin/outbox/ports.ts).
 * Wraps GoodsEvidenceStorageAdapter. Client hash is a claim; trusted verify hashes stored bytes.
 * Not a live callable. Does not mint public download URLs. Does not encode whole files as base64.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  isAllowedOriginalMime,
  isSha256Hex,
  isWave1OriginalCategory,
  type AllowedOriginalMime,
  type Wave1OriginalCategory,
} from "../../src/goodsEvidence/evidence";
import type { GrinEvidenceUploadPort, GrinEvidenceUploadResult } from "../../src/services/grin/outbox/ports";
import { GoodsEvidenceStorageAdapter } from "./adapter";
import { isRetryable } from "./retry";
import type { G2BlobStore, G2Deny, G2LifecycleResult, G2ReserveResult } from "./types";

export type GrinEvidencePort = GrinEvidenceUploadPort & { portKind: "INJECTED" };

export type GrinEvidenceUploadInput = Parameters<GrinEvidenceUploadPort["upload"]>[0];

export type InjectedGrinEvidencePortDeps = {
  adapter: GoodsEvidenceStorageAdapter;
  blobs: G2BlobStore;
  /** Host file reader. Default is Node readFile of localPath — not a Storage download URL. */
  readLocalFile?: (localPath: string) => Promise<Uint8Array>;
  /**
   * Outbox upload input does not carry category. Hosts may inject one.
   * Default is invoice.
   */
  originalCategory?: Wave1OriginalCategory | ((input: GrinEvidenceUploadInput, bytes: Uint8Array) => Wave1OriginalCategory);
};

const PERMANENT_DENY = new Set<G2Deny["code"]>(["forbidden", "policy_denied", "invalid", "integrity"]);

function claimSha256(claimed: string | null, bytes: Uint8Array): string {
  if (claimed && isSha256Hex(claimed.toLowerCase())) return claimed.toLowerCase();
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

function fail(retryable: boolean, generation: string | null = null): GrinEvidenceUploadResult {
  return { ok: false, originalDurable: false, generation, retryable };
}

function mapDeny(denied: G2Deny, generation: string | null = null): GrinEvidenceUploadResult {
  if (denied.code === "unauthenticated" || denied.code === "not_found") {
    return fail(true, generation);
  }
  if (PERMANENT_DENY.has(denied.code)) return fail(false, generation);
  return fail(true, generation);
}

function mapVerified(result: G2LifecycleResult): GrinEvidenceUploadResult {
  if (!result.ok) return mapDeny(result);
  if (result.state === "verified" || result.state === "linked") {
    const generation = result.verified?.generation ?? null;
    if (generation) return { ok: true, originalDurable: true, generation, retryable: false };
    return fail(true, null);
  }
  if (result.state === "rejected") {
    return fail(false, result.verified?.generation ?? null);
  }
  return fail(true, result.verified?.generation ?? null);
}

async function defaultReadLocalFile(localPath: string): Promise<Uint8Array> {
  const buf = await readFile(localPath);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function resolveCategory(
  input: GrinEvidenceUploadInput,
  bytes: Uint8Array,
  originalCategory: InjectedGrinEvidencePortDeps["originalCategory"]
): Wave1OriginalCategory {
  if (typeof originalCategory === "function") {
    const resolved = originalCategory(input, bytes);
    return isWave1OriginalCategory(resolved) ? resolved : "invoice";
  }
  if (originalCategory && isWave1OriginalCategory(originalCategory)) return originalCategory;
  return "invoice";
}

export function createInjectedGrinEvidencePort(deps: InjectedGrinEvidencePortDeps): GrinEvidencePort {
  const readLocalFile = deps.readLocalFile ?? defaultReadLocalFile;
  const port: GrinEvidencePort = {
    portKind: "INJECTED",
    async upload(input) {
      if (input.role === "thumbnail" || input.role === "metadata") {
        return uploadDerivative(deps.adapter, deps.blobs, readLocalFile, input);
      }
      return uploadOriginal(deps, readLocalFile, input);
    },
  };
  return port;
}

async function uploadDerivative(
  adapter: GoodsEvidenceStorageAdapter,
  blobs: G2BlobStore,
  readLocalFile: (localPath: string) => Promise<Uint8Array>,
  input: GrinEvidenceUploadInput
): Promise<GrinEvidenceUploadResult> {
  let bytes: Uint8Array;
  try {
    bytes = await readLocalFile(input.localPath);
  } catch {
    return fail(true);
  }
  const kind = input.role === "thumbnail" ? "thumbnail" : "preview";
  try {
    const reserved = await adapter.reserveDerivative(
      { uid: input.uid },
      { evidenceId: input.evidenceId, ledgerId: input.ledgerId, kind }
    );
    if (!reserved.ok) {
      return mapDeny(reserved);
    }
    const mime = sniffOriginalMime(bytes, input.localPath) ?? "image/jpeg";
    const put = await blobs.putIfAbsent(reserved.storagePath, bytes, mime);
    const generation = put.ok ? put.generation : null;
    return { ok: put.ok, originalDurable: false, generation, retryable: !put.ok };
  } catch (err) {
    return fail(isRetryable(err) || true);
  }
}

async function uploadOriginal(
  deps: InjectedGrinEvidencePortDeps,
  readLocalFile: (localPath: string) => Promise<Uint8Array>,
  input: GrinEvidenceUploadInput
): Promise<GrinEvidenceUploadResult> {
  let bytes: Uint8Array;
  try {
    bytes = await readLocalFile(input.localPath);
  } catch {
    return fail(true);
  }
  const mime = sniffOriginalMime(bytes, input.localPath);
  if (!mime || !isAllowedOriginalMime(mime)) return fail(false);
  const category = resolveCategory(input, bytes, deps.originalCategory);
  const claimedSha256 = claimSha256(input.claimedSha256, bytes);
  const caller = { uid: input.uid };
  const lifecycle = { evidenceId: input.evidenceId, ledgerId: input.ledgerId };
  try {
    const existing = await deps.adapter.getRecord(caller, lifecycle);
    if (!existing.ok) {
      if (existing.code !== "not_found") return mapDeny(existing);
      return driveFromReserve(deps, input, caller, lifecycle, bytes, mime, category, claimedSha256);
    }
    if (existing.state === "verified" || existing.state === "linked") {
      return mapVerified(existing);
    }
    if (existing.state === "rejected") return fail(false);
    return driveFromExisting(deps, input, caller, lifecycle, bytes, mime, category, claimedSha256, existing);
  } catch (err) {
    return fail(isRetryable(err) || true);
  }
}

async function driveFromReserve(
  deps: InjectedGrinEvidencePortDeps,
  input: GrinEvidenceUploadInput,
  caller: { uid: string },
  lifecycle: { evidenceId: string; ledgerId: string },
  bytes: Uint8Array,
  mime: AllowedOriginalMime,
  category: Wave1OriginalCategory,
  claimedSha256: string
): Promise<GrinEvidenceUploadResult> {
  const reserved = await deps.adapter.reserve(caller, {
    evidenceId: input.evidenceId,
    ledgerId: input.ledgerId,
    receiptId: input.receiptId,
    category,
    mime,
    claimedSha256,
    claimedByteSize: bytes.byteLength,
  });
  if (!reserved.ok) return mapDeny(reserved);
  return putCompleteVerify(deps, caller, lifecycle, bytes, mime, reserved);
}

async function driveFromExisting(
  deps: InjectedGrinEvidencePortDeps,
  input: GrinEvidenceUploadInput,
  caller: { uid: string },
  lifecycle: { evidenceId: string; ledgerId: string },
  bytes: Uint8Array,
  mime: AllowedOriginalMime,
  category: Wave1OriginalCategory,
  claimedSha256: string,
  existing: Extract<G2LifecycleResult, { ok: true }>
): Promise<GrinEvidenceUploadResult> {
  if (existing.state === "orphan_pending_review") {
    const recovered = await deps.adapter.recoverOrphan(caller, lifecycle);
    return mapVerified(await finishVerify(deps.adapter, caller, lifecycle, recovered));
  }
  if (existing.state === "uploaded_unverified") {
    return mapVerified(await finishVerify(deps.adapter, caller, lifecycle, existing));
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
  if (!reserved.ok) return mapDeny(reserved);
  return putCompleteVerify(deps, caller, lifecycle, bytes, mime, reserved);
}

async function putCompleteVerify(
  deps: InjectedGrinEvidencePortDeps,
  caller: { uid: string },
  lifecycle: { evidenceId: string; ledgerId: string },
  bytes: Uint8Array,
  mime: AllowedOriginalMime,
  reserved: Extract<G2ReserveResult, { ok: true }>
): Promise<GrinEvidenceUploadResult> {
  const began = await deps.adapter.beginUpload(caller, lifecycle);
  if (!began.ok) return mapDeny(began);
  await deps.blobs.putIfAbsent(reserved.storagePath, bytes, mime);
  const completed = await deps.adapter.completeUpload(caller, lifecycle);
  if (!completed.ok) {
    if (completed.code === "not_found") {
      const recovered = await deps.adapter.recoverOrphan(caller, lifecycle);
      return mapVerified(await finishVerify(deps.adapter, caller, lifecycle, recovered));
    }
    return mapDeny(completed);
  }
  if (completed.state === "rejected") return fail(false, completed.verified?.generation ?? null);
  return mapVerified(await finishVerify(deps.adapter, caller, lifecycle, completed));
}

async function finishVerify(
  adapter: GoodsEvidenceStorageAdapter,
  caller: { uid: string },
  lifecycle: { evidenceId: string; ledgerId: string },
  prior: G2LifecycleResult
): Promise<G2LifecycleResult> {
  if (!prior.ok) return prior;
  if (prior.state === "verified" || prior.state === "linked" || prior.state === "rejected") return prior;
  return adapter.verify(caller, lifecycle);
}
