import assert from "node:assert/strict";

import {
  MOBILE_QUARANTINE_MS,
  MOBILE_QUARANTINE_USER_MESSAGE,
  isMobileInQuarantine,
  quarantineUntilFrom,
} from "./mobileQuarantinePolicy";
import {
  OFFLINE_FULL_ACCESS_MS,
  offlineMutationAllowed,
  resolveOfflineAccessMode,
} from "./offlineAccessPolicy";
import { classifyPhysicalDeviceRecognition } from "@/services/device/physicalDeviceRecognition";
import { isLoginAllowedByIntegrity } from "@/services/device/deviceIntegrity";

assert.equal(MOBILE_QUARANTINE_MS, 21 * 24 * 60 * 60 * 1000);
assert.ok(MOBILE_QUARANTINE_USER_MESSAGE.includes("temporarily unavailable"));
assert.equal(isMobileInQuarantine(Date.now() + 1000), true);
assert.equal(isMobileInQuarantine(Date.now() - 1000), false);
assert.ok(quarantineUntilFrom(1_000_000) === 1_000_000 + MOBILE_QUARANTINE_MS);

assert.equal(OFFLINE_FULL_ACCESS_MS, 24 * 60 * 60 * 1000);
assert.equal(
  resolveOfflineAccessMode({
    isOnline: false,
    lastSuccessfulOnlineValidationAt: Date.now() - 60_000,
  }),
  "offline_full"
);
assert.equal(
  resolveOfflineAccessMode({
    isOnline: false,
    lastSuccessfulOnlineValidationAt: Date.now() - OFFLINE_FULL_ACCESS_MS - 1,
  }),
  "offline_read_only"
);
assert.equal(offlineMutationAllowed("offline_read_only"), false);
assert.equal(offlineMutationAllowed("offline_full"), true);

assert.equal(
  classifyPhysicalDeviceRecognition({
    currentInstallationId: "a",
    previousActiveInstallationId: "a",
  }),
  "same_install_confident"
);
assert.equal(
  classifyPhysicalDeviceRecognition({
    currentInstallationId: "a",
    previousActiveInstallationId: "b",
  }),
  "different_install"
);
assert.equal(
  classifyPhysicalDeviceRecognition({
    currentInstallationId: null,
    previousActiveInstallationId: "b",
  }),
  "uncertain_treat_as_new"
);

assert.equal(
  isLoginAllowedByIntegrity({ verdict: "trusted", reason: "", limitation: "", dormant: false }),
  true
);
assert.equal(
  isLoginAllowedByIntegrity({
    verdict: "inconclusive",
    reason: "",
    limitation: "",
    dormant: false,
  }),
  false
);
// Dormant / unconfigured probes must not block login (SDK not wired).
assert.equal(
  isLoginAllowedByIntegrity({
    verdict: "unavailable",
    reason: "",
    limitation: "",
    dormant: true,
  }),
  true
);

console.log("authPolicyMatrix.test.ts: ok");
