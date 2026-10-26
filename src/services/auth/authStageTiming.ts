/**
 * Sanitized stage durations. Values are elapsed milliseconds inside this
 * process, not account identifiers or request bodies.
 */

import { createLogger } from "@/utils/logger";

const log = createLogger("auth/localKey");

export function markAuthStage(stage: string, startedAtMs: number): void {
  try {
    const elapsed = Math.max(0, Math.round(nowMs() - startedAtMs));
    log.metric("auth stage timed", { stage, ms: elapsed, op: "save" });
  } catch {
    // Timing must not change the sign-in result.
  }
}

export function reportAuthFailure(error: unknown, stage: string): void {
  try {
    const code = typedCode(error);
    log.metric("auth failure reported", {
      stage,
      code,
      errorClass: code.startsWith("secure_") || code.startsWith("key_") || code === "migration_incomplete"
        ? "unavailable"
        : "unknown",
      op: "save",
    });
  } catch {
    // A diagnostic failure must not replace the original error.
  }
}

function nowMs(): number {
  const perf = globalThis.performance;
  if (perf && typeof perf.now === "function") return perf.now();
  return Date.now();
}

function typedCode(error: unknown): string {
  if (!error || typeof error !== "object") return "unknown";
  try {
    const reason = Object.getOwnPropertyDescriptor(error, "reason")?.value;
    if (typeof reason === "string") return reason;
    const code = Object.getOwnPropertyDescriptor(error, "code")?.value;
    if (typeof code === "string") return code;
  } catch {
    return "unknown";
  }
  return "unknown";
}
