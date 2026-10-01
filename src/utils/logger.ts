/**
 * Privacy-aware logger.
 *
 * Production warn/error emit only classified events and allowlisted metadata.
 * Unknown/free-form text is never printed. Debug/info stay off in production.
 */

import { env } from "@/config/env";

import {
  classifyLogMessage,
  classifyScope,
  sanitizeLogMetadata,
  type SafeMetaValue,
} from "./safeDiagnostics";

type Level = "debug" | "info" | "warn" | "error";
type Sink = (...args: unknown[]) => void;

function selectSink(level: Level): Sink {
  if (level === "error") return console.error;
  if (level === "warn") return console.warn;
  return console.log;
}

function writeSink(sink: Sink, args: unknown[]): void {
  try {
    sink(...args);
  } catch {
    // Broken sinks must not throw into application code or retry with raw input.
  }
}

function emit(level: Level, scope: string, message: string, data?: unknown) {
  if (env.isProduction && (level === "debug" || level === "info")) return;
  let sink: Sink;
  try {
    sink = selectSink(level);
  } catch {
    return;
  }
  try {
    const safeScope = classifyScope(scope);
    const classified = classifyLogMessage(typeof message === "string" ? message : "");
    const payload = Object.create(null) as Record<string, SafeMetaValue>;
    payload.event = classified.event;
    const meta = sanitizeLogMetadata(data);
    if (meta) {
      for (const key of Object.keys(meta)) {
        if (key === "event") continue;
        const value = meta[key];
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          payload[key] = value;
        }
      }
    }
    writeSink(sink, [`[${safeScope}]`, classified.summary, payload]);
  } catch {
    return;
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
