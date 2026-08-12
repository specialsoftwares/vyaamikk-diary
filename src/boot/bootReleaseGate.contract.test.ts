/**
 * Boot release gate contracts — brand minimum + readiness, not fixed 3.6s hold.
 */

import assert from "node:assert/strict";

import {
  BOOT_ANIMATION_MS,
  BOOT_BRAND_MIN_MS,
  BOOT_REDUCED_MOTION_MS,
  canReleaseBootToApp,
} from "@/config/brandMotion";
import { readFileSync } from "node:fs";
import { join } from "node:path";

assert.ok(BOOT_BRAND_MIN_MS <= 1200, "brand min should be ~1s class");
assert.ok(BOOT_BRAND_MIN_MS >= 800, "brand min must remain a perceptible moment");
assert.ok(BOOT_ANIMATION_MS > BOOT_BRAND_MIN_MS, "full choreography may continue while waiting");

assert.equal(
  canReleaseBootToApp({
    brandMinElapsed: false,
    bootReady: true,
    routeResolved: true,
    bootError: false,
  }),
  false,
  "must not release before brand minimum"
);

assert.equal(
  canReleaseBootToApp({
    brandMinElapsed: true,
    bootReady: false,
    routeResolved: true,
    bootError: false,
  }),
  false,
  "must not release before boot ready"
);

assert.equal(
  canReleaseBootToApp({
    brandMinElapsed: true,
    bootReady: true,
    routeResolved: false,
    bootError: false,
  }),
  false,
  "must not release before route resolved (no wrong-route flash)"
);

assert.equal(
  canReleaseBootToApp({
    brandMinElapsed: true,
    bootReady: true,
    routeResolved: true,
    bootError: true,
  }),
  false,
  "must not release on boot error"
);

assert.equal(
  canReleaseBootToApp({
    brandMinElapsed: true,
    bootReady: true,
    routeResolved: true,
    bootError: false,
  }),
  true,
  "ready user releases after brand minimum — not forced to wait BOOT_ANIMATION_MS"
);

const gate = readFileSync(join(__dirname, "BootAnimationGate.tsx"), "utf8");
assert.match(gate, /canReleaseBootToApp/);
assert.match(gate, /BOOT_BRAND_MIN_MS/);
assert.doesNotMatch(
  gate,
  /animationDone && bootReady && routeResolved/,
  "must not require full choreography completion for ready users"
);

const anim = readFileSync(
  join(__dirname, "../components/boot/VyaamikkBootAnimation.tsx"),
  "utf8"
);
assert.match(
  anim,
  /phaseRef\.current === "holding" \|\| phaseRef\.current === "playing"/,
  "releaseToApp must exit mid-choreography when gate says ready"
);

assert.ok(BOOT_REDUCED_MOTION_MS >= 700);

console.log("bootReleaseGate.contract.test.ts: ok");
