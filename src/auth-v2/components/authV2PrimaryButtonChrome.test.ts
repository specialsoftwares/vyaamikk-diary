import assert from "node:assert/strict";

import { authV2Tokens } from "@/auth-v2/theme/authV2Theme";
import { lightColors } from "@/theme/palettes";
import { resolveAuthV2PrimaryChrome } from "./authV2PrimaryButtonChrome";

assert.equal(resolveAuthV2PrimaryChrome({ disabled: true, loading: false }), "muted");
assert.equal(resolveAuthV2PrimaryChrome({ disabled: false, loading: false }), "active");
assert.equal(resolveAuthV2PrimaryChrome({ disabled: true, loading: true }), "active");
assert.equal(resolveAuthV2PrimaryChrome({ disabled: false, loading: true }), "active");

const dark = authV2Tokens(lightColors, true);

assert.match(dark.ctaMutedBg, /165,\s*180,\s*252/);
assert.match(dark.ctaMutedText, /237,\s*240,\s*255/);
assert.match(dark.ctaMutedBorder, /165,\s*180,\s*252/);
assert.notEqual(dark.ctaMutedBg.toLowerCase(), "#9ca3af");
assert.notEqual(dark.ctaMutedBg.toLowerCase(), "gray");
assert.notEqual(dark.ctaActiveBg, dark.ctaMutedBg);
assert.ok(dark.ctaActiveBg.startsWith("#"));

console.log("authV2PrimaryButtonChrome.test.ts: ok");
