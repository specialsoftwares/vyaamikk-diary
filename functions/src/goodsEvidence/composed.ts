/**
 * Isolated undeployed GRIN callable composition.
 *
 * INJECTED / EMULATOR / not live deploy. Not exported from functions/src/index.ts.
 * When GRIN_GOODS_EVIDENCE_FUNCTIONS is exactly "true" and tests/emulator inject
 * GoodsEvidenceRegisterAdapter, register / reconcile / mutate / readReceipt run
 * through that adapter. Evidence reserve / beginUpload / uploadEvidence (complete +
 * stored-byte verify + G2 link) inject the same G2 adapter surface. Any other env
 * value, or an unbound adapter, is fail-closed deny. GrinUploadEvidence must not
 * succeed without hashing stored bytes; the client hash is a claim only.
 *
 * Owner identity is request.auth.uid / AuthData.uid only. Client uid, ownerUid,
 * and digest are not server authority. Digest is recomputed inside the adapter.
 */

import { grinFunctionsEnabled } from "./callables";
import { isSha256Hex, isWave1OriginalCategory } from "./evidence";
import type {
  GrinConfirmedProjection,
  GrinMutationResult,
  GrinReceiptReadResult,
  GrinReconcileResult,
  GrinRegisterResult,
  VerifiedEvidenceResult,
} from "./ports";
import { formatUtcIso } from "./time";

const GENERIC_DENY = "denied" as const;

export type GrinAuthData = {
  /** Firebase Auth uid. Never taken from the callable body. */
  uid: string;
};

/** Subset of firebase-functions v2 CallableRequest / AuthData used here. */
export type GrinCallableRequest = {
  auth?: GrinAuthData | null;
  data: unknown;
};

export type TrustedCaller = {
  uid: string | null;
};

/**
 * Structural port matching GoodsEvidenceRegisterAdapter. Defined locally so
 * this module does not import the emulator adapter (that would lift rootDir).
 */
export type ComposedGrinAdapter = {
  register(caller: TrustedCaller, envelope: unknown): Promise<GrinRegisterResult>;
  reconcile(caller: TrustedCaller, input: unknown): Promise<GrinReconcileResult>;
  amendFields(caller: TrustedCaller, envelope: unknown): Promise<GrinMutationResult>;
  recordQc(caller: TrustedCaller, envelope: unknown): Promise<GrinMutationResult>;
  dispatchReturn(caller: TrustedCaller, envelope: unknown): Promise<GrinMutationResult>;
  correctReturnDispatch(caller: TrustedCaller, envelope: unknown): Promise<GrinMutationResult>;
  voidWithReason(caller: TrustedCaller, envelope: unknown): Promise<GrinMutationResult>;
  recordEwbObservation(caller: TrustedCaller, envelope: unknown): Promise<GrinMutationResult>;
  linkVerifiedEvidence(caller: TrustedCaller, envelope: unknown): Promise<GrinMutationResult>;
  readReceipt(caller: TrustedCaller, input: unknown): Promise<GrinReceiptReadResult>;
};

export type ComposedRegisterResult = GrinRegisterResult & { confirmed?: GrinConfirmedProjection };
export type ComposedMutationResult = GrinMutationResult & { confirmed?: GrinConfirmedProjection };
export type ComposedReconcileResult = GrinReconcileResult & { confirmed?: GrinConfirmedProjection };

/**
 * Structural G2 adapter. Local so this module does not import tools/.
 * Caller identity is TrustedCaller.uid (request.auth.uid), never the body.
 */
export type ComposedEvidenceAdapter = {
  reserve(caller: TrustedCaller, input: unknown): Promise<unknown>;
  beginUpload(caller: TrustedCaller, input: unknown): Promise<unknown>;
  completeUpload(caller: TrustedCaller, input: unknown): Promise<unknown>;
  verify(caller: TrustedCaller, input: unknown): Promise<unknown>;
  link(caller: TrustedCaller, input: unknown): Promise<unknown>;
};

export type ComposedEvidenceReserveSuccess = {
  ok: true;
  replayed: boolean;
  evidenceId: string;
  objectKey: string;
  storagePath: string;
  state: "reserved" | "uploading";
};

export type ComposedEvidenceReserveResult =
  | ComposedEvidenceReserveSuccess
  | { ok: false; code: "unauthenticated" | "forbidden" | "policy_denied" | "not_found" | "invalid" | "integrity"; detail: "denied" };

export type ComposedEvidenceUploadResult = {
  ok: boolean;
  originalDurable: boolean;
  generation: string | null;
  retryable: boolean;
  ownerUid: string | null;
  mime: string | null;
  sizeBytes: number | null;
  storagePath: string | null;
  evidenceId: string | null;
  receiptId: string | null;
  ledgerId: string | null;
  category: string | null;
  claimedSha256: string | null;
  actualSha256: string | null;
  reservationId: string | null;
};

export type ComposedGrinCallables = {
  compositionKind: "UNDEPLOYED_COMPOSED";
  compositionLabel: string;
  register(request: GrinCallableRequest): Promise<ComposedRegisterResult>;
  reconcile(request: GrinCallableRequest): Promise<ComposedReconcileResult>;
  mutate(request: GrinCallableRequest): Promise<ComposedMutationResult>;
  readReceipt(request: GrinCallableRequest): Promise<GrinReceiptReadResult>;
  reserveEvidence(request: GrinCallableRequest): Promise<ComposedEvidenceReserveResult>;
  beginEvidenceUpload(request: GrinCallableRequest): Promise<ComposedEvidenceUploadResult>;
  uploadEvidence(request: GrinCallableRequest): Promise<ComposedEvidenceUploadResult>;
};

function deny<C extends "unauthenticated" | "policy_denied" | "invalid">(
  code: C
): { ok: false; code: C; detail: typeof GENERIC_DENY } {
  return { ok: false, code, detail: GENERIC_DENY };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/**
 * AuthData.uid / request.auth.uid only. A body uid is never authority.
 */
export function uidFromAuth(auth: GrinAuthData | null | undefined): string | null {
  if (auth == null) return null;
  if (typeof auth.uid !== "string" || auth.uid.length === 0) return null;
  return auth.uid;
}

/**
 * Transport may send { envelope, digest, uid }. Adapter envelopes allow
 * commandId/type/ledgerId/body only as command fields. Client digest, uid,
 * and ownerUid are stripped so they cannot become identity or stored digest.
 */
export function trustedCommandEnvelope(data: unknown): unknown {
  if (!isPlainObject(data)) return data;
  const source = isPlainObject(data.envelope) ? data.envelope : data;
  return {
    commandId: source.commandId,
    type: source.type,
    ledgerId: source.ledgerId,
    body: source.body,
  };
}

export function trustedReconcileInput(data: unknown): unknown {
  if (!isPlainObject(data)) return data;
  const source = isPlainObject(data.envelope) ? data.envelope : data;
  return {
    ledgerId: source.ledgerId,
    commandId: source.commandId,
  };
}

export function trustedReadInput(data: unknown): unknown {
  if (!isPlainObject(data)) return data;
  const source = isPlainObject(data.envelope) ? data.envelope : data;
  return {
    ledgerId: source.ledgerId,
    receiptId: source.receiptId,
  };
}

const EVIDENCE_SERVER_FIELDS = new Set([
  "objectKey",
  "storagePath",
  "generation",
  "actualSha256",
  "actualByteSize",
  "verifiedAtUtc",
  "ownerUid",
  "uid",
  "state",
]);

/**
 * Client uid / ownerUid / actual hash / generation are never authority.
 * Reserve admits declared category/mime/claim only.
 */
export function trustedEvidenceReserveInput(data: unknown): unknown {
  if (!isPlainObject(data)) return data;
  const source = isPlainObject(data.envelope) ? data.envelope : data;
  const out: Record<string, unknown> = {
    evidenceId: source.evidenceId,
    ledgerId: source.ledgerId,
    receiptId: source.receiptId,
    category: source.category,
    mime: source.mime,
    claimedSha256: source.claimedSha256,
    claimedByteSize: source.claimedByteSize,
  };
  if (typeof source.originalFileName === "string") {
    out.originalFileName = source.originalFileName;
  }
  for (const key of EVIDENCE_SERVER_FIELDS) {
    delete out[key];
  }
  return out;
}

export function trustedEvidenceLifecycleInput(data: unknown): unknown {
  if (!isPlainObject(data)) return data;
  const source = isPlainObject(data.envelope) ? data.envelope : data;
  return {
    evidenceId: source.evidenceId,
    ledgerId: source.ledgerId,
    receiptId: source.receiptId,
  };
}

function evidenceClosed(retryable: boolean): ComposedEvidenceUploadResult {
  return {
    ok: false,
    originalDurable: false,
    generation: null,
    retryable,
    ownerUid: null,
    mime: null,
    sizeBytes: null,
    storagePath: null,
    evidenceId: null,
    receiptId: null,
    ledgerId: null,
    category: null,
    claimedSha256: null,
    actualSha256: null,
    reservationId: null,
  };
}

function isEvidenceDenyCode(
  code: unknown
): code is ComposedEvidenceReserveResult extends { ok: false } ? ComposedEvidenceReserveResult["code"] : never {
  return (
    code === "unauthenticated" ||
    code === "forbidden" ||
    code === "policy_denied" ||
    code === "not_found" ||
    code === "invalid" ||
    code === "integrity"
  );
}

function parseEvidenceDeny(value: unknown): Extract<ComposedEvidenceReserveResult, { ok: false }> | null {
  if (!isPlainObject(value) || value.ok !== false) return null;
  if (!isEvidenceDenyCode(value.code)) return null;
  return { ok: false, code: value.code, detail: GENERIC_DENY };
}

export function parseEvidenceReserveResult(value: unknown): ComposedEvidenceReserveResult {
  const denied = parseEvidenceDeny(value);
  if (denied) return denied;
  if (!isPlainObject(value) || value.ok !== true) {
    return { ok: false, code: "invalid", detail: GENERIC_DENY };
  }
  if (typeof value.replayed !== "boolean") {
    return { ok: false, code: "invalid", detail: GENERIC_DENY };
  }
  if (typeof value.evidenceId !== "string" || value.evidenceId.length === 0) {
    return { ok: false, code: "invalid", detail: GENERIC_DENY };
  }
  if (typeof value.objectKey !== "string" || value.objectKey.length === 0) {
    return { ok: false, code: "invalid", detail: GENERIC_DENY };
  }
  if (typeof value.storagePath !== "string" || value.storagePath.length === 0) {
    return { ok: false, code: "invalid", detail: GENERIC_DENY };
  }
  if (value.state !== "reserved" && value.state !== "uploading") {
    return { ok: false, code: "invalid", detail: GENERIC_DENY };
  }
  return {
    ok: true,
    replayed: value.replayed,
    evidenceId: value.evidenceId,
    objectKey: value.objectKey,
    storagePath: value.storagePath,
    state: value.state,
  };
}

function retryableEvidenceDeny(code: string): boolean {
  return code === "unauthenticated" || code === "not_found";
}

function mapEvidenceAdapterDeny(value: unknown): ComposedEvidenceUploadResult {
  const denied = parseEvidenceDeny(value);
  if (denied) return evidenceClosed(retryableEvidenceDeny(denied.code));
  return evidenceClosed(true);
}

function parseVerifiedResult(value: unknown, uid: string): VerifiedEvidenceResult | null {
  if (!isPlainObject(value)) return null;
  if (typeof value.evidenceId !== "string" || value.evidenceId.length === 0) return null;
  if (value.ownerUid !== uid) return null;
  if (typeof value.ledgerId !== "string" || value.ledgerId.length === 0) return null;
  if (typeof value.receiptId !== "string" || value.receiptId.length === 0) return null;
  if (!isWave1OriginalCategory(value.category)) return null;
  if (typeof value.mime !== "string" || value.mime.length === 0) return null;
  if (typeof value.byteSize !== "number" || !Number.isInteger(value.byteSize) || value.byteSize < 1) {
    return null;
  }
  if (typeof value.rawSha256 !== "string" || !isSha256Hex(value.rawSha256)) return null;
  if (typeof value.storagePath !== "string" || value.storagePath.length === 0) return null;
  if (typeof value.generation !== "string" || value.generation.length === 0) return null;
  if (value.generation === "verified") return null;
  if (typeof value.verifiedAtUtc !== "string" || value.verifiedAtUtc.length === 0) return null;
  return {
    evidenceId: value.evidenceId,
    ownerUid: value.ownerUid as string,
    ledgerId: value.ledgerId,
    receiptId: value.receiptId,
    category: value.category,
    mime: value.mime,
    byteSize: value.byteSize,
    rawSha256: value.rawSha256,
    storagePath: value.storagePath,
    generation: value.generation,
    verifiedAtUtc: value.verifiedAtUtc,
  };
}

type ParsedLifecycle = {
  ok: true;
  state: string;
  actualSha256: string | null;
  claimedSha256: string | null;
  reservationId: string | null;
  evidenceId: string;
  receiptId: string;
  ledgerId: string;
  category: string | null;
  verified: VerifiedEvidenceResult | null;
};

function parseLifecycle(value: unknown, uid: string): ParsedLifecycle | ComposedEvidenceUploadResult {
  const denied = parseEvidenceDeny(value);
  if (denied) return mapEvidenceAdapterDeny(denied);
  if (!isPlainObject(value) || value.ok !== true) return evidenceClosed(false);
  if (typeof value.state !== "string") return evidenceClosed(false);
  if (typeof value.evidenceId !== "string" || value.evidenceId.length === 0) return evidenceClosed(false);
  if (typeof value.receiptId !== "string" || value.receiptId.length === 0) return evidenceClosed(false);
  if (typeof value.ledgerId !== "string" || value.ledgerId.length === 0) return evidenceClosed(false);
  const actual =
    typeof value.actualSha256 === "string" && isSha256Hex(value.actualSha256) ? value.actualSha256 : null;
  const claimed =
    typeof value.claimedSha256 === "string" && isSha256Hex(value.claimedSha256) ? value.claimedSha256 : null;
  const reservationId = typeof value.reservationId === "string" && value.reservationId.length > 0
    ? value.reservationId
    : null;
  const category = isWave1OriginalCategory(value.category) ? value.category : null;
  const verified = parseVerifiedResult(value.verified, uid);
  return {
    ok: true,
    state: value.state,
    actualSha256: actual,
    claimedSha256: claimed,
    reservationId,
    evidenceId: value.evidenceId,
    receiptId: value.receiptId,
    ledgerId: value.ledgerId,
    category,
    verified,
  };
}

async function linkReceiptPointer(
  adapter: ComposedGrinAdapter,
  uid: string,
  verified: VerifiedEvidenceResult
): Promise<{ ok: true } | { ok: false; retryable: boolean }> {
  const read = await adapter.readReceipt(
    { uid },
    { ledgerId: verified.ledgerId, receiptId: verified.receiptId }
  );
  if (!read.ok) {
    return { ok: false, retryable: read.code === "not_found" };
  }
  if (read.confirmed.eventVersion < 1) return { ok: false, retryable: false };
  const commandId = `evlink_${verified.evidenceId}`;
  const linked = await adapter.linkVerifiedEvidence(
    { uid },
    {
      commandId,
      type: "linkVerifiedEvidence",
      ledgerId: verified.ledgerId,
      body: {
        receiptId: verified.receiptId,
        expectedVersion: read.confirmed.eventVersion,
        reason: "link verified original",
        clientObservedAtUtc: formatUtcIso(Date.now()),
        verified,
      },
    }
  );
  if (!linked.ok) {
    const retryable =
      linked.code === "version_conflict" || linked.code === "not_found" || linked.code === "unauthenticated";
    return { ok: false, retryable };
  }
  return { ok: true };
}

async function completeVerifyLink(
  evidence: ComposedEvidenceAdapter,
  ledger: ComposedGrinAdapter | null,
  uid: string,
  lifecycle: unknown
): Promise<ComposedEvidenceUploadResult> {
  const completed = parseLifecycle(await evidence.completeUpload({ uid }, lifecycle), uid);
  if (!("state" in completed) || !completed.ok) {
    return completed as ComposedEvidenceUploadResult;
  }
  if (completed.state === "rejected") return evidenceClosed(false);
  const verifiedRaw = parseLifecycle(await evidence.verify({ uid }, lifecycle), uid);
  if (!("state" in verifiedRaw) || !verifiedRaw.ok) {
    return verifiedRaw as ComposedEvidenceUploadResult;
  }
  if (verifiedRaw.state === "rejected") return evidenceClosed(false);
  // Stored-byte verification is mandatory. Client claimedSha256 cannot substitute.
  if (!verifiedRaw.actualSha256 || !verifiedRaw.verified) return evidenceClosed(false);
  if (verifiedRaw.verified.rawSha256 !== verifiedRaw.actualSha256) return evidenceClosed(false);
  if (verifiedRaw.verified.ownerUid !== uid) return evidenceClosed(false);
  const linkedRaw = parseLifecycle(await evidence.link({ uid }, verifiedRaw.verified), uid);
  if (!("state" in linkedRaw) || !linkedRaw.ok) {
    return linkedRaw as ComposedEvidenceUploadResult;
  }
  if (linkedRaw.state !== "linked") return evidenceClosed(linkedRaw.state !== "rejected");
  if (!linkedRaw.actualSha256 || linkedRaw.actualSha256 !== verifiedRaw.actualSha256) {
    return evidenceClosed(false);
  }
  if (!linkedRaw.reservationId) return evidenceClosed(false);
  if (ledger) {
    const pointer = await linkReceiptPointer(ledger, uid, verifiedRaw.verified);
    if (!pointer.ok) return evidenceClosed(pointer.retryable);
  }
  return {
    ok: true,
    originalDurable: true,
    generation: verifiedRaw.verified.generation,
    retryable: false,
    ownerUid: verifiedRaw.verified.ownerUid,
    mime: verifiedRaw.verified.mime,
    sizeBytes: verifiedRaw.verified.byteSize,
    storagePath: verifiedRaw.verified.storagePath,
    evidenceId: verifiedRaw.evidenceId,
    receiptId: verifiedRaw.receiptId,
    ledgerId: verifiedRaw.ledgerId,
    category: verifiedRaw.category,
    claimedSha256: verifiedRaw.claimedSha256,
    actualSha256: verifiedRaw.actualSha256,
    reservationId: linkedRaw.reservationId,
  };
}

function envelopeType(data: unknown): string | undefined {
  if (!isPlainObject(data)) return undefined;
  const source = isPlainObject(data.envelope) ? data.envelope : data;
  return typeof source.type === "string" ? source.type : undefined;
}

function ledgerIdOf(data: unknown): unknown {
  if (!isPlainObject(data)) return undefined;
  const source = isPlainObject(data.envelope) ? data.envelope : data;
  return source.ledgerId;
}

function confirmedMatches(
  confirmed: GrinConfirmedProjection,
  result: { receiptId: string; eventVersion: number; headHash: string }
): boolean {
  return (
    confirmed.receiptId === result.receiptId &&
    confirmed.eventVersion === result.eventVersion &&
    confirmed.headHash === result.headHash
  );
}

async function attachConfirmedIfValid<
  T extends { ok: boolean } & Partial<{ receiptId: string; eventVersion: number; headHash: string }>,
>(
  adapter: ComposedGrinAdapter,
  uid: string,
  data: unknown,
  result: T
): Promise<T & { confirmed?: GrinConfirmedProjection }> {
  if (!result.ok) return result;
  if (typeof result.receiptId !== "string") return result;
  if (typeof result.eventVersion !== "number") return result;
  if (typeof result.headHash !== "string") return result;
  const ledgerId = ledgerIdOf(data);
  if (typeof ledgerId !== "string") return result;
  try {
    const read = await adapter.readReceipt({ uid }, { ledgerId, receiptId: result.receiptId });
    if (!read.ok) return result;
    if (!confirmedMatches(read.confirmed, {
      receiptId: result.receiptId,
      eventVersion: result.eventVersion,
      headHash: result.headHash,
    })) {
      return result;
    }
    return { ...result, confirmed: read.confirmed };
  } catch {
    return result;
  }
}

function dispatchMutation(
  adapter: ComposedGrinAdapter,
  uid: string,
  envelope: unknown,
  type: string
): Promise<GrinMutationResult> {
  const caller = { uid };
  switch (type) {
    case "amendFields":
      return adapter.amendFields(caller, envelope);
    case "recordQc":
      return adapter.recordQc(caller, envelope);
    case "dispatchReturn":
      return adapter.dispatchReturn(caller, envelope);
    case "correctReturnDispatch":
      return adapter.correctReturnDispatch(caller, envelope);
    case "voidWithReason":
      return adapter.voidWithReason(caller, envelope);
    case "recordEwbObservation":
      return adapter.recordEwbObservation(caller, envelope);
    case "linkVerifiedEvidence":
      return adapter.linkVerifiedEvidence(caller, envelope);
    default:
      return Promise.resolve(deny("invalid"));
  }
}

export function createComposedGrinCallables(deps: {
  adapter?: ComposedGrinAdapter | null;
  evidence?: ComposedEvidenceAdapter | null;
  env?: NodeJS.ProcessEnv;
}): ComposedGrinCallables {
  const env = deps.env ?? process.env;
  const adapter = deps.adapter ?? null;
  const evidence = deps.evidence ?? null;

  function authorize(
    request: GrinCallableRequest
  ):
    | { ok: true; uid: string; adapter: ComposedGrinAdapter }
    | { ok: false; result: { ok: false; code: "unauthenticated" | "policy_denied"; detail: "denied" } } {
    const uid = uidFromAuth(request.auth);
    if (!uid) return { ok: false, result: deny("unauthenticated") };
    if (!grinFunctionsEnabled(env) || adapter == null) return { ok: false, result: deny("policy_denied") };
    return { ok: true, uid, adapter };
  }

  function authorizeEvidence(
    request: GrinCallableRequest
  ):
    | { ok: true; uid: string; evidence: ComposedEvidenceAdapter }
    | { ok: false; result: ComposedEvidenceUploadResult } {
    const uid = uidFromAuth(request.auth);
    if (!uid) return { ok: false, result: evidenceClosed(false) };
    if (!grinFunctionsEnabled(env) || evidence == null) return { ok: false, result: evidenceClosed(true) };
    return { ok: true, uid, evidence };
  }

  return {
    compositionKind: "UNDEPLOYED_COMPOSED",
    compositionLabel: "INJECTED / EMULATOR / not live deploy",
    async register(request) {
      const authz = authorize(request);
      if (!authz.ok) return authz.result;
      const result = await authz.adapter.register({ uid: authz.uid }, trustedCommandEnvelope(request.data));
      return attachConfirmedIfValid(authz.adapter, authz.uid, request.data, result);
    },
    async reconcile(request) {
      const authz = authorize(request);
      if (!authz.ok) return authz.result;
      const result = await authz.adapter.reconcile({ uid: authz.uid }, trustedReconcileInput(request.data));
      return attachConfirmedIfValid(authz.adapter, authz.uid, request.data, result);
    },
    async mutate(request) {
      const authz = authorize(request);
      if (!authz.ok) return authz.result;
      const type = envelopeType(request.data);
      if (!type) return deny("invalid");
      const result = await dispatchMutation(
        authz.adapter,
        authz.uid,
        trustedCommandEnvelope(request.data),
        type
      );
      return attachConfirmedIfValid(authz.adapter, authz.uid, request.data, result);
    },
    async readReceipt(request) {
      const authz = authorize(request);
      if (!authz.ok) return authz.result;
      return authz.adapter.readReceipt({ uid: authz.uid }, trustedReadInput(request.data));
    },
    async reserveEvidence(request) {
      const uid = uidFromAuth(request.auth);
      if (!uid) return { ok: false, code: "unauthenticated", detail: GENERIC_DENY };
      if (!grinFunctionsEnabled(env) || evidence == null) {
        return { ok: false, code: "policy_denied", detail: GENERIC_DENY };
      }
      const raw = await evidence.reserve({ uid }, trustedEvidenceReserveInput(request.data));
      return parseEvidenceReserveResult(raw);
    },
    async beginEvidenceUpload(request) {
      const authz = authorizeEvidence(request);
      if (!authz.ok) return authz.result;
      const raw = await authz.evidence.beginUpload(
        { uid: authz.uid },
        trustedEvidenceLifecycleInput(request.data)
      );
      const parsed = parseLifecycle(raw, authz.uid);
      if (!("state" in parsed) || !parsed.ok) return parsed as ComposedEvidenceUploadResult;
      if (parsed.state === "rejected") return evidenceClosed(false);
      return {
        ok: true,
        originalDurable: false,
        generation: null,
        retryable: false,
        ownerUid: null,
        mime: null,
        sizeBytes: null,
        storagePath: null,
        evidenceId: parsed.evidenceId,
        receiptId: parsed.receiptId,
        ledgerId: parsed.ledgerId,
        category: parsed.category,
        claimedSha256: parsed.claimedSha256,
        actualSha256: null,
        reservationId: parsed.reservationId,
      };
    },
    async uploadEvidence(request) {
      const authz = authorizeEvidence(request);
      if (!authz.ok) return authz.result;
      return completeVerifyLink(
        authz.evidence,
        adapter,
        authz.uid,
        trustedEvidenceLifecycleInput(request.data)
      );
    },
  };
}
