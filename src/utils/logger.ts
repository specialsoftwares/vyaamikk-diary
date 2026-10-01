/**
 * Privacy-aware logger.
 *
 * Production warn/error emit only classified events and allowlisted metadata.
 * Unknown/free-form text is never printed. Debug/info stay off in production.
 */

import { env } from "@/config/env";

import {
  SAFE_DIAGNOSTIC_FAILED,
  SAFE_FALLBACK_SCOPE,
  classifyLogMessage,
  classifyScope,
  inspectWithoutThrowing,
  sanitizeLogMetadata,
} from "./safeDiagnostics";

type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, scope: string, message: string, data?: unknown) {
  if (env.isProduction && (level === "debug" || level === "info")) return;
  const fn =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;
  try {
    inspectWithoutThrowing(data);
    const safeScope = classifyScope(scope);
    const classified = classifyLogMessage(typeof message === "string" ? message : "");
    const meta = sanitizeLogMetadata(data);
    const payload = meta
      ? { ...meta, event: classified.event }
      : { event: classified.event };
    fn(`[${safeScope}]`, classified.summary, payload);
  } catch {
    fn(`[${SAFE_FALLBACK_SCOPE}]`, SAFE_DIAGNOSTIC_FAILED, { event: SAFE_DIAGNOSTIC_FAILED });
  }
}

export function createLogger(scope: string) {
  return {
    debug: (m: string, d?: unknown) => emit("debug", scope, m, d),
    info: (m: string, d?: unknown) => emit("info", scope, m, d),
    warn: (m: string, d?: unknown) => emit("warn", scope, m, d),
    error: (m: string, d?: unknown) => emit("error", scope, m, d),
  };
}
