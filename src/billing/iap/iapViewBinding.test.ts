/**
 * Zero-frame IAP owner binding. Pure helper — no React test renderer.
 */
import assert from "node:assert/strict";

import {
  bindIapViewToAuth,
  iapSessionActionAllowed,
  runGuardedIapAction,
} from "./iapViewBinding";
import type { IapView, PurchaseFlowResult } from "./iapTypes";

function paidPendingView(ownerUid: string): IapView {
  return {
    ownerUid,
    available: true,
    unavailableReason: null,
    connected: true,
    catalog: [
      {
        canonicalSku: "vyd_professional_yearly",
        available: true,
        unavailableReason: null,
        storeProductId: "vyd_professional",
        androidBasePlanId: "yearly",
        displayPrice: "₹store-yearly",
        currency: "INR",
        androidOfferToken: "token-yearly",
      },
    ],
    pending: {
      version: 1,
      uid: ownerUid,
      platform: "android",
      canonicalSku: "vyd_professional_yearly",
      productId: "vyd_professional",
      androidBasePlanId: "yearly",
      stage: "store_pending",
      initiatedAt: 1,
      updatedAt: 1,
    },
    lastResult: { kind: "store_pending" },
    purchaseInFlight: true,
  };
}

async function main() {
  {
    const exposed = bindIapViewToAuth({
      view: paidPendingView("uid-a"),
      authStatus: "signed_in",
      authUid: "uid-b",
    });
    assert.equal(exposed.pending, null);
    assert.equal(exposed.purchaseInFlight, false);
    assert.equal(exposed.catalog.length, 0);
    assert.equal(exposed.available, false);
    assert.equal(exposed.lastResult, null);
    assert.equal(exposed.ownerUid, "uid-b");
    assert.equal(exposed.available, false);
  }

  {
    const exposed = bindIapViewToAuth({
      view: paidPendingView("uid-a"),
      authStatus: "signed_out",
      authUid: null,
    });
    assert.equal(exposed.pending, null);
    assert.equal(exposed.purchaseInFlight, false);
    assert.equal(exposed.ownerUid, null);
    assert.equal(exposed.available, false);
  }

  {
    const view = paidPendingView("uid-a");
    const exposed = bindIapViewToAuth({
      view,
      authStatus: "signed_in",
      authUid: "uid-a",
    });
    assert.equal(exposed, view);
    assert.equal(exposed.pending?.uid, "uid-a");
    assert.equal(exposed.purchaseInFlight, true);
  }

  assert.equal(
    iapSessionActionAllowed({ activeUid: "uid-b", sessionOwnerUid: "uid-a" }),
    false
  );
  assert.equal(
    iapSessionActionAllowed({ activeUid: null, sessionOwnerUid: "uid-a" }),
    false
  );
  assert.equal(
    iapSessionActionAllowed({ activeUid: "uid-a", sessionOwnerUid: "uid-a" }),
    true
  );

  {
    let purchases = 0;
    const blocked = await runGuardedIapAction<PurchaseFlowResult>({
      activeUid: "uid-b",
      sessionOwnerUid: "uid-a",
      blockedResult: { kind: "unavailable", reason: "not_signed_in" },
      action: async () => {
        purchases += 1;
        return { kind: "sheet_launched" };
      },
    });
    assert.equal(blocked.kind, "unavailable");
    assert.equal(purchases, 0);
  }

  {
    let purchases = 0;
    const blocked = await runGuardedIapAction<PurchaseFlowResult>({
      activeUid: null,
      sessionOwnerUid: "uid-a",
      blockedResult: { kind: "unavailable", reason: "not_signed_in" },
      action: async () => {
        purchases += 1;
        return { kind: "sheet_launched" };
      },
    });
    assert.equal(blocked.kind, "unavailable");
    assert.equal(purchases, 0);
  }

  {
    let restores = 0;
    const blocked = await runGuardedIapAction<PurchaseFlowResult>({
      activeUid: null,
      sessionOwnerUid: "uid-a",
      blockedResult: { kind: "unavailable", reason: "not_signed_in" },
      action: async () => {
        restores += 1;
        return { kind: "verified" };
      },
    });
    assert.equal(blocked.kind, "unavailable");
    assert.equal(restores, 0);
  }

  {
    let purchases = 0;
    const allowed = await runGuardedIapAction<PurchaseFlowResult>({
      activeUid: "uid-a",
      sessionOwnerUid: "uid-a",
      blockedResult: { kind: "unavailable", reason: "not_signed_in" },
      action: async () => {
        purchases += 1;
        return { kind: "sheet_launched" };
      },
    });
    assert.equal(allowed.kind, "sheet_launched");
    assert.equal(purchases, 1);
  }

  console.log("iapViewBinding.test.ts: ok");
}

main();
