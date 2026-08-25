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
}
