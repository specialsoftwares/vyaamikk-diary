/**
 * FAKE always-deny G1 stand-in for SQLITE_HOST / mounted-inert tests.
 * Production startGrinOwnerSession uses createFirebaseJsGrinTransport (INJECTED).
 * Tests must inject this port (or createFakeGrinServerPort) so they never call Firebase.
 * portKind is FAKE. It never issues GRIN numbers.
 */

import type { GrinEvidenceUploadPort, GrinServerCommandPort } from "@/services/grin/outbox/ports";

export const GRIN_UNINJECTED_SERVER_DETAIL = "g1_server_not_injected";

export function createUninjectedGrinServerPort(): GrinServerCommandPort {
  return {
    portKind: "FAKE",
    async register() {
      return { ok: false, code: "policy_denied", detail: GRIN_UNINJECTED_SERVER_DETAIL };
    },
    async reconcile() {
      return { ok: false, code: "policy_denied", detail: GRIN_UNINJECTED_SERVER_DETAIL };
    },
  };
}

/** FAKE closed evidence port. Upload never looks like a durable success. */
export function createUninjectedGrinEvidencePort(): GrinEvidenceUploadPort {
  return {
    portKind: "FAKE",
    async upload() {
      return {
        ok: false,
        originalDurable: false,
        generation: null,
        retryable: true,
        evidenceId: null,
        receiptId: null,
        ledgerId: null,
        category: null,
        claimedSha256: null,
        actualSha256: null,
        reservationId: null,
      };
    },
  };
}
