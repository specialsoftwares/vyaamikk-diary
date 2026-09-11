import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  androidAuthShellFooterKeyboardPad,
  authShellKeyboardShouldPersistTaps,
  resolveAuthShellHardwareBack,
} from "@/auth-v2/authShellKeyboardPolicy";

assert.equal(
  resolveAuthShellHardwareBack({ keyboardVisible: true }),
  "dismiss-keyboard"
);
assert.equal(
  resolveAuthShellHardwareBack({ keyboardVisible: false }),
  "navigate-back"
);
assert.equal(authShellKeyboardShouldPersistTaps(), "always");
assert.equal(
  androidAuthShellFooterKeyboardPad({ platform: "android", keyboardHeight: 280 }),
  280
);
assert.equal(
  androidAuthShellFooterKeyboardPad({ platform: "ios", keyboardHeight: 280 }),
  0
);

const shell = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "components/AuthShell.tsx"),
  "utf8"
);
assert.match(shell, /resolveAuthShellHardwareBack/);
assert.match(shell, /authShellKeyboardShouldPersistTaps/);
assert.match(shell, /androidAuthShellFooterKeyboardPad/);
assert.match(shell, /Keyboard\.dismiss/);

console.log("authShellKeyboardPolicy.test.ts: ok");
