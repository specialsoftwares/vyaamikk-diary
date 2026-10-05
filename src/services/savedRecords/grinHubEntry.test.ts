/**
 * INJECTED records-hub GRIN visibility. Not NATIVE_DEVICE.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { __setRuntimeSignalsForTests } from "@/config/env";
import { shouldShowGrinRecordsHubEntry } from "./grinHubEntry";

const prevEnabled = process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;
const prevAdmit = process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT;
const prevMode = process.env.EXPO_PUBLIC_APP_MODE;

function restore(): void {
  __setRuntimeSignalsForTests(null);
  if (prevEnabled == null) delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;
  else process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED = prevEnabled;
  if (prevAdmit == null) delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT;
  else process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT = prevAdmit;
  if (prevMode == null) delete process.env.EXPO_PUBLIC_APP_MODE;
  else process.env.EXPO_PUBLIC_APP_MODE = prevMode;
}

function setStore(): void {
  __setRuntimeSignalsForTests({
    appOwnership: "standalone",
    isDev: false,
    platform: "android",
  });
  process.env.EXPO_PUBLIC_APP_MODE = "production";
}

try {
  setStore();
  delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED;
  delete process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT;
  assert.equal(shouldShowGrinRecordsHubEntry(), false);

  process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED = "1";
  assert.equal(shouldShowGrinRecordsHubEntry(), false, "store runtime stays hidden without admit");

  process.env.EXPO_PUBLIC_GOODS_EVIDENCE_STORE_RUNTIME_ADMIT = "1";
  assert.equal(shouldShowGrinRecordsHubEntry(), true, "Internal-GRIN flags show the hub tile");

  process.env.EXPO_PUBLIC_GOODS_EVIDENCE_ENABLED = "true";
  assert.equal(shouldShowGrinRecordsHubEntry(), false, "non-exact ENABLED stays hidden");

  const hub = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../../app/(app)/(tabs)/saved-records.tsx"), "utf8");
  assert.match(hub, /shouldShowGrinRecordsHubEntry/);
  assert.match(hub, /loadSavedRecordsData/);
  assert.match(hub, /\/\(app\)\/grin/);
  assert.doesNotMatch(hub, /createUninjectedGrinServerPort/);
  assert.doesNotMatch(hub, /GrinFixtureRepository/);
  assert.doesNotMatch(hub, /InstallReferrer|getInstallerPackageName/);

  const listSrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../screens/grin/GrinListScreen.tsx"),
    "utf8"
  );
  assert.match(listSrc, /grinFeatureNotAdmitted/);
  assert.match(listSrc, /grin\.unavailableTitle/);
  assert.match(listSrc, /grin\.unavailableBody/);

  const localesDir = join(dirname(fileURLToPath(import.meta.url)), "../../../src/i18n/locales");
  for (const lang of ["en", "hi", "ta", "te", "gu"]) {
    const catalog = JSON.parse(readFileSync(join(localesDir, `${lang}.json`), "utf8")) as {
      savedRecords?: { catGrin?: string };
    };
    assert.equal(typeof catalog.savedRecords?.catGrin, "string", `${lang} savedRecords.catGrin`);
    assert.ok((catalog.savedRecords?.catGrin ?? "").trim().length > 0, `${lang} catGrin empty`);
  }
} finally {
  restore();
}

console.log("src/services/savedRecords/grinHubEntry.test.ts: ok (INJECTED / not NATIVE_DEVICE)");
