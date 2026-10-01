/**
 * Isolated undeployed GRIN callable composition.
 *
 * INJECTED / EMULATOR / not live deploy. Not exported from functions/src/index.ts.
 * When GRIN_GOODS_EVIDENCE_FUNCTIONS is exactly "true" and tests/emulator inject
 * GoodsEvidenceRegisterAdapter, register / reconcile / mutate / readReceipt run
 * through that adapter. Any other env value, or an unbound adapter, is fail-closed deny.
 *
 * Owner identity is request.auth.uid / AuthData.uid only. Client uid, ownerUid,
 * and digest are not server authority. Digest is recomputed inside the adapter.
 */

import { grinFunctionsEnabled } from "./callables";
import type {
  GrinConfirmedProjection,
  GrinMutationResult,
  GrinReceiptReadResult,
  GrinReconcileResult,
  GrinRegisterResult,
} from "./ports";

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

export type ComposedGrinCallables = {
  compositionKind: "UNDEPLOYED_COMPOSED";
  compositionLabel: "INJECTED / EMULATOR / not live deploy";
  register(request: GrinCallableRequest): Promise<ComposedRegisterResult>;
  reconcile(request: GrinCallableRequest): Promise<ComposedReconcileResult>;
  mutate(request: GrinCallableRequest): Promise<ComposedMutationResult>;
  readReceipt(request: GrinCallableRequest): Promise<GrinReceiptReadResult>;
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
  env?: NodeJS.ProcessEnv;
}): ComposedGrinCallables {
  const env = deps.env ?? process.env;
  const adapter = deps.adapter ?? null;

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
  };
}
