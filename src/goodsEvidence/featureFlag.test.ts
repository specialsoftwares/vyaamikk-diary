import assert from "node:assert/strict";

import { __setRuntimeSignalsForTests, env } from "@/config/env";
import { detectRuntimeKind } from "@/config/runtimeEnvironment";

import {
  __setGoodsEvidenceEnabledForTests,
  isGoodsEvidenceBlockedByStoreRuntime,
  isGoodsEvidenceEnabled,
} from "./featureFlag";

const prevFlag = process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;
const prevMode = process.env.EXPO_PUBLIC_APP_MODE;

const FLAG_VALUES = [undefined, "0", "true", "1"] as const;

function restoreEnv(): void {
  __setGoodsEvidenceEnabledForTests(null);
  __setRuntimeSignalsForTests(null);
  if (prevFlag == null) delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;
  else process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED = prevFlag;
  if (prevMode == null) delete process.env.EXPO_PUBLIC_APP_MODE;
  else process.env.EXPO_PUBLIC_APP_MODE = prevMode;
}

function applyFlag(value: (typeof FLAG_VALUES)[number]): void {
  __setGoodsEvidenceEnabledForTests(null);
  if (value === undefined) delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;
  else process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED = value;
}

function setDevelopmentRuntime(): void {
  __setRuntimeSignalsForTests({
    appOwnership: "expo",
    isDev: true,
    platform: "ios",
  });
  process.env.EXPO_PUBLIC_APP_MODE = "development";
}

function setProductionStoreRuntime(): void {
  __setRuntimeSignalsForTests({
    appOwnership: "standalone",
    isDev: false,
    platform: "android",
  });
  process.env.EXPO_PUBLIC_APP_MODE = "production";
}

setDevelopmentRuntime();
assert.equal(env.runtimeKind, "expo-go");
assert.equal(isGoodsEvidenceBlockedByStoreRuntime(), false);
for (const value of FLAG_VALUES) {
  applyFlag(value);
  assert.equal(
    isGoodsEvidenceEnabled(),
    value === "1",
    `development: flag ${String(value)}`
  );
}

setProductionStoreRuntime();
assert.equal(
  detectRuntimeKind({
    appOwnership: "standalone",
    isDev: false,
    platform: "android",
  }),
  "store-or-standalone"
);
assert.equal(env.runtimeKind, "store-or-standalone");
assert.equal(isGoodsEvidenceBlockedByStoreRuntime(), true);
for (const value of FLAG_VALUES) {
  applyFlag(value);
  assert.equal(
    isGoodsEvidenceEnabled(),
    false,
    `production store-or-standalone: flag ${String(value)} stays off`
  );
}

restoreEnv();

console.log("goodsEvidence/featureFlag.test.ts: ok");
