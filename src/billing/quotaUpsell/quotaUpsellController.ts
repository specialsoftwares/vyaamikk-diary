/**
 * Session-bound quota upsell controller.
 *
 * Presentation-only: purchase/restore go to the existing IAP callbacks.
 * A purchase result never writes entitlement. Trial start is unsupported.
 * Stale callbacks never recapture the live session or mutate a newer attempt.
 */

import type { CanonicalSku, IapView, PurchaseFlowResult } from "@/billing/iap/iapTypes";
import type { UpgradeOperationState } from "@/components/billing/upgradeTypes";
import { syncSessionOwnership, type SyncSessionToken } from "@/sync/syncSessionOwnership";

import { decideQuotaUpsellEligibility } from "./quotaUpsellDecision";
import { asCanonicalPurchaseSku } from "./mapUpgradeSheetModel";
import type { QuotaUpsellDecision, QuotaUpsellRequest } from "./quotaUpsellTypes";

export type QuotaUpsellPresentResult = QuotaUpsellDecision & {
  visible: boolean;
  clientRecordId: string | null;
};

export type QuotaUpsellActionResult =
  | PurchaseFlowResult
  | { kind: "ignored_stale" }
  | { kind: "blocked_busy" }
  | { kind: "unsupported" }
  | { kind: "invalid_sku" };

export interface QuotaUpsellControllerDeps {
  purchase: (sku: CanonicalSku) => Promise<PurchaseFlowResult>;
  restorePurchases: () => Promise<PurchaseFlowResult>;
}

type AttemptKind = "purchase" | "restore";

type Attempt = {
  id: number;
  kind: AttemptKind;
  presentationId: number;
  session: SyncSessionToken | null;
  callbackReturned: boolean;
};

export type QuotaUpsellIapSlice = Pick<
  IapView,
  "available" | "pending" | "purchaseInFlight" | "lastResult"
>;

export type QuotaUpsellSnapshot = {
  visible: boolean;
  educationOpen: boolean;
  presentationId: number;
  clientRecordId: string | null;
  session: SyncSessionToken | null;
  hostPurchaseState: UpgradeOperationState;
  hostRestoreState: UpgradeOperationState;
  inFlightKind: AttemptKind | null;
  hostErrorMessage: string | null;
  errorRecoverable: boolean;
  attemptId: number | null;
  purchaseCalls: CanonicalSku[];
  restoreCalls: number;
  trialCalls: number;
  saveCalls: number;
};

export interface QuotaUpsellController {
  present(request: QuotaUpsellRequest): QuotaUpsellPresentResult;
  dismiss(): void;
  sync(iap: QuotaUpsellIapSlice): void;
  purchase(sku: string): Promise<QuotaUpsellActionResult>;
  restore(): Promise<QuotaUpsellActionResult>;
  startTrial(): QuotaUpsellActionResult;
  openEducation(): void;
  closeEducation(): void;
  snapshot(): QuotaUpsellSnapshot;
}

function isBusy(state: UpgradeOperationState): boolean {
  return state === "loading" || state === "pending";
}

function durablePending(iap: QuotaUpsellIapSlice): boolean {
  const stage = iap.pending?.stage;
  return stage === "store_pending" || stage === "verifying";
}

function iapSettled(iap: QuotaUpsellIapSlice): boolean {
  return !iap.purchaseInFlight && !durablePending(iap);
}

function failureMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Purchase could not be completed.";
}

function applyResultState(result: PurchaseFlowResult): {
  state: UpgradeOperationState;
  error: string | null;
  recoverable: boolean;
} {
  if (result.kind === "store_pending" || result.kind === "verified_unfinished_ios") {
    return { state: "pending", error: null, recoverable: false };
  }
  if (result.kind === "unavailable") {
    return { state: "unavailable", error: null, recoverable: false };
  }
  if (result.kind === "already_in_flight") {
    return { state: "loading", error: null, recoverable: false };
  }
  if (result.kind === "failed") {
    return { state: "idle", error: result.message, recoverable: result.recoverable };
  }
  return { state: "idle", error: null, recoverable: false };
}

export function createQuotaUpsellController(
  deps: QuotaUpsellControllerDeps
): QuotaUpsellController {
  let held = false;
  let educationHeld = false;
  let presentationId = 0;
  let clientRecordId: string | null = null;
  let originSession: SyncSessionToken | null = null;
  let hostPurchaseState: UpgradeOperationState = "idle";
  let hostRestoreState: UpgradeOperationState = "idle";
  let hostErrorMessage: string | null = null;
  let errorRecoverable = false;
  let currentAttempt: Attempt | null = null;
  let attemptSeq = 0;
  let latestIap: QuotaUpsellIapSlice | null = null;
  let ackedIapResult: PurchaseFlowResult | null = null;
  const purchaseCalls: CanonicalSku[] = [];
  let restoreCalls = 0;
  let trialCalls = 0;

  function presented(): boolean {
    return held && syncSessionOwnership.isCurrent(originSession);
  }

  function educationOpen(): boolean {
    return educationHeld && presented();
  }

  function awaitingCallback(): boolean {
    return currentAttempt != null && !currentAttempt.callbackReturned;
  }

  function keepIssuedStoreBusy(): boolean {
    return awaitingCallback() && syncSessionOwnership.isCurrent(currentAttempt?.session ?? null);
  }

  function storeBusyForDispatch(): boolean {
    if (keepIssuedStoreBusy() && presented()) return true;
    if (!presented()) return false;
    return isBusy(hostPurchaseState) || isBusy(hostRestoreState);
  }

  function idleHostOperations(): void {
    if (isBusy(hostPurchaseState)) hostPurchaseState = "idle";
    if (isBusy(hostRestoreState)) hostRestoreState = "idle";
  }

  function ackIapResult(result: PurchaseFlowResult | null | undefined): void {
    ackedIapResult = result ?? null;
  }

  function ackLatestIapResult(): void {
    ackIapResult(latestIap?.lastResult ?? ackedIapResult);
  }

  /**
   * A purchase() callback may return sheet_launched while IAP is still active.
   * A later IapView.lastResult failed must appear once on the owning live
   * presentation. Do not replay an already-acked lastResult on reopen.
   */
  function publishAsyncIapFailureIfOwned(iap: QuotaUpsellIapSlice): void {
    const result = iap.lastResult;
    if (result == null || result === ackedIapResult) return;
    if (result.kind !== "failed") {
      ackIapResult(result);
      return;
    }
    const attempt = currentAttempt;
    if (attempt != null && !attempt.callbackReturned && syncSessionOwnership.isCurrent(attempt.session)) {
      return;
    }
    if (
      !presented() ||
      attempt == null ||
      !attempt.callbackReturned ||
      !syncSessionOwnership.isCurrent(attempt.session)
    ) {
      ackIapResult(result);
      return;
    }
    if (!durablePending(iap)) {
      if (attempt.kind === "purchase") hostPurchaseState = "idle";
      else hostRestoreState = "idle";
    }
    hostErrorMessage = result.message;
    errorRecoverable = result.recoverable;
    ackIapResult(result);
  }

  function retirePresentation(): void {
    held = false;
    educationHeld = false;
    hostErrorMessage = null;
    errorRecoverable = false;
    presentationId += 1;
    if (!keepIssuedStoreBusy()) {
      idleHostOperations();
    }
  }

  function finishAttempt(attempt: Attempt, result: PurchaseFlowResult): QuotaUpsellActionResult {
    if (currentAttempt?.id !== attempt.id) {
      ackLatestIapResult();
      return { kind: "ignored_stale" };
    }
    currentAttempt = { ...attempt, callbackReturned: true };
    if (
      attempt.presentationId !== presentationId ||
      !syncSessionOwnership.isCurrent(attempt.session) ||
      !presented()
    ) {
      idleHostOperations();
      ackLatestIapResult();
      return { kind: "ignored_stale" };
    }
    const applied = applyResultState(result);
    if (attempt.kind === "purchase") {
      hostPurchaseState = applied.state;
    } else {
      hostRestoreState = applied.state;
    }
    hostErrorMessage = applied.error;
    errorRecoverable = applied.recoverable;
    ackIapResult(latestIap?.lastResult ?? result);
    return result;
  }

  async function runAttempt(
    kind: AttemptKind,
    action: () => Promise<PurchaseFlowResult>
  ): Promise<QuotaUpsellActionResult> {
    if (!presented()) return { kind: "ignored_stale" };
    if (storeBusyForDispatch()) return { kind: "blocked_busy" };
    const attempt: Attempt = {
      id: (attemptSeq += 1),
      kind,
      presentationId,
      session: originSession,
      callbackReturned: false,
    };
    currentAttempt = attempt;
    hostErrorMessage = null;
    errorRecoverable = false;
    ackLatestIapResult();
    if (kind === "purchase") hostPurchaseState = "loading";
    else hostRestoreState = "loading";
    let result: PurchaseFlowResult;
    try {
      result = await action();
    } catch (error) {
      result = { kind: "failed", recoverable: true, message: failureMessage(error) };
    }
    return finishAttempt(attempt, result);
  }

  return {
    present(request) {
      if (held && !presented()) {
        retirePresentation();
      }
      const eligibility = decideQuotaUpsellEligibility(request);
      if (!eligibility.ok) {
        return { ...eligibility, visible: presented(), clientRecordId };
      }
      const id = request.clientRecordId as string;
      if (presented() && clientRecordId === id) {
        return { ok: false, reason: "sheet_already_visible", visible: true, clientRecordId };
      }
      if (presented() && clientRecordId !== id) {
        return { ok: false, reason: "other_sheet_visible", visible: true, clientRecordId };
      }
      held = true;
      educationHeld = false;
      presentationId += 1;
      clientRecordId = id;
      originSession = request.session;
      hostErrorMessage = null;
      errorRecoverable = false;
      ackLatestIapResult();
      if (!keepIssuedStoreBusy()) {
        idleHostOperations();
      }
      return { ok: true, visible: true, clientRecordId };
    },

    dismiss() {
      retirePresentation();
    },

    sync(iap) {
      latestIap = iap;
      if (held && !syncSessionOwnership.isCurrent(originSession)) {
        retirePresentation();
      }
      if (hostPurchaseState === "unavailable" && iap.available) {
        hostPurchaseState = "idle";
      }
      if (hostRestoreState === "unavailable" && iap.available) {
        hostRestoreState = "idle";
      }
      publishAsyncIapFailureIfOwned(iap);
      if (iapSettled(iap) && !awaitingCallback()) {
        if (hostPurchaseState === "loading" || hostPurchaseState === "pending") {
          hostPurchaseState = "idle";
        }
        if (hostRestoreState === "loading" || hostRestoreState === "pending") {
          hostRestoreState = "idle";
        }
      }
    },

    async purchase(sku) {
      const canonical = asCanonicalPurchaseSku(sku);
      if (!presented()) return { kind: "ignored_stale" };
      if (storeBusyForDispatch()) return { kind: "blocked_busy" };
      if (!canonical) return { kind: "invalid_sku" };
      purchaseCalls.push(canonical);
      return runAttempt("purchase", () => deps.purchase(canonical));
    },

    async restore() {
      if (!presented()) return { kind: "ignored_stale" };
      if (storeBusyForDispatch()) return { kind: "blocked_busy" };
      restoreCalls += 1;
      return runAttempt("restore", () => deps.restorePurchases());
    },

    startTrial() {
      trialCalls += 1;
      return { kind: "unsupported" };
    },

    openEducation() {
      if (!presented()) return;
      educationHeld = true;
    },

    closeEducation() {
      educationHeld = false;
    },

    snapshot() {
      const visible = presented();
      const attempt = currentAttempt;
      const liveInFlight =
        attempt != null &&
        !attempt.callbackReturned &&
        syncSessionOwnership.isCurrent(attempt.session);
      return {
        visible,
        educationOpen: educationOpen(),
        presentationId,
        clientRecordId,
        session: originSession,
        hostPurchaseState,
        hostRestoreState,
        inFlightKind: liveInFlight
          ? attempt.kind
          : visible && isBusy(hostPurchaseState)
            ? "purchase"
            : visible && isBusy(hostRestoreState)
              ? "restore"
              : null,
        hostErrorMessage: visible ? hostErrorMessage : null,
        errorRecoverable: visible && errorRecoverable,
        attemptId: attempt?.id ?? null,
        purchaseCalls: [...purchaseCalls],
        restoreCalls,
        trialCalls,
        saveCalls: 0,
      };
    },
  };
}
