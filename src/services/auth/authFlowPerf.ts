/**
 * Sanitized auth-flow phase timings. Never logs OTP, tokens, credentials,
 * or full phone numbers. Not shown in production UI.
 */

import { createLogger } from "@/utils/logger";

const log = createLogger("auth/perf");

export type AuthPerfPhase =
  | "T0_continue_tap"
  | "T1_local_validation"
  | "T2_native_send_begin"
  | "T3_firebase_challenge"
  | "T4_otp_screen_requested"
  | "T5_sms_auto_retrieve"
  | "V0_otp_complete"
  | "V1_verifying_overlay"
  | "V2_firebase_confirm_begin"
  | "V3_firebase_auth_ok"
  | "V4_id_token_ready"
  | "V5_resolver_begin"
  | "V6_resolver_ok"
  | "V7_session_reconcile_begin"
  | "V8_session_reconciled"
  | "V9_email_nav_requested"
  | "V10_email_screen_requested";

const marks = new Map<string, number>();

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

export function authPerfMark(phase: AuthPerfPhase): void {
  marks.set(phase, now());
}

export function authPerfDelta(from: AuthPerfPhase, to: AuthPerfPhase): number | null {
  const a = marks.get(from);
  const b = marks.get(to);
  if (a == null || b == null) return null;
  return Math.round(b - a);
}

export function authPerfSnapshot(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of marks) out[k] = Math.round(v);
  return out;
}

export function authPerfSummary(
  kind: "phone_send" | "otp_verify",
  pairs: Array<[AuthPerfPhase, AuthPerfPhase, string]>
): Record<string, number | null> {
  const deltas: Record<string, number | null> = {};
  for (const [from, to, label] of pairs) {
    deltas[label] = authPerfDelta(from, to);
  }
  log.warn(`auth_flow_perf ${kind}`, { kind, deltas });
  return deltas;
}

export function __resetAuthPerfForTests(): void {
  marks.clear();
  spans.length = 0;
  attemptSerial = 0;
  perfExportConsent = false;
}

export type PerfOutcome = "ok" | "error" | "cancelled" | "retired" | "timeout" | "unavailable";

export type PerfOperation =
  | "phone_send"
  | "phone_verify"
  | "email_send"
  | "email_verify"
  | "record_save"
  | "pdf_generate"
  | "navigation"
  | "token_gate"
  | "js_bridge";

/** User-visible clocks. Missing spans stay absent; they are not zero. */
export type PerfClock =
  | "ui_feedback"
  | "local_durable"
  | "remote_acceptance"
  | "derived_ready"
  | "delivery"
  | "token_cached"
  | "token_forced"
  | "bridge_reuse"
  | "bridge_mint";

export interface PerfSpan {
  operationId: string;
  attempt: number;
  operation: PerfOperation;
  stage: PerfClock | AuthPerfPhase;
  runtime: "js" | "native" | "server";
  durationMs: number;
  outcome: PerfOutcome;
  /** `ordering` marks a sequence. It is not a measured device duration. */
  evidence?: "ordering" | "measured";
}

const MAX_SPANS = 64;
const spans: PerfSpan[] = [];
let attemptSerial = 0;
let perfExportConsent = false;

function randomOperationId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") return cryptoApi.randomUUID();
  return `op_${Math.random().toString(36).slice(2, 12)}`;
}

/** Consent gates export only. Recording stays local and non-blocking. */
export function setPerfTelemetryConsent(enabled: boolean): void {
  perfExportConsent = enabled;
}

export function perfTelemetryExportAllowed(): boolean {
  return perfExportConsent;
}

export function beginPerfAttempt(operation: PerfOperation): {
  operationId: string;
  attempt: number;
  operation: PerfOperation;
} {
  attemptSerial += 1;
  return { operationId: randomOperationId(), attempt: attemptSerial, operation };
}

export function recordPerfSpan(
  span: Omit<PerfSpan, "durationMs"> & { durationMs: number }
): void {
  if (!Number.isFinite(span.durationMs) || span.durationMs < 0) return;
  spans.push({
    operationId: span.operationId,
    attempt: span.attempt,
    operation: span.operation,
    stage: span.stage,
    runtime: span.runtime,
    durationMs: Math.round(span.durationMs),
    outcome: span.outcome,
    ...(span.evidence ? { evidence: span.evidence } : {}),
  });
  if (spans.length > MAX_SPANS) spans.shift();
  if (!perfExportConsent) return;
  try {
    log.warn("auth_flow_perf span", {
      kind: span.outcome === "ok" ? "verified" : "failed",
      ms: Math.round(span.durationMs),
    });
  } catch {
    // Telemetry must not block auth.
  }
}

export function perfSpans(): PerfSpan[] {
  return spans.map((span) => ({ ...span }));
}

export function perfSpansForAttempt(operationId: string): PerfSpan[] {
  return spans.filter((span) => span.operationId === operationId).map((span) => ({ ...span }));
}
