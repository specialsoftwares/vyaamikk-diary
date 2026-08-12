import type { StartupErrorCode, StartupStage } from "./types";

/**
 * Structured startup failure — catchable by the bootstrap boundary.
 * Never put secrets or PII in `message`.
 */
export class StartupError extends Error {
  readonly code: StartupErrorCode;
  readonly stage: StartupStage;

  constructor(code: StartupErrorCode, stage: StartupStage, message: string) {
    super(message);
    this.name = "StartupError";
    this.code = code;
    this.stage = stage;
  }
}

const SECRETISH =
  /\b(AIza[0-9A-Za-z_-]{10,}|Bearer\s+\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|password|secret|api[_-]?key|otp|token)\b/gi;
const EMAILISH = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONEISH = /\+?\d[\d\s()-]{8,}\d/g;
const PATHISH = /(?:\/Users\/|\/home\/|[A-Z]:\\)[^\s"']+/gi;

/** Strip secrets/PII/paths from messages shown on the Startup Failure screen. */
export function redactStartupMessage(raw: string, maxLen = 280): string {
  let s = String(raw || "Unknown startup error");
  s = s.replace(SECRETISH, "[redacted]");
  s = s.replace(EMAILISH, "[redacted-email]");
  s = s.replace(PHONEISH, "[redacted-phone]");
  s = s.replace(PATHISH, "[redacted-path]");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > maxLen) s = `${s.slice(0, maxLen - 1)}…`;
  return s || "Unknown startup error";
}

export function toStartupError(
  error: unknown,
  fallbackCode: StartupErrorCode,
  fallbackStage: StartupStage
): StartupError {
  if (error instanceof StartupError) return error;
  const message = redactStartupMessage(
    error instanceof Error ? error.message : String(error)
  );
  return new StartupError(fallbackCode, fallbackStage, message);
}
