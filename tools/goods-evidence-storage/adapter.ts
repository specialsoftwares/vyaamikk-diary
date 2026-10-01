/**
 * G2 original-evidence storage adapter (emulator / injected ports).
 *
 * Not a live callable. Do not import into the production Functions entrypoint.
 * Client hash is a claim. Trusted verification hashes stored bytes at a generation.
 * Not encrypted-backup. GRIN stays default-off.
 */

import { formatUtcIso } from "../../src/goodsEvidence/time";
import {
  buildDerivativeStoragePath,
  buildOriginalStoragePath,
  buildVerifiedEvidenceResult,
  concurrentUploadError,
  evidenceIdError,
  evidenceTransitionError,
  isAllowedOriginalMime,
  isDerivativeStorageKind,
  isPermittedEvidenceTransition,
  isWave1OriginalCategory,
  originalCountError,
  originalMimeError,
  originalRetentionError,
  originalSizeError,
  storagePathShapeError,
  trustedHashMatchesClaim,
  verifiedEvidenceResultError,
  verifiedResultsEquivalent,
  verifyOriginalChunks,
  wave1CategoryError,
  type AllowedOriginalMime,
  type ClientHashClaim,
  type TrustedStorageHash,
  type Wave1OriginalCategory,
} from "../../src/goodsEvidence/evidence";
import type { EvidenceObjectState, VerifiedEvidenceResult } from "../../src/goodsEvidence/ports";
import { nodeChunkHasher, sha256Utf8 } from "./hash";
import { documentIdError } from "./ids";
import { logG2 } from "./log";
import {
  admissionPath,
  evidenceControlPath,
  evidenceLinkPath,
  evidenceObjectPath,
  ledgerPath,
  receiptPath,
  uploadControlPath,
  uploadFlightToken,
  userPath,
} from "./paths";
import { isRetryable } from "./retry";
import type {
  AdmissionPolicy,
  EvidenceRecord,
  G2BlobStore,
  G2Clock,
  G2Deny,
  G2Firestore,
  G2Hooks,
  G2LifecycleResult,
  G2ReserveResult,
  G2Transaction,
  TrustedCaller,
} from "./types";

export { isRetryable };

const GENERIC_DENY = "denied";
const MAX_TX_ATTEMPTS = 5;
const MAX_FILE_NAME = 200;
const RESERVE_KEYS = new Set([
  "evidenceId",
  "ledgerId",
  "receiptId",
  "category",
  "mime",
  "claimedSha256",
  "claimedByteSize",
  "originalFileName",
]);
const LIFECYCLE_KEYS = new Set(["evidenceId", "ledgerId"]);
const SERVER_FIELDS = new Set([
  "objectKey",
  "storagePath",
  "generation",
  "actualSha256",
  "actualByteSize",
  "verifiedAtUtc",
  "linkedAtUtc",
  "state",
  "verifiedResult",
  "kind",
  "reservationFingerprint",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function deny(code: G2Deny["code"], detail: string): G2Deny {
  logG2("grin_g2_denied", { code });
  return { ok: false, code, detail };
}

function extraKeyError(value: Record<string, unknown>, allowed: Set<string>, label: string): string | null {
  for (const key of Object.keys(value)) {
    if (SERVER_FIELDS.has(key)) return "server-generated fields are not client authority";
    if (!allowed.has(key)) return `${label} has extra fields`;
  }
  return null;
}

function parsePolicy(data: Record<string, unknown> | undefined): AdmissionPolicy | null {
  if (!data) return null;
  if (data.schemaVersion !== 1) return null;
  if (data.newCommands !== "allow" && data.newCommands !== "deny") return null;
  if (data.reconciliation !== "allow" && data.reconciliation !== "deny") return null;
  return {
    schemaVersion: 1,
    newCommands: data.newCommands,
    reconciliation: data.reconciliation,
  };
}

function parseStringIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !item) return null;
    out.push(item);
  }
  return out;
}

function parseRecord(data: Record<string, unknown> | undefined): EvidenceRecord | null {
  if (!data) return null;
  if (data.schemaVersion !== 1) return null;
  if (data.kind !== "original") return null;
  if (typeof data.evidenceId !== "string") return null;
  if (typeof data.ownerUid !== "string") return null;
  if (typeof data.ledgerId !== "string") return null;
  if (typeof data.receiptId !== "string") return null;
  if (typeof data.category !== "string") return null;
  if (typeof data.mime !== "string") return null;
  if (typeof data.objectKey !== "string") return null;
  if (typeof data.storagePath !== "string") return null;
  if (typeof data.state !== "string") return null;
  if (typeof data.claimedSha256 !== "string") return null;
  if (typeof data.claimedByteSize !== "number") return null;
  if (typeof data.reservationFingerprint !== "string") return null;
  if (typeof data.createdAtUtc !== "string" || typeof data.updatedAtUtc !== "string") return null;
  const verifiedResult =
    data.verifiedResult == null ? null : (data.verifiedResult as VerifiedEvidenceResult);
  if (data.verifiedResult != null && verifiedEvidenceResultError(data.verifiedResult)) return null;
  return {
    schemaVersion: 1,
    evidenceId: data.evidenceId,
    ownerUid: data.ownerUid,
    ledgerId: data.ledgerId,
    receiptId: data.receiptId,
    category: data.category,
    mime: data.mime,
    objectKey: data.objectKey,
    storagePath: data.storagePath,
    kind: "original",
    state: data.state as EvidenceRecord["state"],
    claimedSha256: data.claimedSha256,
    claimedByteSize: data.claimedByteSize,
    actualSha256: typeof data.actualSha256 === "string" ? data.actualSha256 : null,
    actualByteSize: typeof data.actualByteSize === "number" ? data.actualByteSize : null,
    generation: typeof data.generation === "string" ? data.generation : null,
    verifiedAtUtc: typeof data.verifiedAtUtc === "string" ? data.verifiedAtUtc : null,
    linkedAtUtc: typeof data.linkedAtUtc === "string" ? data.linkedAtUtc : null,
    originalFileName: typeof data.originalFileName === "string" ? data.originalFileName : null,
    reservationFingerprint: data.reservationFingerprint,
    verifiedResult,
    createdAtUtc: data.createdAtUtc,
    updatedAtUtc: data.updatedAtUtc,
  };
}

function claimOf(record: EvidenceRecord): ClientHashClaim {
  return { kind: "client_claim", sha256: record.claimedSha256, byteSize: record.claimedByteSize };
}

function lifecycleOk(
  record: EvidenceRecord,
  replayed: boolean,
  logEvent: "grin_g2_state" | "grin_g2_verified" | "grin_g2_linked" | "grin_g2_orphan" = "grin_g2_state"
): G2LifecycleResult {
  logG2(logEvent, { replayed, state: record.state });
  return {
    ok: true,
    replayed,
    evidenceId: record.evidenceId,
    state: record.state,
    verified: record.verifiedResult,
  };
}

export class GoodsEvidenceStorageAdapter {
  constructor(
    private readonly db: G2Firestore,
    private readonly blobs: G2BlobStore,
    private readonly clock: G2Clock,
    private readonly hooks: G2Hooks = {}
  ) {}

  async reserve(caller: TrustedCaller, input: unknown): Promise<G2ReserveResult> {
    if (!caller.uid) return deny("unauthenticated", GENERIC_DENY);
    const parsed = this.parseReserve(input);
    if (!parsed.ok) return parsed;
    const uid = caller.uid;
    return this.runAttempts(async (tx, attempt) => {
      const gated = await this.authorize(
        tx,
        uid,
        parsed.ledgerId,
        parsed.receiptId,
        attempt,
        "newCommands"
      );
      if (!gated.ok) return gated;
      const objectRef = this.db.doc(evidenceObjectPath(uid, parsed.ledgerId, parsed.evidenceId));
      const objectSnap = await tx.get(objectRef);
      const controlRef = this.db.doc(evidenceControlPath(uid, parsed.ledgerId, parsed.receiptId));
      const controlSnap = await tx.get(controlRef);
      const now = formatUtcIso(this.clock.nowMs());
      if (objectSnap.exists) {
        const record = parseRecord(objectSnap.data());
        if (!record) return deny("integrity", GENERIC_DENY);
        if (record.reservationFingerprint !== parsed.fingerprint) {
          return deny("invalid", "same evidenceId with a different reservation");
        }
        if (record.state !== "reserved" && record.state !== "uploading") {
          return deny("invalid", "evidenceId is terminal for this object; allocate a new evidenceId");
        }
        logG2("grin_g2_reserved", { replayed: true, state: record.state });
        return {
          ok: true as const,
          replayed: true,
          evidenceId: record.evidenceId,
          objectKey: record.objectKey,
          storagePath: record.storagePath,
          state: record.state,
        };
      }
      const originalIds = parseStringIds(controlSnap.data()?.originalIds);
      if (!originalIds) return deny("integrity", GENERIC_DENY);
      const countErr = originalCountError(originalIds.length);
      if (countErr) return deny("invalid", countErr);
      const objectKey = this.clock.objectKey();
      const storagePath = buildOriginalStoragePath(uid, objectKey);
      const pathErr = storagePathShapeError(storagePath);
      if (pathErr) return deny("invalid", pathErr);
      const record: EvidenceRecord = {
        schemaVersion: 1,
        evidenceId: parsed.evidenceId,
        ownerUid: uid,
        ledgerId: parsed.ledgerId,
        receiptId: parsed.receiptId,
        category: parsed.category,
        mime: parsed.mime,
        objectKey,
        storagePath,
        kind: "original",
        state: "reserved",
        claimedSha256: parsed.claimedSha256,
        claimedByteSize: parsed.claimedByteSize,
        actualSha256: null,
        actualByteSize: null,
        generation: null,
        verifiedAtUtc: null,
        linkedAtUtc: null,
        originalFileName: parsed.originalFileName,
        reservationFingerprint: parsed.fingerprint,
        verifiedResult: null,
        createdAtUtc: now,
        updatedAtUtc: now,
      };
      tx.set(objectRef, { ...record });
      tx.set(controlRef, {
        schemaVersion: 1,
        originalIds: [...originalIds, parsed.evidenceId],
      });
      logG2("grin_g2_reserved", { replayed: false, state: "reserved" });
      return {
        ok: true as const,
        replayed: false,
        evidenceId: record.evidenceId,
        objectKey: record.objectKey,
        storagePath: record.storagePath,
        state: "reserved" as const,
      };
    });
  }

  async beginUpload(caller: TrustedCaller, input: unknown): Promise<G2LifecycleResult> {
    return this.transitionFlight(caller, input, "begin");
  }

  async retryInterruptedUpload(caller: TrustedCaller, input: unknown): Promise<G2LifecycleResult> {
    return this.transitionFlight(caller, input, "retry");
  }

  async completeUpload(caller: TrustedCaller, input: unknown): Promise<G2LifecycleResult> {
    const ids = this.parseLifecycle(caller, input);
    if (!ids.ok) return ids;
    const loaded = await this.loadAuthorized(ids.uid, ids.ledgerId, ids.evidenceId);
    if (!loaded.ok) return loaded;
    if (loaded.record.state === "uploaded_unverified") {
      const stat = await this.blobs.stat(loaded.record.storagePath);
      if (stat && stat.generation === loaded.record.generation) {
        return lifecycleOk(loaded.record, true);
      }
    }
    if (loaded.record.state !== "uploading") {
      return deny("invalid", evidenceTransitionError(loaded.record.state, "uploaded_unverified") ?? GENERIC_DENY);
    }
    const stat = await this.blobs.stat(loaded.record.storagePath);
    if (!stat) {
      return deny("not_found", "stored original is missing");
    }
    if (stat.byteSize !== loaded.record.claimedByteSize) {
      return this.commitState(loaded.record, {
        state: "rejected",
        updatedAtUtc: formatUtcIso(this.clock.nowMs()),
      }, "grin_g2_state");
    }
    if (stat.contentType !== loaded.record.mime) {
      return this.commitState(loaded.record, {
        state: "rejected",
        updatedAtUtc: formatUtcIso(this.clock.nowMs()),
      }, "grin_g2_state");
    }
    return this.commitState(loaded.record, {
      state: "uploaded_unverified",
      generation: stat.generation,
      actualByteSize: stat.byteSize,
      updatedAtUtc: formatUtcIso(this.clock.nowMs()),
    }, "grin_g2_state");
  }

  async verify(caller: TrustedCaller, input: unknown): Promise<G2LifecycleResult> {
    const ids = this.parseLifecycle(caller, input);
    if (!ids.ok) return ids;
    const loaded = await this.loadAuthorized(ids.uid, ids.ledgerId, ids.evidenceId);
    if (!loaded.ok) return loaded;
    const record = loaded.record;
    if (record.state === "verified" || record.state === "linked") {
      const stat = await this.blobs.stat(record.storagePath);
      if (!stat || stat.generation !== record.generation) {
        return this.rejectReplaced(record);
      }
      if (record.verifiedResult) return lifecycleOk(record, true, "grin_g2_verified");
    }
    if (record.state !== "uploaded_unverified" && record.state !== "orphan_pending_review") {
      return deny("invalid", evidenceTransitionError(record.state, "verified") ?? GENERIC_DENY);
    }
    return this.hashAndBind(record, "verified");
  }

  async recoverOrphan(caller: TrustedCaller, input: unknown): Promise<G2LifecycleResult> {
    const ids = this.parseLifecycle(caller, input);
    if (!ids.ok) return ids;
    const loaded = await this.loadAuthorized(ids.uid, ids.ledgerId, ids.evidenceId);
    if (!loaded.ok) return loaded;
    const record = loaded.record;
    const stat = await this.blobs.stat(record.storagePath);

    if (record.state === "uploading" && stat) {
      return this.commitState(record, {
        state: "uploaded_unverified",
        generation: stat.generation,
        actualByteSize: stat.byteSize,
        updatedAtUtc: formatUtcIso(this.clock.nowMs()),
      }, "grin_g2_orphan");
    }
    if (record.state === "uploaded_unverified" && !stat) {
      return this.commitState(record, {
        state: "orphan_pending_review",
        updatedAtUtc: formatUtcIso(this.clock.nowMs()),
      }, "grin_g2_orphan");
    }
    if (record.state === "orphan_pending_review") {
      if (!stat) {
        return this.commitState(record, {
          state: "rejected",
          updatedAtUtc: formatUtcIso(this.clock.nowMs()),
        }, "grin_g2_orphan");
      }
      return this.hashAndBind(record, "verified");
    }
    if (record.state === "verified" || record.state === "linked") {
      return lifecycleOk(record, true, "grin_g2_orphan");
    }
    return deny("invalid", "evidence is not recoverable as an orphan");
  }

  async link(caller: TrustedCaller, input: unknown): Promise<G2LifecycleResult> {
    if (!caller.uid) return deny("unauthenticated", GENERIC_DENY);
    const shapeErr = verifiedEvidenceResultError(input);
    if (shapeErr) return deny("invalid", shapeErr);
    const verified = input as VerifiedEvidenceResult;
    if (verified.ownerUid !== caller.uid) return deny("forbidden", GENERIC_DENY);
    const loaded = await this.loadAuthorized(caller.uid, verified.ledgerId, verified.evidenceId);
    if (!loaded.ok) return loaded;
    const record = loaded.record;
    if (record.receiptId !== verified.receiptId) return deny("forbidden", GENERIC_DENY);
    if (record.state === "linked" && record.verifiedResult) {
      if (!verifiedResultsEquivalent(record.verifiedResult, verified)) {
        return deny("invalid", "linked evidence does not match the supplied result");
      }
      const stat = await this.blobs.stat(record.storagePath);
      if (!stat || stat.generation !== record.generation) return this.rejectReplaced(record);
      return lifecycleOk(record, true, "grin_g2_linked");
    }
    if (record.state !== "verified" && record.state !== "orphan_pending_review") {
      return deny("invalid", evidenceTransitionError(record.state, "linked") ?? GENERIC_DENY);
    }
    if (record.state === "orphan_pending_review" && !record.verifiedResult) {
      return deny("invalid", "orphan has no trusted verification to link");
    }
    if (!record.verifiedResult) return deny("invalid", "evidence is not verified");
    if (!verifiedResultsEquivalent(record.verifiedResult, verified)) {
      return deny("invalid", "VerifiedEvidenceResult does not match stored bytes");
    }
    const stat = await this.blobs.stat(record.storagePath);
    if (!stat || stat.generation !== record.generation || stat.generation !== verified.generation) {
      return this.rejectReplaced(record);
    }
    const now = formatUtcIso(this.clock.nowMs());
    return this.commitState(record, {
      state: "linked",
      linkedAtUtc: now,
      updatedAtUtc: now,
    }, "grin_g2_linked", async (tx) => {
      tx.set(this.db.doc(evidenceLinkPath(record.ownerUid, record.ledgerId, record.receiptId, record.evidenceId)), {
        schemaVersion: 1,
        evidenceId: record.evidenceId,
        storagePath: record.storagePath,
        generation: record.generation,
        rawSha256: record.actualSha256,
        byteSize: record.actualByteSize,
        linkedAtUtc: now,
      });
    });
  }

  async getRecord(caller: TrustedCaller, input: unknown): Promise<G2LifecycleResult> {
    const ids = this.parseLifecycle(caller, input);
    if (!ids.ok) return ids;
    const loaded = await this.loadAuthorized(ids.uid, ids.ledgerId, ids.evidenceId);
    if (!loaded.ok) return loaded;
    return lifecycleOk(loaded.record, false);
  }

  /**
   * Derivative paths are separate from originals. A derivative cannot assert that
   * a missing original is retained, and cannot produce VerifiedEvidenceResult.
   */
  async reserveDerivative(
    caller: TrustedCaller,
    input: unknown
  ): Promise<{ ok: true; parentEvidenceId: string; storagePath: string; kind: string } | G2Deny> {
    if (!caller.uid) return deny("unauthenticated", GENERIC_DENY);
    if (!isPlainObject(input)) return deny("invalid", "request is required");
    const evidenceErr = evidenceIdError(input.evidenceId);
    if (evidenceErr) return deny("invalid", evidenceErr);
    const ledgerErr = documentIdError("ledgerId", input.ledgerId);
    if (ledgerErr) return deny("invalid", ledgerErr);
    if (!isDerivativeStorageKind(input.kind)) return deny("invalid", "derivative kind is invalid");
    const loaded = await this.loadAuthorized(caller.uid, input.ledgerId as string, input.evidenceId as string);
    if (!loaded.ok) return loaded;
    const originalStat = await this.blobs.stat(loaded.record.storagePath);
    const retainErr = originalRetentionError(
      originalStat != null,
      loaded.record.actualSha256 != null && loaded.record.generation != null
    );
    if (retainErr) return deny("invalid", retainErr);
    const derivativeKey = this.clock.objectKey();
    const storagePath = buildDerivativeStoragePath(caller.uid, loaded.record.objectKey, derivativeKey);
    return {
      ok: true,
      parentEvidenceId: loaded.record.evidenceId,
      storagePath,
      kind: input.kind,
    };
  }

  private async hashAndBind(
    record: EvidenceRecord,
    next: "verified"
  ): Promise<G2LifecycleResult> {
    const opened = await this.blobs.open(record.storagePath);
    if (!opened) {
      const to: EvidenceObjectState =
        record.state === "orphan_pending_review" ? "rejected" : "orphan_pending_review";
      if (!isPermittedEvidenceTransition(record.state, to)) {
        return deny("not_found", "stored original is missing");
      }
      return this.commitState(record, {
        state: to,
        updatedAtUtc: formatUtcIso(this.clock.nowMs()),
      }, "grin_g2_orphan");
    }
    if (
      (record.state === "verified" || record.state === "linked") &&
      record.generation &&
      opened.generation !== record.generation
    ) {
      return this.rejectReplaced(record);
    }
    const hashed = await verifyOriginalChunks(record.claimedSha256, opened.chunks, nodeChunkHasher());
    const after = await this.blobs.stat(record.storagePath);
    if (!after || after.generation !== opened.generation) {
      return this.rejectReplaced(record);
    }
    if (!hashed.ok || hashed.byteSize !== record.claimedByteSize) {
      return this.commitState(record, {
        state: "rejected",
        actualSha256: hashed.actual,
        actualByteSize: hashed.byteSize,
        generation: opened.generation,
        updatedAtUtc: formatUtcIso(this.clock.nowMs()),
      }, "grin_g2_state");
    }
    const trusted: TrustedStorageHash = {
      kind: "trusted_storage",
      sha256: hashed.actual,
      byteSize: hashed.byteSize,
      generation: opened.generation,
    };
    if (!trustedHashMatchesClaim(claimOf(record), trusted)) {
      return this.commitState(record, {
        state: "rejected",
        actualSha256: trusted.sha256,
        actualByteSize: trusted.byteSize,
        generation: trusted.generation,
        updatedAtUtc: formatUtcIso(this.clock.nowMs()),
      }, "grin_g2_state");
    }
    if (!isWave1OriginalCategory(record.category) || !isAllowedOriginalMime(record.mime)) {
      return deny("integrity", GENERIC_DENY);
    }
    const verifiedAtUtc = formatUtcIso(this.clock.nowMs());
    const built = buildVerifiedEvidenceResult({
      evidenceId: record.evidenceId,
      ownerUid: record.ownerUid,
      ledgerId: record.ledgerId,
      receiptId: record.receiptId,
      category: record.category,
      mime: record.mime,
      trusted,
      storagePath: record.storagePath,
      verifiedAtUtc,
    });
    if ("ok" in built) return deny("integrity", GENERIC_DENY);
    const verified = built;
    return this.commitState(record, {
      state: next,
      actualSha256: trusted.sha256,
      actualByteSize: trusted.byteSize,
      generation: trusted.generation,
      verifiedAtUtc,
      verifiedResult: verified,
      updatedAtUtc: verifiedAtUtc,
    }, "grin_g2_verified");
  }

  private async rejectReplaced(record: EvidenceRecord): Promise<G2LifecycleResult> {
    if (!isPermittedEvidenceTransition(record.state, "rejected")) {
      return deny("invalid", "replacement after verification requires a new object id");
    }
    return this.commitState(record, {
      state: "rejected",
      verifiedResult: null,
      updatedAtUtc: formatUtcIso(this.clock.nowMs()),
    }, "grin_g2_state");
  }

  private async transitionFlight(
    caller: TrustedCaller,
    input: unknown,
    mode: "begin" | "retry"
  ): Promise<G2LifecycleResult> {
    const ids = this.parseLifecycle(caller, input);
    if (!ids.ok) return ids;
    return this.runAttempts(async (tx, attempt) => {
      const objectRef = this.db.doc(evidenceObjectPath(ids.uid, ids.ledgerId, ids.evidenceId));
      const objectSnap = await tx.get(objectRef);
      const uploadRef = this.db.doc(uploadControlPath(ids.uid));
      const uploadSnap = await tx.get(uploadRef);
      if (!objectSnap.exists) {
        await this.hooks.afterReads?.(attempt);
        const gatedMissing = await this.authorize(tx, ids.uid, ids.ledgerId, null, attempt, "newCommands");
        if (!gatedMissing.ok) return gatedMissing;
        return deny("not_found", "evidence object not found");
      }
      const record = parseRecord(objectSnap.data());
      if (!record) return deny("integrity", GENERIC_DENY);
      const gated = await this.authorize(tx, ids.uid, ids.ledgerId, record.receiptId, attempt, "newCommands");
      if (!gated.ok) return gated;
      const uploadingIds = parseStringIds(uploadSnap.data()?.uploadingIds);
      if (!uploadingIds) return deny("integrity", GENERIC_DENY);
      const token = uploadFlightToken(ids.ledgerId, ids.evidenceId);
      const now = formatUtcIso(this.clock.nowMs());
      if (mode === "begin") {
        if (record.state === "uploading") return lifecycleOk(record, true);
        const transErr = evidenceTransitionError(record.state, "uploading");
        if (transErr) return deny("invalid", transErr);
        if (!uploadingIds.includes(token)) {
          const concErr = concurrentUploadError(uploadingIds.length);
          if (concErr) return deny("invalid", concErr);
          uploadingIds.push(token);
        }
        tx.set(uploadRef, { schemaVersion: 1, uploadingIds });
        const next = { ...record, state: "uploading" as const, updatedAtUtc: now };
        tx.set(objectRef, { ...next });
        return lifecycleOk(next, false);
      }
      if (record.state === "reserved") return lifecycleOk(record, true);
      const transErr = evidenceTransitionError(record.state, "reserved");
      if (transErr) return deny("invalid", transErr);
      tx.set(uploadRef, {
        schemaVersion: 1,
        uploadingIds: uploadingIds.filter((id) => id !== token),
      });
      const next = { ...record, state: "reserved" as const, updatedAtUtc: now };
      tx.set(objectRef, { ...next });
      return lifecycleOk(next, false);
    });
  }

  private async commitState(
    record: EvidenceRecord,
    patch: Partial<EvidenceRecord>,
    logEvent: "grin_g2_state" | "grin_g2_verified" | "grin_g2_linked" | "grin_g2_orphan",
    extra?: (tx: G2Transaction) => Promise<void> | void
  ): Promise<G2LifecycleResult> {
    const nextState = (patch.state ?? record.state) as EvidenceObjectState;
    const transErr = evidenceTransitionError(record.state, nextState);
    if (transErr) return deny("invalid", transErr);
    return this.runAttempts(async (tx, attempt) => {
      const objectRef = this.db.doc(evidenceObjectPath(record.ownerUid, record.ledgerId, record.evidenceId));
      const objectSnap = await tx.get(objectRef);
      const uploadRef = this.db.doc(uploadControlPath(record.ownerUid));
      const uploadSnap = await tx.get(uploadRef);
      await this.hooks.afterReads?.(attempt);
      if (!objectSnap.exists) return deny("not_found", "evidence object not found");
      const current = parseRecord(objectSnap.data());
      if (!current) return deny("integrity", GENERIC_DENY);
      if (current.state === nextState && nextState !== "rejected") {
        const merged = { ...current, ...patch, state: nextState };
        if (current.generation === merged.generation && current.actualSha256 === merged.actualSha256) {
          return lifecycleOk(current, true, logEvent);
        }
      }
      const err = evidenceTransitionError(current.state, nextState);
      if (err) return deny("invalid", err);
      const uploadingIds = parseStringIds(uploadSnap.data()?.uploadingIds) ?? [];
      const token = uploadFlightToken(record.ledgerId, record.evidenceId);
      if (current.state === "uploading" && nextState !== "uploading") {
        tx.set(uploadRef, {
          schemaVersion: 1,
          uploadingIds: uploadingIds.filter((id) => id !== token),
        });
      }
      const next: EvidenceRecord = { ...current, ...patch, state: nextState };
      tx.set(objectRef, { ...next });
      await extra?.(tx);
      return lifecycleOk(next, false, logEvent);
    });
  }

  private parseReserve(input: unknown):
    | G2Deny
    | {
        ok: true;
        evidenceId: string;
        ledgerId: string;
        receiptId: string;
        category: Wave1OriginalCategory;
        mime: AllowedOriginalMime;
        claimedSha256: string;
        claimedByteSize: number;
        originalFileName: string | null;
        fingerprint: string;
      } {
    if (!isPlainObject(input)) return deny("invalid", "reserve request is required");
    const extra = extraKeyError(input, RESERVE_KEYS, "reserve request");
    if (extra) return deny("invalid", extra);
    const evidenceErr = evidenceIdError(input.evidenceId);
    if (evidenceErr) return deny("invalid", evidenceErr);
    const ledgerErr = documentIdError("ledgerId", input.ledgerId);
    if (ledgerErr) return deny("invalid", ledgerErr);
    const receiptErr = documentIdError("receiptId", input.receiptId);
    if (receiptErr) return deny("invalid", receiptErr);
    const catErr = wave1CategoryError(input.category);
    if (catErr) return deny("invalid", catErr);
    const mimeErr = originalMimeError(input.mime);
    if (mimeErr) return deny("invalid", mimeErr);
    const mime = input.mime as AllowedOriginalMime;
    const sizeErr = originalSizeError(mime, input.claimedByteSize);
    if (sizeErr) return deny("invalid", sizeErr);
    if (typeof input.claimedSha256 !== "string" || !/^[a-f0-9]{64}$/.test(input.claimedSha256)) {
      return deny("invalid", "client hash claim is not SHA-256");
    }
    let originalFileName: string | null = null;
    if (input.originalFileName != null) {
      if (typeof input.originalFileName !== "string" || input.originalFileName.length > MAX_FILE_NAME) {
        return deny("invalid", "original file name is invalid");
      }
      originalFileName = input.originalFileName;
    }
    const evidenceId = input.evidenceId as string;
    const ledgerId = input.ledgerId as string;
    const receiptId = input.receiptId as string;
    const category = input.category as Wave1OriginalCategory;
    const claimedSha256 = input.claimedSha256;
    const claimedByteSize = input.claimedByteSize as number;
    const fingerprint = sha256Utf8(
      JSON.stringify({
        category,
        claimedByteSize,
        claimedSha256,
        evidenceId,
        ledgerId,
        mime,
        receiptId,
      })
    );
    return {
      ok: true,
      evidenceId,
      ledgerId,
      receiptId,
      category,
      mime,
      claimedSha256,
      claimedByteSize,
      originalFileName,
      fingerprint,
    };
  }

  private parseLifecycle(
    caller: TrustedCaller,
    input: unknown
  ): G2Deny | { ok: true; uid: string; ledgerId: string; evidenceId: string } {
    if (!caller.uid) return deny("unauthenticated", GENERIC_DENY);
    if (!isPlainObject(input)) return deny("invalid", "request is required");
    const extra = extraKeyError(input, LIFECYCLE_KEYS, "request");
    if (extra) return deny("invalid", extra);
    const evidenceErr = evidenceIdError(input.evidenceId);
    if (evidenceErr) return deny("invalid", evidenceErr);
    const ledgerErr = documentIdError("ledgerId", input.ledgerId);
    if (ledgerErr) return deny("invalid", ledgerErr);
    return { ok: true, uid: caller.uid, ledgerId: input.ledgerId as string, evidenceId: input.evidenceId as string };
  }

  private async loadAuthorized(
    uid: string,
    ledgerId: string,
    evidenceId: string
  ): Promise<G2Deny | { ok: true; record: EvidenceRecord }> {
    return this.runAttempts(async (tx, attempt) => {
      const objectRef = this.db.doc(evidenceObjectPath(uid, ledgerId, evidenceId));
      const objectSnap = await tx.get(objectRef);
      if (!objectSnap.exists) {
        const gatedMissing = await this.authorize(tx, uid, ledgerId, null, attempt, "newCommands");
        if (!gatedMissing.ok) return gatedMissing;
        return deny("not_found", "evidence object not found");
      }
      const record = parseRecord(objectSnap.data());
      if (!record) return deny("integrity", GENERIC_DENY);
      const gated = await this.authorize(tx, uid, ledgerId, record.receiptId, attempt, "newCommands");
      if (!gated.ok) return gated;
      return { ok: true as const, record };
    });
  }

  private async authorize(
    tx: G2Transaction,
    uid: string,
    ledgerId: string,
    receiptId: string | null,
    attempt: number,
    policyKey: "newCommands" | "reconciliation"
  ): Promise<{ ok: true; policy: AdmissionPolicy } | G2Deny> {
    const userSnap = await tx.get(this.db.doc(userPath(uid)));
    const ledgerSnap = await tx.get(this.db.doc(ledgerPath(uid, ledgerId)));
    const admissionSnap = await tx.get(this.db.doc(admissionPath(uid)));
    const receiptSnap = receiptId
      ? await tx.get(this.db.doc(receiptPath(uid, ledgerId, receiptId)))
      : null;
    await this.hooks.afterReads?.(attempt);
    if (!userSnap.exists) return deny("forbidden", GENERIC_DENY);
    const user = userSnap.data();
    if ((user?.status ?? "active") !== "active") return deny("forbidden", GENERIC_DENY);
    if (!ledgerSnap.exists) return deny("forbidden", GENERIC_DENY);
    const ledger = ledgerSnap.data();
    if (ledger?.ownerUid !== uid) return deny("forbidden", GENERIC_DENY);
    if (ledger?.status !== "active") return deny("forbidden", GENERIC_DENY);
    const policy = parsePolicy(admissionSnap.data());
    if (!policy) return deny("policy_denied", GENERIC_DENY);
    if (policy[policyKey] !== "allow") return deny("policy_denied", GENERIC_DENY);
    if (receiptId && receiptSnap && !receiptSnap.exists) return deny("not_found", "receipt not found");
    return { ok: true, policy };
  }

  private async runAttempts<T>(fn: (tx: G2Transaction, attempt: number) => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_TX_ATTEMPTS; attempt++) {
      try {
        let captured!: T;
        await this.db.runTransaction(
          async (tx) => {
            captured = await fn(tx, attempt);
            return captured;
          },
          { maxAttempts: 1 }
        );
        return captured;
      } catch (err) {
        lastErr = err;
        if (!isRetryable(err) || attempt === MAX_TX_ATTEMPTS) throw err;
      }
    }
    throw lastErr;
  }
}
