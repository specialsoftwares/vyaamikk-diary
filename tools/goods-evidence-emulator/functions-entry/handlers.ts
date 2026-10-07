/**
 * Isolated Functions emulator exports. NOT functions/src/index.ts.
 * Composes the same createComposedGrinCallables factory used by undeployed
 * production HOLD handlers. GRIN_GOODS_EVIDENCE_FUNCTIONS=true is required
 * on this emulator process only.
 */
import { onCall, type CallableRequest } from "firebase-functions/v2/https";

import { createIsolatedGrinCallables } from "./compose";

const composed = createIsolatedGrinCallables();

function wrap(
  run: (request: { auth: { uid: string } | null; data: unknown }) => Promise<unknown>
) {
  return onCall({ region: "asia-south1" }, async (request: CallableRequest) => {
    const auth = request.auth?.uid ? { uid: request.auth.uid } : null;
    return run({ auth, data: request.data });
  });
}

export const grinRegisterGoodsReceipt = wrap((request) => composed.register(request));
export const grinReconcileCommand = wrap((request) => composed.reconcile(request));
export const grinMutateGoodsReceipt = wrap((request) => composed.mutate(request));
export const grinReadGoodsReceipt = wrap((request) => composed.readReceipt(request));
export const grinReserveEvidence = wrap((request) => composed.reserveEvidence(request));
export const grinBeginEvidenceUpload = wrap((request) => composed.beginEvidenceUpload(request));
export const grinUploadEvidence = wrap((request) => composed.uploadEvidence(request));
