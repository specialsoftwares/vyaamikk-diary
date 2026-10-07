import assert from "node:assert/strict";

import { __setRuntimeSignalsForTests, env } from "@/config/env";
import { detectRuntimeKind } from "@/config/runtimeEnvironment";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isGoodsEvidenceBlockedByStoreRuntime, isGoodsEvidenceEnabled } from "./featureFlag";

const prevFlag = process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;
const prevAdmit = process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT;
const prevMode = process.env.EXPO_PUBLIC_APP_MODE;

const FLAG_VALUES = [undefined, "0", "true", "1"] as const;

function restoreEnv(): void {
  __setRuntimeSignalsForTests(null);
  if (prevFlag == null) delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;
  else process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED = prevFlag;
  if (prevAdmit == null) delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT;
  else process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT = prevAdmit;
  if (prevMode == null) delete process.env.EXPO_PUBLIC_APP_MODE;
  else process.env.EXPO_PUBLIC_APP_MODE = prevMode;
}

function applyFlag(value: (typeof FLAG_VALUES)[number]): void {
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
delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT;
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

process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED = "1";
process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT = "1";
assert.equal(isGoodsEvidenceBlockedByStoreRuntime(), false);
assert.equal(isGoodsEvidenceEnabled(), true, "Internal-GRIN admit + ENABLED=1");

process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED = "true";
assert.equal(isGoodsEvidenceEnabled(), false, "admit does not treat ENABLED=true as on");

delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;
assert.equal(isGoodsEvidenceBlockedByStoreRuntime(), false);
assert.equal(isGoodsEvidenceEnabled(), false, "admit alone does not enable GRIN");

const flagSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "featureFlag.ts"),
  "utf8"
);
assert.doesNotMatch(flagSource, /__setGoodsEvidenceEnabledForTests/);
assert.doesNotMatch(flagSource, /_testOverride/);
assert.doesNotMatch(flagSource, /InstallReferrer|getInstallerPackageName|getInstallReferrer/);

restoreEnv();

console.log("goodsEvidence/featureFlag.test.ts: ok");
