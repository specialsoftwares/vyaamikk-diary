/**
 * Mounted React quota-upsell host view.
 *
 * Renders production QuotaUpsellHostView with react-dom createRoot, injected
 * IAP/subscription/auth boundaries, and inert sheet/education surfaces.
 *
 * Boundaries:
 * - mocked: IAP purchase/restore/catalog, subscription snapshot, translator
 * - mounted: QuotaUpsellHostView (production runtime attach/reconcile)
 * - rendered: inert sheet/education callbacks, not UpgradeSheet native views
 * - emulator-tested: no
 * - device-tested: no
 */
import { createMountContainer } from "./quotaUpsellHost.fakeDom";
import assert from "node:assert/strict";

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { UseIapResult } from "@/billing/iap";
import type { CanonicalSku, CanonicalSkuAvailability, IapView, PurchaseFlowResult } from "@/billing/iap/iapTypes";
import { ALL_CANONICAL_SKUS } from "@/billing/iap/iapCatalog";
import { featuresForPlan } from "@/subscription/subscriptionFeatures";
import { DEFAULT_CLIENT_SUBSCRIPTION } from "@/subscription/types";
import { syncSessionOwnership } from "@/sync/syncSessionOwnership";
import {
  notifyOrdinaryQuotaUpsell,
  registerQuotaUpsellPresenter,
} from "./notifyOrdinaryQuotaUpsell";
import { __setQuotaUpsellEnabledForTests } from "./quotaUpsellGate";
import {
  QuotaUpsellHostView,
  type QuotaUpsellEducationSurfaceProps,
  type QuotaUpsellSheetSurfaceProps,
} from "./QuotaUpsellHostView";
import type { QuotaUpsellRequest } from "./quotaUpsellTypes";

const t = (key: string) => key;
const subscription = {
  status: DEFAULT_CLIENT_SUBSCRIPTION,
  plan: "free" as const,
  features: featuresForPlan("free"),
};

const readyCatalog: CanonicalSkuAvailability[] = ALL_CANONICAL_SKUS.map((sku) => ({
  canonicalSku: sku,
  available: true,
  unavailableReason: null,
  storeProductId: sku,
  displayPrice: `₹${sku}`,
  currency: "INR",
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function quotaReq(over: Partial<QuotaUpsellRequest> = {}): QuotaUpsellRequest {
  return {
    family: "diary",
    origin: "user_save",
    clientRecordId: "diary_react",
    session: syncSessionOwnership.capture(),
    failureKind: "quota_exhausted",
    ...over,
  };
}

function makeIap(over: Partial<IapView> = {}): UseIapResult & {
  catalogLoads: number;
} {
  const iap = {
    available: true,
    unavailableReason: null,
    connected: true,
    catalog: readyCatalog,
    pending: null,
    lastResult: null as IapView["lastResult"],
    purchaseInFlight: false,
    catalogLoads: 0,
    async loadCatalog() {
      iap.catalogLoads += 1;
    },
    async purchase(_sku: CanonicalSku): Promise<PurchaseFlowResult> {
      return { kind: "sheet_launched" };
    },
    async restorePurchases(): Promise<PurchaseFlowResult> {
      return { kind: "verified" };
    },
    ...over,
  };
  return iap;
}

async function run(): Promise<void> {
  __setQuotaUpsellEnabledForTests(true);
  syncSessionOwnership.resetForTests();

  const container = createMountContainer();
  const root: Root = createRoot(container);
  const sheets: QuotaUpsellSheetSurfaceProps[] = [];
  const education: QuotaUpsellEducationSurfaceProps[] = [];
  const purchaseCalls: string[] = [];
  let purchaseImpl: (sku: CanonicalSku) => Promise<PurchaseFlowResult> = async () => ({
    kind: "sheet_launched",
  });
  let restoreImpl: () => Promise<PurchaseFlowResult> = async () => ({ kind: "verified" });

  const purchase = async (sku: CanonicalSku) => {
    purchaseCalls.push(sku);
    return purchaseImpl(sku);
  };
  const restorePurchases = async () => restoreImpl();
  const iap = makeIap();
  iap.purchase = purchase;
  iap.restorePurchases = restorePurchases;

  let authStatus = "signed_in";
  let uid: string | null = "uid-a";

  function HostTree() {
    return React.createElement(
      QuotaUpsellHostView,
      {
        t,
        authStatus,
        uid,
        iap,
        subscription,
        renderSheet: (props) => {
          sheets.push(props);
          return null;
        },
        renderEducation: (props) => {
          education.push(props);
          return null;
        },
      },
      "child"
    );
  }

  async function render() {
    await act(async () => {
      root.render(React.createElement(HostTree));
    });
  }

  function latestSheet(): QuotaUpsellSheetSurfaceProps {
    const sheet = sheets[sheets.length - 1];
    assert.ok(sheet, "expected a mounted sheet surface");
    return sheet;
  }

  function latestEducation(): QuotaUpsellEducationSurfaceProps {
    const surface = education[education.length - 1];
    assert.ok(surface, "expected a mounted education surface");
    return surface;
  }

  await render();
  const sessionA = syncSessionOwnership.beginSession("uid-a");
  assert.equal(
    notifyOrdinaryQuotaUpsell(
      quotaReq({ family: "letterhead", clientRecordId: "lh_react", session: sessionA })
    ).ok,
    false
  );
  assert.equal(
    notifyOrdinaryQuotaUpsell(
      quotaReq({ origin: "background_sync", clientRecordId: "bg_react", session: sessionA })
    ).ok,
    false
  );
  assert.equal(latestSheet().visible, false);

  let opened = false;
  await act(async () => {
    opened = notifyOrdinaryQuotaUpsell(quotaReq({ session: sessionA })).ok;
  });
  assert.equal(opened, true);
  await render();
  const openSheet = latestSheet();
  assert.equal(openSheet.visible, true);
  assert.equal(openSheet.triggerContext, "recordLimitReached");
  assert.equal(openSheet.trialActionAvailable, false);
  assert.equal(openSheet.errorMessage, null);
  assert.equal(iap.catalogLoads >= 1, true);
  assert.equal(latestEducation().open, false);

  await act(async () => {
    latestSheet().onOpenBenefitEducation();
  });
  assert.equal(latestEducation().open, true);
  assert.equal(latestSheet().visible, false, "education replaces the sheet");
  await act(async () => {
    latestEducation().onContinue();
  });
  assert.equal(latestEducation().open, false);
  assert.equal(latestSheet().visible, true);

  await act(async () => {
    latestSheet().onOpenBenefitEducation();
  });
  await act(async () => {
    latestEducation().onClose();
  });
  assert.equal(latestEducation().open, false);

  const sessionB = syncSessionOwnership.beginSession("uid-b");
  authStatus = "signed_in";
  uid = "uid-b";
  await render();
  assert.equal(latestSheet().visible, false, "A→B retires mounted sheet");
  assert.equal(latestEducation().open, false);
  let admittedB = false;
  await act(async () => {
    admittedB = notifyOrdinaryQuotaUpsell(
      quotaReq({
        session: sessionB,
        family: "purchase_order",
        clientRecordId: "po_react",
      })
    ).ok;
  });
  assert.equal(admittedB, true);
  await render();
  assert.equal(latestSheet().visible, true);

  const gate = deferred<PurchaseFlowResult>();
  purchaseImpl = () => gate.promise;
  await act(async () => {
    latestSheet().onPurchase("vyd_starter_monthly");
  });
  assert.equal(latestSheet().purchaseState, "loading");
  assert.equal(latestSheet().errorRetryEnabled, false);
  gate.resolve({ kind: "sheet_launched" });
  await act(async () => {
    await Promise.resolve();
  });
  iap.purchaseInFlight = false;
  iap.lastResult = {
    kind: "failed",
    recoverable: true,
    message: "Couldn't verify this purchase.",
  };
  await render();
  const failed = latestSheet();
  assert.equal(failed.errorMessage, "Couldn't verify this purchase.");
  assert.equal(failed.errorRetryEnabled, true);
  assert.equal(failed.purchaseState, "idle");

  await act(async () => {
    latestSheet().onDismiss();
  });
  assert.equal(latestSheet().visible, false);
  let reopened = false;
  await act(async () => {
    reopened = notifyOrdinaryQuotaUpsell(
      quotaReq({
        session: sessionB,
        family: "purchase_order",
        clientRecordId: "po_react",
      })
    ).ok;
  });
  assert.equal(reopened, true);
  await render();
  assert.equal(latestSheet().errorMessage, null, "acked error is not replayed");
  assert.equal(latestSheet().visible, true);

  const restoreGate = deferred<PurchaseFlowResult>();
  restoreImpl = () => restoreGate.promise;
  await act(async () => {
    latestSheet().onRestore();
  });
  assert.equal(latestSheet().restoreState, "loading");
  restoreGate.resolve({ kind: "cancelled" });
  await act(async () => {
    await Promise.resolve();
  });
  assert.equal(latestSheet().restoreState, "idle");

  authStatus = "signed_out";
  uid = null;
  syncSessionOwnership.endSession();
  await render();
  assert.equal(latestSheet().visible, false, "logout retires mounted sheet");
  authStatus = "signed_in";
  uid = "uid-a";
  const sessionA2 = syncSessionOwnership.beginSession("uid-a");
  await render();
  assert.equal(latestSheet().visible, false);
  let live = false;
  await act(async () => {
    live = notifyOrdinaryQuotaUpsell(
      quotaReq({ session: sessionA2, clientRecordId: "diary_relogin_react" })
    ).ok;
  });
  assert.equal(live, true);
  await render();
  assert.equal(latestSheet().visible, true);
  assert.equal(latestEducation().open, false);

  await act(async () => {
    root.unmount();
  });
  registerQuotaUpsellPresenter(null);
  __setQuotaUpsellEnabledForTests(null);
  syncSessionOwnership.resetForTests();
  assert.equal(purchaseCalls.includes("vyd_starter_monthly"), true);
  console.log("quotaUpsellHost.react.mount.test.ts: ok");
}

void run().catch((error) => {
  console.error(error);
  process.exit(1);
});
