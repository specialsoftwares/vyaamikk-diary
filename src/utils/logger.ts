/**
 * Privacy-aware logger.
 *
 * Never logs OTPs, tokens, bank fields, full mobile numbers, or exact GPS in
 * production. Development suppresses debug; sensitive keys are redacted everywhere.
 */

import { env } from "@/config/env";

import { looksLikePdfHtml, redactPdfContentInLogData } from "./pdfSafeLog";

type Level = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEY =
  /otp|token|secret|password|authorization|bearer|apikey|private|account|ifsc|upi|bank|mobile|phone|latitude|longitude|lat|lng|geo|pincode|pin.?code|postal|body|notes|pdf|html|credential|session|payload|facts|matter|input|imageDataUri|imageuri|bankdetails|letterhead|packfacts|closing|subject/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[nested]";
  if (value == null) return value;
  if (typeof value === "string") {
    if (looksLikePdfHtml(value)) return "[redacted:pdf-html]";
    if (value.length > 200 && /[<][a-z!/]/i.test(value)) return "[redacted:html]";
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitize(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) {
        if (/phone|mobile/i.test(k) && typeof v === "string") {
          out[k] = maskForLog(v);
        } else {
          out[k] = "[redacted]";
        }
      } else if (k === "uri" || k === "localUri" || k === "pdfUri") {
        out[k] = "[redacted:uri]";
      } else {
        out[k] = sanitize(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

function maskForLog(s: string): string {
  const t = s.trim();
  if (t.length < 6) return "***";
  return `${t.slice(0, 3)}***${t.slice(-2)}`;
}

function emit(level: Level, scope: string, message: string, data?: unknown) {
  if (env.isProduction && (level === "debug" || level === "info")) return;
  const tag = `[${scope}]`;
  const payload =
    data === undefined ? undefined : sanitize(redactPdfContentInLogData(data));
  const fn =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;
  if (payload === undefined) {
    fn(tag, message);
  } else {
    fn(tag, message, payload);
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
