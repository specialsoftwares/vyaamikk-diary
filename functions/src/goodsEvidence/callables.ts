/**
 * Fail-closed GRIN Functions stubs. Production index does not export these
 * handlers; it re-exports lazy onCall wrappers from productionExports.ts.
 * Default deny unless GRIN_GOODS_EVIDENCE_FUNCTIONS is the string "true".
 * These handlers do not wire an adapter; tests/emulator composition lives in
 * composed.ts and injects GoodsEvidenceRegisterAdapter.
 *
 * Do not change account-deletion jobs. GRIN retention after pending_deletion /
 * retireIdentity is an unresolved policy dependency.
 */

export const GRIN_FUNCTIONS_ENV = "GRIN_GOODS_EVIDENCE_FUNCTIONS";

/** Callable names. Production index exports these names via productionExports.ts. */
export const GRIN_REGISTER_CALLABLE = "grinRegisterGoodsReceipt";
export const GRIN_RECONCILE_CALLABLE = "grinReconcileCommand";
export const GRIN_MUTATE_CALLABLE = "grinMutateGoodsReceipt";
export const GRIN_READ_CALLABLE = "grinReadGoodsReceipt";
export const GRIN_RESERVE_EVIDENCE_CALLABLE = "grinReserveEvidence";
export const GRIN_BEGIN_EVIDENCE_CALLABLE = "grinBeginEvidenceUpload";
export const GRIN_UPLOAD_EVIDENCE_CALLABLE = "grinUploadEvidence";

export type GrinFunctionsDeny = {
  ok: false;
  code: "unauthenticated" | "policy_denied";
  detail: "denied";
};

export function grinFunctionsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[GRIN_FUNCTIONS_ENV] === "true";
}

function deny(code: GrinFunctionsDeny["code"]): GrinFunctionsDeny {
  return { ok: false, code, detail: "denied" };
}

/**
 * Production callables must not run unless the coordinator exports them and the
 * server env is exactly "true". This module stays uninvoked without that export
 * and does not bind the emulator adapter.
 */
export async function handleGrinRegister(
  uid: string | null,
  _envelope: unknown
): Promise<GrinFunctionsDeny> {
  if (!uid) return deny("unauthenticated");
  if (!grinFunctionsEnabled()) return deny("policy_denied");
  return deny("policy_denied");
}

export async function handleGrinReconcile(
  uid: string | null,
  _input: unknown
): Promise<GrinFunctionsDeny> {
  if (!uid) return deny("unauthenticated");
  if (!grinFunctionsEnabled()) return deny("policy_denied");
  return deny("policy_denied");
}

export async function handleGrinMutation(
  uid: string | null,
  _envelope: unknown
): Promise<GrinFunctionsDeny> {
  if (!uid) return deny("unauthenticated");
  if (!grinFunctionsEnabled()) return deny("policy_denied");
  return deny("policy_denied");
}

export async function handleGrinRead(
  uid: string | null,
  _input: unknown
): Promise<GrinFunctionsDeny> {
  if (!uid) return deny("unauthenticated");
  if (!grinFunctionsEnabled()) return deny("policy_denied");
  return deny("policy_denied");
}

export async function handleGrinReserveEvidence(
  uid: string | null,
  _input: unknown
): Promise<GrinFunctionsDeny> {
  if (!uid) return deny("unauthenticated");
  if (!grinFunctionsEnabled()) return deny("policy_denied");
  return deny("policy_denied");
}

export async function handleGrinBeginEvidenceUpload(
  uid: string | null,
  _input: unknown
): Promise<GrinFunctionsDeny> {
  if (!uid) return deny("unauthenticated");
  if (!grinFunctionsEnabled()) return deny("policy_denied");
  return deny("policy_denied");
}

export async function handleGrinUploadEvidence(
  uid: string | null,
  _input: unknown
): Promise<GrinFunctionsDeny> {
  if (!uid) return deny("unauthenticated");
  if (!grinFunctionsEnabled()) return deny("policy_denied");
  return deny("policy_denied");
}
