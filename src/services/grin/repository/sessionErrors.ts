import { GRIN_NO_CONFIRMED_VERSION } from "@/goodsEvidence/ports";

/** Fail-closed codes. Stale captured work must not queue or publish. */
export const GRIN_SESSION_RETIRED = "session_retired";
export const GRIN_BINDING_RETIRED = "grin_binding_retired";
export const GRIN_SESSION_NOT_STARTED = "grin_session_not_started";
export const GRIN_MUTATION_QUEUE_UNINJECTED = "persist_mutation_and_queue_uninjected";

export { GRIN_NO_CONFIRMED_VERSION };

export function isGrinSessionFenceError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message === GRIN_SESSION_RETIRED ||
    error.message === GRIN_BINDING_RETIRED ||
    error.message === GRIN_SESSION_NOT_STARTED
  );
}
