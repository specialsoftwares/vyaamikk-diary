/**
 * Production GRIN https onCall exports.
 *
 * Composition is lazy: this module must not import productionCompose or resolve
 * Admin project/bucket at load time. Identity, email, deletion, and billing
 * handlers stay discoverable if GRIN configuration is missing.
 *
 * A GRIN configuration failure returns a fixed deny. It does not guess a
 * project or bucket and does not log FIREBASE_CONFIG or process.env.
 */
import { onCall, type CallableRequest } from "firebase-functions/v2/https";

import { GrinAdminConfigError } from "./productionAdminConfig";
import type { ComposedGrinCallables } from "./composed";

export const PRODUCTION_GRIN_CALLABLE_NAMES = [
  "grinRegisterGoodsReceipt",
  "grinReconcileCommand",
  "grinMutateGoodsReceipt",
  "grinReadGoodsReceipt",
  "grinReserveEvidence",
  "grinBeginEvidenceUpload",
  "grinUploadEvidence",
] as const;

export type ProductionGrinCallableName = (typeof PRODUCTION_GRIN_CALLABLE_NAMES)[number];

const CONFIG_DENIED = { ok: false, code: "policy_denied", detail: "denied" } as const;

type GrinMethod =
  | "register"
  | "reconcile"
  | "mutate"
  | "readReceipt"
  | "reserveEvidence"
  | "beginEvidenceUpload"
  | "uploadEvidence";

export type ProductionGrinLoadComposed = () => Promise<ComposedGrinCallables>;

let loading: Promise<ComposedGrinCallables> | null = null;
let composed: ComposedGrinCallables | null = null;
let cachedConfigError: GrinAdminConfigError | null = null;

async function defaultLoadComposed(): Promise<ComposedGrinCallables> {
  if (cachedConfigError) throw cachedConfigError;
  if (composed) return composed;
  if (!loading) {
    loading = import("./productionCompose").then((mod) => mod.createProductionGrinCallables());
  }
  try {
    composed = await loading;
    return composed;
  } catch (err) {
    loading = null;
    throw err;
  }
}

function authFromCallable(request: CallableRequest): { uid: string } | null {
  return request.auth?.uid ? { uid: request.auth.uid } : null;
}

/**
 * Invoke one composed GRIN method. Used by onCall wrappers and injected tests.
 * Does not print configuration contents.
 */
export async function runProductionGrinCallable(
  method: GrinMethod,
  request: { auth: { uid: string } | null; data: unknown },
  loadComposed: ProductionGrinLoadComposed = defaultLoadComposed
): Promise<unknown> {
  try {
    const grin = await loadComposed();
    return grin[method](request);
  } catch (err) {
    if (err instanceof GrinAdminConfigError) {
      if (loadComposed === defaultLoadComposed) cachedConfigError = err;
      return CONFIG_DENIED;
    }
    throw err;
  }
}

function wrapGrin(method: GrinMethod, loadComposed?: ProductionGrinLoadComposed) {
  return onCall({ region: "asia-south1" }, async (request: CallableRequest) => {
    const payload = { auth: authFromCallable(request), data: request.data };
    if (loadComposed) return runProductionGrinCallable(method, payload, loadComposed);
    return runProductionGrinCallable(method, payload);
  });
}

export const grinRegisterGoodsReceipt = wrapGrin("register");
export const grinReconcileCommand = wrapGrin("reconcile");
export const grinMutateGoodsReceipt = wrapGrin("mutate");
export const grinReadGoodsReceipt = wrapGrin("readReceipt");
export const grinReserveEvidence = wrapGrin("reserveEvidence");
export const grinBeginEvidenceUpload = wrapGrin("beginEvidenceUpload");
export const grinUploadEvidence = wrapGrin("uploadEvidence");

/** Test-only factory. Production index uses the module exports above. */
export function createProductionGrinHttpsHandlers(loadComposed: ProductionGrinLoadComposed) {
  return {
    grinRegisterGoodsReceipt: wrapGrin("register", loadComposed),
    grinReconcileCommand: wrapGrin("reconcile", loadComposed),
    grinMutateGoodsReceipt: wrapGrin("mutate", loadComposed),
    grinReadGoodsReceipt: wrapGrin("readReceipt", loadComposed),
    grinReserveEvidence: wrapGrin("reserveEvidence", loadComposed),
    grinBeginEvidenceUpload: wrapGrin("beginEvidenceUpload", loadComposed),
    grinUploadEvidence: wrapGrin("uploadEvidence", loadComposed),
  };
}
