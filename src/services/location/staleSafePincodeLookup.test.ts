/**
 * Stale-safe interactive PIN lookup + mocked resolver contracts.
 * Does not call live postal APIs or load india-pincode.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { applyPinLookupResult, nextPinLookupRequestId } from "@/onboarding/pinConfirmation";
import { lookupPostalPincodeApi } from "@/services/location/postalPincodeApi";
import {
  applyLatestPinAutofill,
  createStaleSafePincodeLookup,
  EMPTY_PIN_AUTOFILL,
  pinAutofillStateAfterUserEdit,
  pinAutofillStateFromLoaded,
} from "@/services/location/staleSafePincodeLookup";
import {
  isValidIndianPincode,
  normalizeIndianPinInput,
} from "@/domain/indianPincodeInput";
import { shouldQueryOfflinePincodeOnInteractivePath } from "@/services/location/pincodeWarmPolicy";
import type { PincodeResolution } from "@/domain/indianPostal";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolution(
  pin: string,
  extra: Partial<PincodeResolution> = {}
): PincodeResolution {
  return {
    pinCode: pin,
    success: true,
    source: "api",
    localities: extra.localities ?? ["Office"],
    defaultLocality: extra.defaultLocality ?? extra.localities?.[0] ?? "Office",
    district: extra.district ?? "District",
    state: extra.state ?? "State",
    country: "India",
    ...extra,
  };
}

async function test201016Fixture(): Promise<void> {
  const requestId = nextPinLookupRequestId();
  const next = applyPinLookupResult({
    requestId,
    latestRequestId: requestId,
    pinCode: "201016",
    currentPinCode: "201016",
    resolution: {
      pinCode: "201016",
      success: true,
      source: "api",
      localities: ["Crossing Republik"],
      defaultLocality: "Crossing Republik",
      district: "Ghaziabad",
      state: "Uttar Pradesh",
      country: "India",
    },
  });
  assert.equal(next?.status, "ready_to_confirm");
  if (next?.status === "ready_to_confirm") {
    assert.equal(next.locality, "Crossing Republik");
    assert.equal(next.district, "Ghaziabad");
    assert.equal(next.state, "Uttar Pradesh");
  }
}

async function testOtherValidPinViaMockedFetch(): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        {
          Status: "Success",
          PostOffice: [
            {
              Name: "Connaught Place",
              District: "New Delhi",
              State: "Delhi",
              Country: "India",
              Pincode: "110001",
            },
          ],
        },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;
  try {
    const result = await lookupPostalPincodeApi("110001", { timeoutMs: 500 });
    assert.equal(result.classification, "success");
    assert.equal(result.district, "New Delhi");
    assert.equal(result.state, "Delhi");
    assert.ok(result.locality?.includes("Connaught"));
  } finally {
    globalThis.fetch = original;
  }
}

async function testNotFoundAndPartial(): Promise<void> {
  assert.equal(isValidIndianPincode(normalizeIndianPinInput("20101")), false);
  assert.equal(normalizeIndianPinInput("201016"), "201016");

  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify([{ Status: "Error", PostOffice: null }]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
  try {
    const result = await lookupPostalPincodeApi("999999", { timeoutMs: 500 });
    assert.equal(result.classification, "not-found");
    assert.equal(result.resolution.success, false);
  } finally {
    globalThis.fetch = original;
  }
}

async function testRapidPinAThenB(): Promise<void> {
  const lookup = createStaleSafePincodeLookup(async (pin) => {
    await sleep(pin === "201016" ? 40 : 5);
    if (pin === "201016") {
      return resolution(pin, {
        localities: ["Crossing Republik"],
        defaultLocality: "Crossing Republik",
        district: "Ghaziabad",
        state: "Uttar Pradesh",
      });
    }
    return resolution(pin, {
      localities: ["Connaught Place"],
      defaultLocality: "Connaught Place",
      district: "New Delhi",
      state: "Delhi",
    });
  });

  const first = lookup.lookup("201016");
  const second = lookup.lookup("110001");
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a, null, "slower PIN A must not remain authoritative");
  assert.ok(b);
  assert.equal(b.pinCode, "110001");
  assert.equal(b.district, "New Delhi");
}

function testPinAutofillProvenance(): void {
  const empty = applyLatestPinAutofill({
    current: "",
    resolved: "Uttar Pradesh",
    pin: "201016",
    field: { ...EMPTY_PIN_AUTOFILL },
  });
  assert.equal(empty.value, "Uttar Pradesh");
  assert.equal(empty.field.provenance, "auto");
  assert.equal(empty.field.pinWhenSet, "201016");

  const replaceAuto = applyLatestPinAutofill({
    current: "Uttar Pradesh",
    resolved: "Delhi",
    pin: "110001",
    field: { provenance: "auto", pinWhenSet: "201016" },
  });
  assert.equal(replaceAuto.value, "Delhi", "new PIN must replace a previous auto-fill");
  assert.equal(replaceAuto.field.pinWhenSet, "110001");

  const keepManualSamePin = applyLatestPinAutofill({
    current: "Maharashtra",
    resolved: "Uttar Pradesh",
    pin: "201016",
    field: pinAutofillStateAfterUserEdit("Maharashtra", "201016"),
  });
  assert.equal(keepManualSamePin.value, "Maharashtra");
  assert.equal(keepManualSamePin.field.provenance, "manual");

  const loaded = pinAutofillStateFromLoaded("Uttar Pradesh", "201016");
  const keepLoadedSamePin = applyLatestPinAutofill({
    current: "Uttar Pradesh",
    resolved: "Ghaziabad-wrong",
    pin: "201016",
    field: loaded,
  });
  assert.equal(
    keepLoadedSamePin.value,
    "Uttar Pradesh",
    "opening an existing record must not clobber saved state for the same PIN"
  );

  const loadedThenNewPin = applyLatestPinAutofill({
    current: "Uttar Pradesh",
    resolved: "Delhi",
    pin: "110001",
    field: loaded,
  });
  assert.equal(
    loadedThenNewPin.value,
    "Delhi",
    "changing PIN must still let the latest lookup replace a leftover saved state"
  );

  const cleared = pinAutofillStateAfterUserEdit("", "201016");
  const refillAfterClear = applyLatestPinAutofill({
    current: "",
    resolved: "Uttar Pradesh",
    pin: "201016",
    field: cleared,
  });
  assert.equal(refillAfterClear.value, "Uttar Pradesh");
  assert.equal(refillAfterClear.field.provenance, "auto");
}

function testInteractiveCallersUseGuards(): void {
  assert.equal(shouldQueryOfflinePincodeOnInteractivePath(false), false);

  const hook = readFileSync(join(root, "src/hooks/useIndianPincodeField.ts"), "utf8");
  assert.match(hook, /requestIdRef/);
  assert.match(hook, /if \(requestIdRef\.current !== id\) return/);

  const identity = readFileSync(
    join(root, "src/auth-v2/screens/BusinessIdentityScreen.tsx"),
    "utf8"
  );
  assert.match(identity, /applyPinLookupResult/);
  assert.match(identity, /latestPinRequestIdRef/);

  const review = readFileSync(
    join(root, "src/auth-v2/screens/ReviewSectionEditorScreen.tsx"),
    "utf8"
  );
  assert.match(review, /applyPinLookupResult/);
  assert.match(review, /pinRequestId/);

  const po = readFileSync(join(root, "app/(app)/purchase-order/form.tsx"), "utf8");
  const credit = readFileSync(join(root, "app/(app)/customer-credit/form.tsx"), "utf8");
  assert.match(po, /createStaleSafePincodeLookup/);
  assert.match(credit, /createStaleSafePincodeLookup/);
  assert.match(po, /applyLatestPinAutofill/);
  assert.match(credit, /applyLatestPinAutofill/);
  assert.doesNotMatch(
    po,
    /setVendorState\(r\.state\)/,
    "PO must not unconditionally overwrite an editable vendor state"
  );
  assert.doesNotMatch(po, /setBuyerState\(r\.state\)/);
  assert.doesNotMatch(credit, /setCustomerState\(r\.state\)/);
  assert.doesNotMatch(credit, /setCity\(r\.district\)/);
  assert.doesNotMatch(
    po,
    /vendorPinResolved\.current = pin;\s*void resolveIndianPincode/,
    "PO must not mark PIN resolved before the lookup finishes"
  );
  assert.doesNotMatch(credit, /customerPinResolved\.current = pin;/);
  assert.doesNotMatch(
    po,
    /prev\.trim\(\) \|\| r\.state/,
    "must not restore first-fill-wins (stale PIN A would beat PIN B)"
  );
  assert.doesNotMatch(credit, /prev\.trim\(\) \|\| r\.state/);
  assert.doesNotMatch(
    po,
    /shipPinLookup|shipPinResolved/,
    "shipping PIN is manual entry only — not an auto-resolve path"
  );
  assert.match(po, /navFieldKey="shipPin"/);

  const resolver = readFileSync(
    join(root, "src/services/location/pincodeResolver.ts"),
    "utf8"
  );
  assert.doesNotMatch(resolver, /scheduleDeferredIndiaPincodeWarm\s*\(/);
  assert.match(resolver, /shouldQueryOfflinePincodeOnInteractivePath/);

  const coordinator = readFileSync(join(root, "src/startup/coordinator.ts"), "utf8");
  assert.doesNotMatch(coordinator, /scheduleDeferredIndiaPincodeWarm/);
  assert.doesNotMatch(coordinator, /getSharedIndiaPincodeOfflineLookup/);
}

async function main(): Promise<void> {
  await test201016Fixture();
  await testOtherValidPinViaMockedFetch();
  await testNotFoundAndPartial();
  await testRapidPinAThenB();
  testPinAutofillProvenance();
  testInteractiveCallersUseGuards();
  console.log("staleSafePincodeLookup.test.ts: ok");
}

void main();
