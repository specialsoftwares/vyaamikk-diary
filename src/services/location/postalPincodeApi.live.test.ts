/**
 * Live public postal API matrix — no Firebase, no user identity.
 * Does not fail the suite if a valid PIN hits a temporary transport error.
 */

import assert from "node:assert/strict";

import { lookupPostalPincodeApi } from "./postalPincodeApi";
import { applyPinLookupResult, nextPinLookupRequestId } from "@/onboarding/pinConfirmation";

const PINS = ["201016", "110001", "110092", "400001", "560001", "600001", "700001"];

async function main() {
  const rows: Array<Record<string, unknown>> = [];

  for (const pin of PINS) {
    const result = await lookupPostalPincodeApi(pin);
    rows.push({
      pin: result.pin,
      classification: result.classification,
      httpStatus: result.httpStatus,
      elapsedMs: result.elapsedMs,
      resultCount: result.resultCount,
      locality: result.locality,
      district: result.district,
      state: result.state,
    });
    if (result.classification === "not-found") {
      assert.equal(result.resolution.success, false);
      assert.equal(result.resolution.errorClass, "not_found");
    }
    if (result.classification === "success") {
      assert.equal(result.resolution.success, true);
      assert.ok(result.district || result.state);
    }
    if (result.classification === "timeout" || result.classification === "transport") {
      assert.notEqual(result.resolution.errorClass, "not_found");
    }
  }

  const invalid = await lookupPostalPincodeApi("000000");
  rows.push({
    pin: invalid.pin,
    classification: invalid.classification,
    httpStatus: invalid.httpStatus,
    elapsedMs: invalid.elapsedMs,
    resultCount: invalid.resultCount,
  });
  assert.equal(invalid.classification, "invalid-format");

  const unassigned = await lookupPostalPincodeApi("999999");
  rows.push({
    pin: unassigned.pin,
    classification: unassigned.classification,
    httpStatus: unassigned.httpStatus,
    elapsedMs: unassigned.elapsedMs,
    resultCount: unassigned.resultCount,
  });
  if (unassigned.classification === "not-found") {
    assert.equal(unassigned.resolution.errorClass, "not_found");
  }

  const requestId = nextPinLookupRequestId();
  const networkUi = applyPinLookupResult({
    requestId,
    latestRequestId: requestId,
    pinCode: "110092",
    currentPinCode: "110092",
    resolution: {
      pinCode: "110092",
      success: false,
      source: "api",
      localities: [],
      defaultLocality: null,
      district: null,
      state: null,
      country: "India",
      errorClass: "timeout",
    },
  });
  assert.equal(networkUi?.status, "unavailable");

  const notFoundUi = applyPinLookupResult({
    requestId: requestId + 1,
    latestRequestId: requestId + 1,
    pinCode: "999999",
    currentPinCode: "999999",
    resolution: {
      pinCode: "999999",
      success: false,
      source: "api",
      localities: [],
      defaultLocality: null,
      district: null,
      state: null,
      country: "India",
      errorClass: "not_found",
    },
  });
  assert.equal(notFoundUi?.status, "not_found");

  const stale = applyPinLookupResult({
    requestId: 1,
    latestRequestId: 2,
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
  assert.equal(stale, null);

  console.log("postalPincodeApi.live.test.ts matrix", JSON.stringify(rows));
  console.log("postalPincodeApi.live.test.ts: ok");
}

void main();
