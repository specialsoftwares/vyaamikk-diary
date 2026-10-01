/**
 * Fail-closed GRIN Functions handlers. Not exported from functions/src/index.ts.
 * Undeployed in this programme. Default deny unless GRIN_GOODS_EVIDENCE_FUNCTIONS
 * is the string "true", and even then the live adapter is not wired here.
 *
 * Do not change account-deletion jobs. GRIN retention after pending_deletion /
 * retireIdentity is an unresolved policy dependency.
 */

export const GRIN_FUNCTIONS_ENV = "GRIN_GOODS_EVIDENCE_FUNCTIONS";

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
 * server env is exactly "true". This module stays uninvoked without that export.
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
