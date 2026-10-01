/**
 * Queue-only G1 stand-in until Team 1 injects a real server port.
 * portKind is FAKE because it is not an INJECTED Team 1 adapter.
 * It never issues GRIN numbers.
 */

import type { GrinServerCommandPort } from "@/services/grin/outbox/ports";

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
