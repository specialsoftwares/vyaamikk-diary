import type { GrinDenyCode, GrinMutationResult, GrinRegisterResult } from "@/goodsEvidence/ports";
import type { ActionableFailure, OutboxLocalState } from "./types";
import { MAX_DISPATCH_ATTEMPTS } from "./types";

export type ClassifiedOutcome =
  | { kind: "success"; replayed: boolean }
  | { kind: "conflicted"; code: "digest_conflict" | "version_conflict"; actionable: ActionableFailure }
  | { kind: "permanent"; code: string; actionable: ActionableFailure }
  | { kind: "retryable"; code: string; actionable: ActionableFailure };

const PERMANENT: Record<string, ActionableFailure> = {
  invalid: "fix_command_payload",
  forbidden: "account_or_ledger_not_usable",
  policy_denied: "feature_not_admitted",
  receipt_exists: "receipt_already_registered",
  integrity: "server_serial_integrity",
  serial_exhausted: "serial_range_exhausted",
  voided: "account_or_ledger_not_usable",
  quota_exhausted: "monthly_quota_exhausted",
  quota_state_invalid: "quota_state_unreadable",
};

export function isNetworkAmbiguous(err: unknown): boolean {
  if (err == null) return false;
  if (typeof err === "object" && "code" in err) {
    const code = String((err as { code?: unknown }).code ?? "");
    if (code === "network_ambiguous" || code === "unavailable" || code === "network") return true;
  }
  return err instanceof Error && /network|ECONNRESET|ETIMEDOUT|ambiguous/i.test(err.message);
}

export function classifyRegisterResult(result: GrinRegisterResult | GrinMutationResult): ClassifiedOutcome {
  if (result.ok) return { kind: "success", replayed: result.replayed };
  if (result.code === "digest_conflict") {
    return { kind: "conflicted", code: result.code, actionable: "command_payload_mismatch" };
  }
  if (result.code === "version_conflict") {
    return { kind: "conflicted", code: result.code, actionable: "command_payload_mismatch" };
  }
  if (result.code === "unauthenticated") {
    return { kind: "retryable", code: result.code, actionable: "sign_in_again" };
  }
  if (result.code === "not_found") {
    return { kind: "retryable", code: result.code, actionable: "retry_when_online" };
  }
  const permanent = PERMANENT[result.code as GrinDenyCode];
  if (permanent) return { kind: "permanent", code: result.code, actionable: permanent };
  return { kind: "retryable", code: result.code, actionable: "retry_when_online" };
}

export function nextRetryState(attemptCount: number, maxAttempts = MAX_DISPATCH_ATTEMPTS): {
  state: Extract<OutboxLocalState, "failed_retryable" | "failed_permanent">;
  actionable: ActionableFailure;
} {
  if (attemptCount >= maxAttempts) {
    return { state: "failed_permanent", actionable: "retry_exhausted" };
  }
  return { state: "failed_retryable", actionable: "retry_when_online" };
}
