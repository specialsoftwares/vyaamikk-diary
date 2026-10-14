import assert from "node:assert/strict";

import {
  acceptDetectPinTap,
  detectPinForField,
  mayApplyDetectPinResult,
  postalCodeToIndianPin,
  type DetectPinDeps,
  type DetectPinFence,
  type DetectPinRequest,
} from "./detectMyPin";

function fence(overrides: Partial<DetectPinFence> = {}): DetectPinFence {
  return {
    ownerId: "owner-a",
    sessionGeneration: 1,
    screenAlive: true,
    targetField: "dispatchFromPin",
    fieldRevision: 3,
    ...overrides,
  };
}

function request(readFence: () => DetectPinFence, overrides: Partial<DetectPinRequest> = {}): DetectPinRequest {
  return {
    ownerId: "owner-a",
    sessionGeneration: 1,
    targetField: "dispatchFromPin",
    fieldRevision: 3,
    readFence,
    ...overrides,
  };
}

function deps(overrides: Partial<DetectPinDeps> = {}): DetectPinDeps & {
  calls: { permission: number; current: number; reverse: unknown[]; resolve: string[] };
} {
  const calls = { permission: 0, current: 0, reverse: [] as unknown[], resolve: [] as string[] };
  return {
    calls,
    requestPermission: async () => {
      calls.permission += 1;
      return "granted";
    },
    getCurrent: async () => {
      calls.current += 1;
      return { latitude: 28.6139, longitude: 77.209, accuracy: 20 };
    },
    reversePostalCode: async (point) => {
      calls.reverse.push(point);
      return "110001";
    },
    resolvePin: async (pin) => {
      calls.resolve.push(pin);
      return { success: true, locality: "Connaught Place", district: "New Delhi", state: "Delhi" };
    },
    locationTimeoutMs: 50,
    postalTimeoutMs: 50,
    ...overrides,
  };
}

assert.equal(postalCodeToIndianPin("110001"), "110001");
assert.equal(postalCodeToIndianPin("110 001"), "110001");
assert.equal(postalCodeToIndianPin("110001999"), null);
assert.equal(postalCodeToIndianPin("28.6139"), null);
assert.equal(postalCodeToIndianPin("000000"), null);
assert.equal(acceptDetectPinTap(false), true);
assert.equal(acceptDetectPinTap(true), false);

async function main(): Promise<void> {
const stable = fence();
const ok = await detectPinForField(request(() => stable), deps());
assert.equal(ok.kind, "proposal");
if (ok.kind === "proposal") {
  assert.equal(ok.targetField, "dispatchFromPin");
  assert.equal(ok.pinCode, "110001");
  assert.equal(ok.areaLabel, "Connaught Place, New Delhi, Delhi");
  assert.equal(ok.approximate, false);
  assert.equal("latitude" in ok, false);
  assert.equal("longitude" in ok, false);
}

const approximateDeps = deps({
  getCurrent: async () => ({ latitude: 28.6, longitude: 77.2, accuracy: 4_000 }),
});
const approximate = await detectPinForField(request(() => stable), approximateDeps);
assert.equal(approximate.kind, "proposal");
if (approximate.kind === "proposal") assert.equal(approximate.approximate, true);

const deniedDeps = deps({
  requestPermission: async () => "denied",
});
const denied = await detectPinForField(request(() => stable), deniedDeps);
assert.equal(denied.kind, "denied");
assert.equal(deniedDeps.calls.current, 0);

const thrown = deps({
  getCurrent: async () => {
    throw new Error("services disabled");
  },
});
assert.equal((await detectPinForField(request(() => stable), thrown)).kind, "unavailable");

const hung = deps({
  locationTimeoutMs: 20,
  getCurrent: () => new Promise(() => undefined),
});
const timedOut = await detectPinForField(request(() => stable), hung);
assert.deepEqual(timedOut, { kind: "unavailable", reason: "timeout" });

const noPostal = deps({ reversePostalCode: async () => null });
assert.deepEqual(await detectPinForField(request(() => stable), noPostal), {
  kind: "unavailable",
  reason: "no_postal",
});

const lookupFail = deps({
  resolvePin: async () => ({ success: false, locality: null, district: null, state: null }),
});
const failedLookup = await detectPinForField(request(() => stable), lookupFail);
assert.deepEqual(failedLookup, { kind: "unavailable", reason: "lookup" });
assert.equal("pinCode" in failedLookup, false);

let currentFence = fence();
const moving = request(() => currentFence);
const ownerChange = deps({
  getCurrent: async () => {
    currentFence = fence({ ownerId: "owner-b" });
    return { latitude: 28.6, longitude: 77.2, accuracy: 10 };
  },
});
assert.equal((await detectPinForField(moving, ownerChange)).kind, "stale");
assert.equal(mayApplyDetectPinResult(moving), false);

currentFence = fence();
const revisionChange = deps({
  reversePostalCode: async () => {
    currentFence = fence({ fieldRevision: 4 });
    return "110001";
  },
});
assert.equal((await detectPinForField(request(() => currentFence), revisionChange)).kind, "stale");

currentFence = fence();
const otherField = deps();
const otherRequest = request(() => currentFence, { targetField: "deliveryToPin" });
currentFence = fence({ targetField: "dispatchFromPin" });
assert.equal((await detectPinForField(otherRequest, otherField)).kind, "stale");

currentFence = fence({ screenAlive: false });
assert.equal((await detectPinForField(request(() => currentFence), deps())).kind, "stale");

const reverseSpy = deps();
await detectPinForField(request(() => fence()), reverseSpy);
assert.deepEqual(Object.keys(reverseSpy.calls.reverse[0] as object).sort(), ["latitude", "longitude"]);
assert.deepEqual(reverseSpy.calls.resolve, ["110001"]);

console.log("detectMyPin.test.ts: ok");
}

void main();
