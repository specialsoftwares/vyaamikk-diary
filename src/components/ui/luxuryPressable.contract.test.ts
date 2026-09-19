/**
 * LuxuryPressable must not keep a persisted press animation after cancel.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(join(root, "LuxuryPressable.tsx"), "utf8");
const tokens = readFileSync(join(root, "../../theme/luxuryTokens.ts"), "utf8");

assert.equal(src.includes("useSharedValue"), false);
assert.equal(src.includes("withTiming"), false);
assert.equal(src.includes("useAnimatedStyle"), false);
assert.equal(src.includes("createAnimatedComponent"), false);
assert.equal(src.includes("onPressIn"), false);
assert.equal(src.includes("onPressOut"), false);
assert.equal(src.includes("isPressed"), false);
assert.ok(src.includes("Pressable"));
assert.ok(src.includes("state.pressed"));
assert.ok(src.includes("LUXURY_PRESS.scale"));
assert.ok(src.includes("LUXURY_PRESS.opacity"));
assert.ok(tokens.includes("scale: 0.97"));
assert.ok(tokens.includes("opacity: 0.94"));

console.log("luxuryPressable.contract.test.ts: ok");
