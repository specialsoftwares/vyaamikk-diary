/**
 * PIN 201016 interactive contract (no React Native / offline DB cold-start).
 * Live API shape is asserted separately via curl in the forensic report.
 */

import assert from "node:assert/strict";

import { applyPinLookupResult, nextPinLookupRequestId } from "@/onboarding/pinConfirmation";
import { shouldQueryOfflinePincodeOnInteractivePath } from "@/services/location/pincodeWarmPolicy";

async function main() {
  assert.equal(shouldQueryOfflinePincodeOnInteractivePath(false), false);

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

  // Timed live API probe (bounded) — proves remote path is healthy.
  const started = Date.now();
  const res = await fetch("https://api.postalpincode.in/pincode/201016", {
    headers: { Accept: "application/json" },
  });
  const json = (await res.json()) as Array<{
    Status?: string;
    PostOffice?: Array<{ Name?: string; District?: string; State?: string }>;
  }>;
  const elapsed = Date.now() - started;
  assert.equal(res.status, 200);
  assert.equal(json[0]?.Status, "Success");
  assert.equal(json[0]?.PostOffice?.[0]?.District, "Ghaziabad");
  assert.equal(json[0]?.PostOffice?.[0]?.State, "Uttar Pradesh");
  assert.ok(elapsed < 8_000, `API probe too slow: ${elapsed}ms`);

  console.log(
    JSON.stringify({
      ok: true,
      apiElapsedMs: elapsed,
      office: json[0]?.PostOffice?.[0]?.Name,
      district: json[0]?.PostOffice?.[0]?.District,
      state: json[0]?.PostOffice?.[0]?.State,
    })
  );
}

void main();
