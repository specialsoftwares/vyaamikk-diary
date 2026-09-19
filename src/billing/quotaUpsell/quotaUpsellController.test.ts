import assert from "node:assert/strict";

import type { CanonicalSku, PurchaseFlowResult } from "@/billing/iap/iapTypes";
import { AppError } from "@/domain/errors";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";

import { createQuotaUpsellController } from "./quotaUpsellController";
import { __setQuotaUpsellEnabledForTests } from "./quotaUpsellGate";
import {
  notifyOrdinaryQuotaUpsell,
  registerQuotaUpsellPresenter,
} from "./notifyOrdinaryQuotaUpsell";
import type { QuotaUpsellRequest } from "./quotaUpsellTypes";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function run(): Promise<void> {
__setQuotaUpsellEnabledForTests(true);
syncSessionOwnership.resetForTests();
const sessionA1 = syncSessionOwnership.beginSession("uid-a");

const purchaseCalls: CanonicalSku[] = [];
const restoreCalls: number[] = [];
let purchaseImpl: () => Promise<PurchaseFlowResult> = async () => ({ kind: "sheet_launched" });
let restoreImpl: () => Promise<PurchaseFlowResult> = async () => ({ kind: "sheet_launched" });

const controller = createQuotaUpsellController({
  purchase: async (sku) => {
    purchaseCalls.push(sku);
    return purchaseImpl();
  },
  restorePurchases: async () => {
    restoreCalls.push(1);
    return restoreImpl();
  },
});

function quotaReq(over: Partial<QuotaUpsellRequest> = {}): QuotaUpsellRequest {
  return {
    family: "diary",
    origin: "user_save",
    clientRecordId: "diary_1",
    session: syncSessionOwnership.capture(),
    failureKind: "quota_exhausted",
    ...over,
  };
}

{
  const opened = controller.present(quotaReq({ session: sessionA1 }));
  assert.equal(opened.ok, true);
  assert.equal(opened.visible, true);
  assert.equal(controller.snapshot().clientRecordId, "diary_1");
}

{
  const dup = controller.present(quotaReq({ session: sessionA1, clientRecordId: "diary_1" }));
  assert.equal(dup.ok, false);
  assert.equal(dup.ok === false && dup.reason, "sheet_already_visible");
}

{
  const other = controller.present(
    quotaReq({ family: "purchase_order", clientRecordId: "po_1", session: sessionA1 })
  );
  assert.equal(other.ok, false);
  assert.equal(other.ok === false && other.reason, "other_sheet_visible");
}

{
  const denied = controller.present(
    quotaReq({
      failureKind: "permission_denied",
      error: new AppError("permission_denied", "rules"),
      clientRecordId: "diary_2",
    })
  );
  assert.equal(denied.visible, true);
  assert.equal(denied.ok, false);
}

{
  const net = controller.present(
    quotaReq({ failureKind: "network", clientRecordId: "diary_2" })
  );
  assert.equal(net.ok, false);
}

{
  const lh = controller.present(
    quotaReq({ family: "letterhead", clientRecordId: "lh_1" })
  );
  assert.equal(lh.ok, false);
  assert.equal(controller.snapshot().visible, true);
  assert.equal(controller.snapshot().clientRecordId, "diary_1");
}

{
  const result = await controller.purchase("vyd_starter_monthly");
  assert.equal(result.kind, "sheet_launched");
  assert.deepEqual(purchaseCalls, ["vyd_starter_monthly"]);
  assert.equal(restoreCalls.length, 0);
}

{
  purchaseImpl = async () => ({ kind: "failed", recoverable: true, message: "pay fail" });
  const failed = await controller.purchase("vyd_professional_yearly");
  assert.equal(failed.kind, "failed");
  assert.equal(controller.snapshot().hostErrorMessage, "pay fail");
  assert.equal(controller.snapshot().hostPurchaseState, "idle");
}

{
  const pendingGate = deferred<PurchaseFlowResult>();
  purchaseImpl = () => pendingGate.promise;
  restoreImpl = async () => ({ kind: "sheet_launched" });
  const first = controller.purchase("vyd_business_monthly");
  const dup = await controller.purchase("vyd_starter_yearly");
  const restoreBlocked = await controller.restore();
  assert.equal(dup.kind, "blocked_busy");
  assert.equal(restoreBlocked.kind, "blocked_busy");
  pendingGate.resolve({ kind: "store_pending" });
  const launched = await first;
  assert.equal(launched.kind, "store_pending");
  assert.equal(controller.snapshot().hostPurchaseState, "pending");
  assert.equal(purchaseCalls.filter((s) => s === "vyd_starter_yearly").length, 0);
  assert.equal(restoreCalls.length, 0);
}

controller.dismiss();
assert.equal(controller.snapshot().visible, false);
assert.equal(controller.snapshot().clientRecordId, "diary_1", "dismissal keeps the retry id");

{
  purchaseCalls.length = 0;
  restoreCalls.length = 0;
  const reopened = controller.present(quotaReq({ session: sessionA1, clientRecordId: "diary_1" }));
  assert.equal(reopened.ok, true);
  restoreImpl = async () => ({ kind: "verified" });
  const restored = await controller.restore();
  assert.equal(restored.kind, "verified");
  assert.equal(restoreCalls.length, 1);
  assert.equal(purchaseCalls.length, 0);
}

{
  const trial = controller.startTrial();
  assert.equal(trial.kind, "unsupported");
  assert.equal(controller.snapshot().trialCalls, 1);
}

{
  const sessionB = syncSessionOwnership.beginSession("uid-b");
  const staleDispatch = await controller.purchase("vyd_starter_monthly");
  assert.equal(staleDispatch.kind, "ignored_stale");
  const staleRestore = await controller.restore();
  assert.equal(staleRestore.kind, "ignored_stale");
  const fromB = controller.present(quotaReq({ session: sessionA1, clientRecordId: "from_a" }));
  assert.equal(fromB.ok, false);
  assert.equal(fromB.ok === false && fromB.reason, "session_stale");
  void sessionB;
}

{
  controller.dismiss();
  syncSessionOwnership.endSession();
  const sessionA2 = syncSessionOwnership.beginSession("uid-a");
  const afterRelogin = controller.present(
    quotaReq({ session: sessionA1, clientRecordId: "after_relogin" })
  );
  assert.equal(afterRelogin.ok, false);
  assert.equal(afterRelogin.ok === false && afterRelogin.reason, "session_stale");
  const live = controller.present(quotaReq({ session: sessionA2, clientRecordId: "live_a2" }));
  assert.equal(live.ok, true);

  const slow = deferred<PurchaseFlowResult>();
  purchaseImpl = () => slow.promise;
  const inflight = controller.purchase("vyd_starter_monthly");
  syncSessionOwnership.endSession();
  syncSessionOwnership.beginSession("uid-a");
  slow.resolve({ kind: "verified" });
  const ignored = await inflight;
  assert.equal(ignored.kind, "ignored_stale");
  assert.equal(controller.snapshot().hostPurchaseState, "idle");
}

{
  controller.dismiss();
  syncSessionOwnership.resetForTests();
  const sessionOwnerA = syncSessionOwnership.beginSession("uid-a");
  const openedA = controller.present(quotaReq({ session: sessionOwnerA, clientRecordId: "diary_a" }));
  assert.equal(openedA.ok, true);
  controller.openEducation();
  assert.equal(controller.snapshot().visible, true);
  assert.equal(controller.snapshot().educationOpen, true);

  const sessionOwnerB = syncSessionOwnership.beginSession("uid-b");
  assert.equal(controller.snapshot().visible, false, "A→B hides retired presentation");
  assert.equal(controller.snapshot().educationOpen, false);
  const staleOther = controller.present(
    quotaReq({ session: sessionOwnerA, clientRecordId: "from_a_after_b" })
  );
  assert.equal(staleOther.ok, false);
  const admittedB = controller.present(
    quotaReq({ session: sessionOwnerB, family: "purchase_order", clientRecordId: "po_b" })
  );
  assert.equal(admittedB.ok, true);
  assert.equal(controller.snapshot().visible, true);
  assert.equal(controller.snapshot().clientRecordId, "po_b");
  assert.equal(controller.snapshot().educationOpen, false);
}

{
  controller.dismiss();
  syncSessionOwnership.endSession();
  const sessionBeforeLogout = syncSessionOwnership.beginSession("uid-a");
  const first = controller.present(
    quotaReq({ session: sessionBeforeLogout, clientRecordId: "logout_a" })
  );
  assert.equal(first.ok, true);
  controller.openEducation();
  syncSessionOwnership.endSession();
  assert.equal(controller.snapshot().visible, false, "logout hides retired presentation");
  assert.equal(controller.snapshot().educationOpen, false);
  const sessionAfterLogin = syncSessionOwnership.beginSession("uid-a");
  assert.equal(controller.snapshot().visible, false);
  const staleA1 = controller.present(
    quotaReq({ session: sessionBeforeLogout, clientRecordId: "logout_a" })
  );
  assert.equal(staleA1.ok, false);
  const liveA2 = controller.present(
    quotaReq({ session: sessionAfterLogin, clientRecordId: "logout_a2" })
  );
  assert.equal(liveA2.ok, true);
  assert.equal(controller.snapshot().visible, true);
  assert.equal(controller.snapshot().educationOpen, false);
}

{
  controller.dismiss();
  syncSessionOwnership.resetForTests();
  const sessionAsync = syncSessionOwnership.beginSession("uid-a");
  const opened = controller.present(quotaReq({ session: sessionAsync, clientRecordId: "async_a" }));
  assert.equal(opened.ok, true);
  const launchedResult: PurchaseFlowResult = { kind: "sheet_launched" };
  purchaseImpl = async () => launchedResult;
  controller.sync({
    available: true,
    pending: null,
    purchaseInFlight: true,
    lastResult: launchedResult,
  });
  const launched = await controller.purchase("vyd_starter_monthly");
  assert.equal(launched.kind, "sheet_launched");
  assert.equal(controller.snapshot().hostErrorMessage, null);

  const asyncFailed: PurchaseFlowResult = {
    kind: "failed",
    recoverable: true,
    message: "Couldn't verify this purchase.",
  };
  controller.sync({
    available: true,
    pending: null,
    purchaseInFlight: false,
    lastResult: asyncFailed,
  });
  assert.equal(controller.snapshot().hostErrorMessage, "Couldn't verify this purchase.");
  assert.equal(controller.snapshot().errorRecoverable, true);
  assert.equal(controller.snapshot().hostPurchaseState, "idle");
  assert.equal(controller.snapshot().saveCalls, 0);

  controller.dismiss();
  const reopened = controller.present(quotaReq({ session: sessionAsync, clientRecordId: "async_a" }));
  assert.equal(reopened.ok, true);
  controller.sync({
    available: true,
    pending: null,
    purchaseInFlight: false,
    lastResult: asyncFailed,
  });
  assert.equal(controller.snapshot().hostErrorMessage, null, "acked failure is not replayed");

  const retryLaunched: PurchaseFlowResult = { kind: "sheet_launched" };
  purchaseImpl = async () => retryLaunched;
  const retried = await controller.purchase("vyd_starter_monthly");
  assert.equal(retried.kind, "sheet_launched");

  const sessionB = syncSessionOwnership.beginSession("uid-b");
  controller.sync({
    available: true,
    pending: null,
    purchaseInFlight: false,
    lastResult: asyncFailed,
  });
  assert.equal(controller.snapshot().visible, false);
  const admittedB = controller.present(
    quotaReq({ session: sessionB, family: "purchase_order", clientRecordId: "po_async_b" })
  );
  assert.equal(admittedB.ok, true);
  const bGate = deferred<PurchaseFlowResult>();
  purchaseImpl = () => bGate.promise;
  const bAttempt = controller.purchase("vyd_starter_yearly");
  assert.equal(controller.snapshot().hostPurchaseState, "loading");
  controller.sync({
    available: true,
    pending: null,
    purchaseInFlight: true,
    lastResult: asyncFailed,
  });
  assert.equal(controller.snapshot().hostPurchaseState, "loading", "A's lastResult must not clear B");
  assert.equal(controller.snapshot().hostErrorMessage, null);
  bGate.resolve({ kind: "sheet_launched" });
  const bResult = await bAttempt;
  assert.equal(bResult.kind, "sheet_launched");
  assert.equal(controller.snapshot().hostErrorMessage, null, "A's failure must not land on B");
}

{
  controller.dismiss();
  syncSessionOwnership.resetForTests();
  const sessionSame = syncSessionOwnership.beginSession("uid-a");
  assert.equal(
    controller.present(quotaReq({ session: sessionSame, clientRecordId: "record_first" })).ok,
    true
  );
  const firstPresentation = controller.snapshot().presentationId;
  const purchasesBefore = controller.snapshot().purchaseCalls.length;
  const firstLaunch: PurchaseFlowResult = { kind: "sheet_launched" };
  purchaseImpl = async () => firstLaunch;
  assert.equal((await controller.purchase("vyd_starter_monthly")).kind, "sheet_launched");
  assert.equal(controller.snapshot().purchaseCalls.length, purchasesBefore + 1);

  controller.dismiss();
  assert.equal(
    controller.present(quotaReq({ session: sessionSame, clientRecordId: "record_first" })).ok,
    true,
    "same record id after dismiss is a new presentation"
  );
  assert.notEqual(controller.snapshot().presentationId, firstPresentation);
  const lateFirstFailure: PurchaseFlowResult = {
    kind: "failed",
    recoverable: true,
    message: "Purchase didn't complete.",
  };
  controller.sync({
    available: true,
    pending: null,
    purchaseInFlight: false,
    lastResult: lateFirstFailure,
  });
  assert.equal(
    controller.snapshot().hostErrorMessage,
    null,
    "late error from a dismissed presentation does not attach to the reopened same record"
  );

  const secondLaunch: PurchaseFlowResult = { kind: "sheet_launched" };
  purchaseImpl = async () => secondLaunch;
  assert.equal((await controller.purchase("vyd_starter_monthly")).kind, "sheet_launched");
  assert.equal(controller.snapshot().purchaseCalls.length, purchasesBefore + 2);
  const ownFailure: PurchaseFlowResult = {
    kind: "failed",
    recoverable: true,
    message: "Couldn't verify this purchase.",
  };
  controller.sync({
    available: true,
    pending: null,
    purchaseInFlight: false,
    lastResult: ownFailure,
  });
  assert.equal(controller.snapshot().hostErrorMessage, "Couldn't verify this purchase.");
}

{
  controller.dismiss();
  syncSessionOwnership.resetForTests();
  const sessionDiff = syncSessionOwnership.beginSession("uid-a");
  assert.equal(
    controller.present(quotaReq({ session: sessionDiff, clientRecordId: "record_first" })).ok,
    true
  );
  purchaseImpl = async () => ({ kind: "sheet_launched" });
  assert.equal((await controller.purchase("vyd_starter_monthly")).kind, "sheet_launched");
  controller.dismiss();
  assert.equal(
    controller.present(quotaReq({ session: sessionDiff, clientRecordId: "record_second" })).ok,
    true
  );
  controller.sync({
    available: true,
    pending: null,
    purchaseInFlight: false,
    lastResult: {
      kind: "failed",
      recoverable: true,
      message: "Purchase didn't complete.",
    },
  });
  assert.equal(
    controller.snapshot().hostErrorMessage,
    null,
    "late error from record first does not attach to record second"
  );
}

{
  let hostOpens = 0;
  registerQuotaUpsellPresenter((request) => {
    hostOpens += 1;
    return controller.present(request);
  });
  const bg = notifyOrdinaryQuotaUpsell(
    quotaReq({ origin: "background_sync", clientRecordId: "bg_1" })
  );
  assert.equal(bg.ok, false);
  assert.equal(hostOpens, 0);
  registerQuotaUpsellPresenter(null);
}

__setQuotaUpsellEnabledForTests(null);
syncSessionOwnership.resetForTests();
console.log("quotaUpsellController.test.ts: ok");
}

void run().catch((e) => {
  console.error(e);
  process.exit(1);
});
