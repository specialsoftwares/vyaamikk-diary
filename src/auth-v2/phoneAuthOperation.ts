/**
 * One attempt-owned controller for phone send, verification, and continuation.
 *
 * A JavaScript deadline ends the busy UI. It does not cancel Firebase's native
 * operation or a server transaction. The native SDK's auto-retrieval window is
 * not this bound: a null Activity can leave signInWithPhoneNumber unsettled,
 * and that wait is covered here.
 * Late results are dropped when the attempt id no longer owns the UI.
 */

import { AppError } from "@/domain/errors";

export const PHONE_AUTH_USER_BOUND_MS = 45_000;
export const PHONE_NATIVE_SEND_BOUND_MS = 20_000;
export const PHONE_NATIVE_CONFIRM_BOUND_MS = 20_000;
export const PHONE_ACCOUNT_BOUND_MS = 20_000;
export const PHONE_SESSION_BOUND_MS = 20_000;
export const PHONE_CLEANUP_BOUND_MS = 3_000;

export type PhoneAuthStage = "send" | "confirm" | "account" | "session" | "cleanup";

export type PhoneAuthSettlement =
  | "ignored"
  | "invalid"
  | "expired"
  | "network"
  | "unknown"
  | "session_changed"
  | "account_failed"
  | "verified"
  | "reactivation"
  | "cancelled"
  | "storage_failed";

export type PhoneAuthOverlay = "off" | "verifying" | "success";

export type PhoneVerificationView = {
  applied: boolean;
  busy: boolean;
  overlay: PhoneAuthOverlay;
  settlement: PhoneAuthSettlement;
  clearCode: boolean;
  navigate: "account" | "reactivation" | null;
  operationId: string | null;
  stage: PhoneAuthStage | "idle";
  error: unknown;
  reactivation: {
    phoneE164: string;
    deletionScheduledFor: string;
    deletionPolicyVersion: string;
    maskedEmail: string;
  } | null;
};

type LiveAttempt = {
  id: string;
  generation: number;
  stage: PhoneAuthStage;
  deadline: number;
  busy: boolean;
  overlay: PhoneAuthOverlay;
};

function attemptId(): string {
  const bytes = new Uint8Array(8);
  const cryptoRef = globalThis.crypto;
  if (cryptoRef?.getRandomValues) cryptoRef.getRandomValues(bytes);
  else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createPhoneAuthOperations(now: () => number = Date.now) {
  let generation = 0;
  let live: LiveAttempt | null = null;
  let successTimer: ReturnType<typeof setTimeout> | null = null;

  function clearSuccessTimer(): void {
    if (successTimer) clearTimeout(successTimer);
    successTimer = null;
  }

  function sameAttempt(id: string | null): boolean {
    return id != null && live?.id === id;
  }

  function view(): { busy: boolean; overlay: PhoneAuthOverlay; generation: number; operationId: string | null; stage: PhoneAuthStage | null } {
    return {
      busy: live?.busy ?? false,
      overlay: live?.overlay ?? "off",
      generation,
      operationId: live?.id ?? null,
      stage: live?.stage ?? null,
    };
  }

  function accept(stage: PhoneAuthStage, boundMs: number): { accepted: true; id: string; generation: number } | { accepted: false } {
    if (live?.busy) return { accepted: false };
    clearSuccessTimer();
    generation += 1;
    const id = attemptId();
    live = {
      id,
      generation,
      stage,
      deadline: now() + boundMs,
      busy: true,
      overlay: stage === "cleanup" ? "off" : "verifying",
    };
    return { accepted: true, id, generation };
  }

  function settle(id: string, overlay: PhoneAuthOverlay): boolean {
    if (!sameAttempt(id)) return false;
    live = live ? { ...live, busy: false, overlay } : live;
    return true;
  }

  function retire(): void {
    clearSuccessTimer();
    generation += 1;
    live = null;
  }

  function armSuccess(id: string, waitMs: number, reveal: () => void): void {
    clearSuccessTimer();
    successTimer = setTimeout(() => {
      successTimer = null;
      if (!sameAttempt(id)) return;
      reveal();
    }, waitMs);
  }

  async function bounded<T>(id: string, work: Promise<T>, timeoutMs: number): Promise<
    | { status: "ok"; value: T }
    | { status: "unknown" }
    | { status: "cancelled" }
  > {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<{ status: "unknown" }>((resolve) => {
      timer = setTimeout(() => resolve({ status: "unknown" }), timeoutMs);
    });
    try {
      const result = await Promise.race([
        work.then((value) => ({ status: "ok" as const, value })),
        timeout,
      ]);
      if (!sameAttempt(id) || live?.busy === false) return result.status === "ok" ? { status: "cancelled" } : result;
      return result;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return { accept, settle, retire, sameAttempt, view, armSuccess, bounded };
}

export type PhoneAuthOperations = ReturnType<typeof createPhoneAuthOperations>;

function idleView(settlement: PhoneAuthSettlement, error: unknown = null): PhoneVerificationView {
  return {
    applied: false,
    busy: false,
    overlay: "off",
    settlement,
    clearCode: false,
    navigate: null,
    operationId: null,
    stage: "idle",
    error,
    reactivation: null,
  };
}

export function classifyPhoneAuthError(error: unknown): PhoneAuthSettlement {
  if (error instanceof Error && error.message === "session_changed") return "session_changed";
  if (error instanceof AppError) {
    if (error.code === "invalid_otp") return "invalid";
    if (error.code === "otp_expired" || error.code === "session_expired") return "expired";
    if (error.code === "network") return "network";
  }
  return "account_failed";
}

export async function submitPhoneVerification<TProfile>(input: {
  ops: PhoneAuthOperations;
  code: string;
  confirm: () => Promise<TProfile>;
  continueAccount: (profile: TProfile) => Promise<
    | { navigate: "account" }
    | {
        navigate: "reactivation";
        reactivation: {
          phoneE164: string;
          deletionScheduledFor: string;
          deletionPolicyVersion: string;
          maskedEmail: string;
        };
      }
    | { navigate: null; settlement: "account_failed" | "session_changed"; error?: unknown }
  >;
  onAccepted?: (operationId: string) => void;
  confirmBoundMs?: number;
  accountBoundMs?: number;
}): Promise<PhoneVerificationView> {
  const accepted = input.ops.accept("confirm", input.confirmBoundMs ?? PHONE_NATIVE_CONFIRM_BOUND_MS);
  if (!accepted.accepted) return idleView("ignored");
  input.onAccepted?.(accepted.id);
  const confirmWork = input.confirm();
  let confirmed: { status: "ok"; value: TProfile } | { status: "unknown" } | { status: "cancelled" };
  try {
    confirmed = await input.ops.bounded(
      accepted.id,
      confirmWork,
      input.confirmBoundMs ?? PHONE_NATIVE_CONFIRM_BOUND_MS
    );
  } catch (error) {
    if (!input.ops.sameAttempt(accepted.id)) return { ...idleView("cancelled"), operationId: accepted.id, error };
    const settlement = classifyPhoneAuthError(error);
    input.ops.settle(accepted.id, "off");
    return {
      applied: true,
      busy: false,
      overlay: "off",
      settlement,
      clearCode: settlement === "invalid" || settlement === "expired",
      navigate: null,
      operationId: accepted.id,
      stage: "confirm",
      error,
      reactivation: null,
    };
  }
  if (confirmed.status === "cancelled") return { ...idleView("cancelled"), applied: false, operationId: accepted.id };
  if (confirmed.status === "unknown") {
    void confirmWork.then(
      () => undefined,
      () => undefined
    );
    input.ops.settle(accepted.id, "off");
    return {
      applied: input.ops.sameAttempt(accepted.id),
      busy: false,
      overlay: "off",
      settlement: "unknown",
      clearCode: false,
      navigate: null,
      operationId: accepted.id,
      stage: "confirm",
      error: null,
      reactivation: null,
    };
  }
  if (!input.ops.sameAttempt(accepted.id)) return { ...idleView("cancelled"), operationId: accepted.id };
  try {
    const continued = await input.ops.bounded(
      accepted.id,
      input.continueAccount(confirmed.value),
      input.accountBoundMs ?? PHONE_ACCOUNT_BOUND_MS
    );
    if (!input.ops.sameAttempt(accepted.id) || continued.status === "cancelled") {
      return { ...idleView("cancelled"), operationId: accepted.id };
    }
    if (continued.status === "unknown") {
      input.ops.settle(accepted.id, "off");
      return {
        applied: true,
        busy: false,
        overlay: "off",
        settlement: "unknown",
        clearCode: false,
        navigate: null,
        operationId: accepted.id,
        stage: "account",
        error: null,
        reactivation: null,
      };
    }
    const outcome = continued.value;
    if (outcome.navigate === null) {
      input.ops.settle(accepted.id, "off");
      return {
        applied: true,
        busy: false,
        overlay: "off",
        settlement: outcome.settlement,
        clearCode: false,
        navigate: null,
        operationId: accepted.id,
        stage: "account",
        error: outcome.error ?? null,
        reactivation: null,
      };
    }
    const revealed = input.ops.settle(accepted.id, outcome.navigate === "account" ? "success" : "off");
    if (!revealed) return { ...idleView("cancelled"), operationId: accepted.id };
    return {
      applied: true,
      busy: false,
      overlay: outcome.navigate === "account" ? "success" : "off",
      settlement: outcome.navigate === "account" ? "verified" : "reactivation",
      clearCode: true,
      navigate: outcome.navigate,
      operationId: accepted.id,
      stage: "session",
      error: null,
      reactivation: outcome.navigate === "reactivation" ? outcome.reactivation : null,
    };
  } catch (error) {
    if (!input.ops.sameAttempt(accepted.id)) return { ...idleView("cancelled"), operationId: accepted.id, error };
    const settlement = classifyPhoneAuthError(error);
    input.ops.settle(accepted.id, "off");
    return {
      applied: true,
      busy: false,
      overlay: "off",
      settlement,
      clearCode: settlement === "invalid" || settlement === "expired",
      navigate: null,
      operationId: accepted.id,
      stage: "confirm",
      error,
      reactivation: null,
    };
  }
}

export async function submitPhoneResend<T>(input: {
  ops: PhoneAuthOperations;
  invoke: boolean;
  forceResend: boolean;
  send: () => Promise<T>;
  boundMs?: number;
}): Promise<{ sent: boolean; ignored: boolean; unknown: boolean; value: T | null; operationId: string | null }> {
  if (!input.invoke || !input.forceResend) {
    return { sent: false, ignored: false, unknown: false, value: null, operationId: null };
  }
  const accepted = input.ops.accept("send", input.boundMs ?? PHONE_NATIVE_SEND_BOUND_MS);
  if (!accepted.accepted) return { sent: false, ignored: true, unknown: false, value: null, operationId: null };
  const work = input.send();
  let result: { status: "ok"; value: T } | { status: "unknown" } | { status: "cancelled" };
  try {
    result = await input.ops.bounded(accepted.id, work, input.boundMs ?? PHONE_NATIVE_SEND_BOUND_MS);
  } catch (error) {
    if (input.ops.sameAttempt(accepted.id)) input.ops.settle(accepted.id, "off");
    throw error;
  }
  if (result.status === "unknown") {
    void work.then(
      () => undefined,
      () => undefined
    );
    input.ops.settle(accepted.id, "off");
    return { sent: false, ignored: false, unknown: true, value: null, operationId: accepted.id };
  }
  if (result.status !== "ok" || !input.ops.sameAttempt(accepted.id)) {
    return { sent: false, ignored: false, unknown: false, value: null, operationId: accepted.id };
  }
  input.ops.settle(accepted.id, "off");
  return { sent: true, ignored: false, unknown: false, value: result.value, operationId: accepted.id };
}

export async function escapePhoneChallenge(input: {
  ops: PhoneAuthOperations;
  clear: () => Promise<void>;
  boundMs?: number;
  operationId?: string | null;
}): Promise<{ overlay: "off"; busy: false; storage: "ok" | "unknown" | "failed" }> {
  if (input.operationId == null || input.ops.sameAttempt(input.operationId)) input.ops.retire();
  const boundMs = input.boundMs ?? PHONE_CLEANUP_BOUND_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const result = await Promise.race([
      input.clear().then(() => "ok" as const),
      new Promise<"unknown">((resolve) => {
        timer = setTimeout(() => resolve("unknown"), boundMs);
      }),
    ]);
    return { overlay: "off", busy: false, storage: result };
  } catch {
    return { overlay: "off", busy: false, storage: "failed" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function openRestoredPhoneChallenge(input: {
  action: "resume" | "phone" | "stale";
  restored: boolean;
  expiresAt: number | null;
  resendAvailableAt: number | null;
  now: number;
}): { openOtp: boolean; expiresAt: number | null; resendAvailableAt: number | null } {
  if (input.action !== "resume" || !input.restored) {
    return { openOtp: false, expiresAt: input.expiresAt, resendAvailableAt: null };
  }
  if (typeof input.expiresAt !== "number" || !Number.isFinite(input.expiresAt) || input.expiresAt <= input.now) {
    return { openOtp: false, expiresAt: input.expiresAt, resendAvailableAt: null };
  }
  return {
    openOtp: true,
    expiresAt: input.expiresAt,
    resendAvailableAt: input.resendAvailableAt,
  };
}
