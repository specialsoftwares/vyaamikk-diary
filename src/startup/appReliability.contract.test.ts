/**
 * SOURCE contracts for app-reliability corrections that remain after map removal.
 * Not a mounted React test and not native-device acceptance.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  startupResultMayPublish,
  startupRetryMayStart,
} from "@/startup/startupAttempt";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

assert.equal(startupRetryMayStart(true), false);
assert.equal(startupRetryMayStart(false), true);
assert.equal(startupResultMayPublish(1, 2), false);
assert.equal(startupResultMayPublish(4, 4), true);

const you = readFileSync(join(root, "app/(app)/(tabs)/you.tsx"), "utf8");
assert.doesNotMatch(you, /allowFontScaling=\{false\}/);

console.log("appReliability.contract.test.ts: ok (SOURCE)");
