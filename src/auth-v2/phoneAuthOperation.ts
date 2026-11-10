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
import { routeAccountSetupFailure } from "@/services/auth/reactivationRouting";

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
  startedAt: number;
  /** Attempt start plus PHONE_AUTH_USER_BOUND_MS. Stages cannot run past this. */
  overallDeadline: number;
  deadline: number;
  busy: boolean;
  overlay: PhoneAuthOverlay;
};

export type PhoneAuthWait = (ms: number) => { promise: Promise<void>; cancel: () => void };

function defaultWait(ms: number): { promise: Promise<void>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout>;
  const promise = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return { promise, cancel: () => clearTimeout(timer!) };
}

export function isPhoneAttemptUnknown(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const details = (error as { details?: { phoneAuthSettlement?: unknown } }).details;
  return details?.phoneAuthSettlement === "unknown";
}

function attemptId(): string {
  const bytes = new Uint8Array(8);
  const cryptoRef = globalThis.crypto;
  if (cryptoRef?.getRandomValues) cryptoRef.getRandomValues(bytes);
  else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createPhoneAuthOperations(
  now: () => number = Date.now,
  wait: PhoneAuthWait = defaultWait
) {
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
    const startedAt = now();
    live = {
      id,
      generation,
      stage,
      startedAt,
      overallDeadline: startedAt + PHONE_AUTH_USER_BOUND_MS,
      deadline: startedAt + boundMs,
      busy: true,
      overlay: stage === "cleanup" ? "off" : "verifying",
    };
    return { accepted: true, id, generation };
  }

  function stageBudget(id: string, boundMs: number): number {
    if (!sameAttempt(id) || !live) return 0;
    return Math.min(boundMs, Math.max(0, live.overallDeadline - now()));
  }

  function attemptDeadline(id: string): number | null {
    if (!sameAttempt(id) || !live) return null;
    return live.overallDeadline;
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
    const limit = stageBudget(id, timeoutMs);
    if (!sameAttempt(id)) {
      void work.then(
        () => undefined,
        () => undefined
      );
      return { status: "cancelled" };
    }
    if (limit <= 0) {
      void work.then(
        () => undefined,
        () => undefined
      );
      return { status: "unknown" };
    }
    const handle = wait(limit);
    const observed = work.then((value) => ({ status: "ok" as const, value }));
    void observed.then(
      () => undefined,
      () => undefined
    );
    try {
      const result = await Promise.race([
        observed,
        handle.promise.then(() => ({ status: "unknown" as const })),
      ]);
      if (!sameAttempt(id) || live?.busy === false) return result.status === "ok" ? { status: "cancelled" } : result;
      return result;
    } finally {
      handle.cancel();
    }
  }

  return { accept, settle, retire, sameAttempt, view, armSuccess, bounded, stageBudget, attemptDeadline };
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
  if (isPhoneAttemptUnknown(error)) return "unknown";
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
  phoneE164?: string;
  prepareSession?: () => Promise<void>;
}): Promise<PhoneVerificationView> {
  const accepted = input.ops.accept("confirm", input.confirmBoundMs ?? PHONE_NATIVE_CONFIRM_BOUND_MS);
  if (!accepted.accepted) return idleView("ignored");
  input.onAccepted?.(accepted.id);
  const confirmWork = input.confirm();
  const failureView = (error: unknown): PhoneVerificationView => {
    const pending = routeAccountSetupFailure({
      error,
      stillCurrent: input.ops.sameAttempt(accepted.id),
      fallbackPhoneE164: input.phoneE164 ?? "",
    });
    if (pending.kind === "stale") {
      return { ...idleView("cancelled", error), operationId: accepted.id };
    }
    if (pending.kind === "reactivation") {
      input.ops.settle(accepted.id, "off");
      return {
        applied: true,
        busy: false,
        overlay: "off",
        settlement: "reactivation",
        clearCode: false,
        navigate: "reactivation",
        operationId: accepted.id,
        stage: "confirm",
        error,
        reactivation: pending.params,
      };
    }
    const settlement = classifyPhoneAuthError(error);
    if (settlement === "unknown") {
      input.ops.settle(accepted.id, "off");
      return {
        applied: true,
        busy: false,
        overlay: "off",
        settlement: "unknown",
        clearCode: false,
        navigate: null,
        operationId: accepted.id,
        stage: "session",
        error,
        reactivation: null,
      };
    }
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
  };
  let confirmed: { status: "ok"; value: TProfile } | { status: "unknown" } | { status: "cancelled" };
  try {
    confirmed = await input.ops.bounded(
      accepted.id,
      confirmWork,
      input.confirmBoundMs ?? PHONE_NATIVE_CONFIRM_BOUND_MS
    );
  } catch (error) {
    if (!input.ops.sameAttempt(accepted.id)) return { ...idleView("cancelled"), operationId: accepted.id, error };
    return failureView(error);
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
    const accountWork = input.continueAccount(confirmed.value);
    const continued = await input.ops.bounded(
      accepted.id,
      accountWork,
      input.accountBoundMs ?? PHONE_ACCOUNT_BOUND_MS
    );
    if (!input.ops.sameAttempt(accepted.id) || continued.status === "cancelled") {
      return { ...idleView("cancelled"), operationId: accepted.id };
    }
    if (continued.status === "unknown") {
      void accountWork.then(
        () => undefined,
        () => undefined
      );
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
    if (outcome.navigate === "account" && input.prepareSession) {
      const sessionWork = input.prepareSession();
      const prepared = await input.ops.bounded(
        accepted.id,
        sessionWork,
        PHONE_SESSION_BOUND_MS
      );
      if (!input.ops.sameAttempt(accepted.id) || prepared.status === "cancelled") {
        return { ...idleView("cancelled"), operationId: accepted.id };
      }
      if (prepared.status === "unknown") {
        void sessionWork.then(
          () => undefined,
          () => undefined
        );
        input.ops.settle(accepted.id, "off");
        return {
          applied: true,
          busy: false,
          overlay: "off",
          settlement: "unknown",
          clearCode: false,
          navigate: null,
          operationId: accepted.id,
          stage: "session",
          error: null,
          reactivation: null,
        };
      }
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
    return failureView(error);
  }
}

export async function raceOwnedPublication<T>(input: {
  budgetMs: number;
  wait?: PhoneAuthWait;
  retireClaim: () => void;
  run: () => Promise<T>;
}): Promise<{ status: "ok"; value: T } | { status: "unknown" }> {
  const wait = input.wait ?? defaultWait;
  if (input.budgetMs <= 0) {
    input.retireClaim();
    void input.run().then(
      () => undefined,
      () => undefined
    );
    return { status: "unknown" };
  }
  const handle = wait(input.budgetMs);
  let won = false;
  const observed = input.run().then((value) => ({ status: "ok" as const, value }));
  void observed.then(
    () => undefined,
    () => undefined
  );
  try {
    const result = await Promise.race([
      observed,
      handle.promise.then(() => {
        if (!won) input.retireClaim();
        return { status: "unknown" as const };
      }),
    ]);
    won = true;
    return result;
  } finally {
    handle.cancel();
  }
}

export async function leaveAuthenticatedPhoneChallenge(input: {
  stillCurrent: () => boolean;
  navigate: () => void;
  clear: () => Promise<void>;
  boundMs?: number;
  wait?: PhoneAuthWait;
}): Promise<"left" | "stale"> {
  if (!input.stillCurrent()) return "stale";
  input.navigate();
  const wait = input.wait ?? defaultWait;
  const handle = wait(input.boundMs ?? PHONE_CLEANUP_BOUND_MS);
  try {
    await Promise.race([
      input.clear().then(
        () => "ok" as const,
        () => "failed" as const
      ),
      handle.promise.then(() => "timeout" as const),
    ]);
  } catch {
    // Navigation already happened. A rejected cleanup must not strand the user.
  } finally {
    handle.cancel();
  }
  return "left";
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
