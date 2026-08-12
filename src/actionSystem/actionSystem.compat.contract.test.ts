import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ACTION_PRESS_SCALE,
  resolveActionInteraction,
  resolveActionLoadingLabel,
  resolvePrimaryLoadingChrome,
  shouldRetainLoadingContext,
} from "@/actionSystem";
import { resolveAuthV2PrimaryChrome } from "@/auth-v2/components/authV2PrimaryButtonChrome";

const root = join(__dirname, "../..");

/** Existing public props remain on PremiumActionButton source. */
{
  const src = readFileSync(join(root, "src/components/ui/PremiumActionButton.tsx"), "utf8");
  for (const prop of [
    "label",
    "onPress",
    "variant",
    "size",
    "shape",
    "loading",
    "disabled",
    "fullWidth",
    "compact",
    "leftSlot",
    "accessibilityLabel",
    "loadingLabel",
  ]) {
    assert.ok(src.includes(prop), `PremiumActionButton must keep/expose ${prop}`);
  }
  assert.ok(src.includes("ACTION_PRESS_SCALE"));
  assert.ok(src.includes("resolveActionInteraction"));
}

{
  const src = readFileSync(join(root, "src/auth-v2/components/AuthV2PrimaryButton.tsx"), "utf8");
  assert.ok(src.includes("loadingLabel"));
  assert.ok(src.includes("resolveAuthV2PrimaryChrome"));
  assert.ok(src.includes("resolveActionInteraction"));
}

{
  const src = readFileSync(join(root, "src/auth-v2/components/AuthV2SecondaryButton.tsx"), "utf8");
  assert.ok(src.includes("loadingLabel"));
  assert.ok(src.includes("resolveActionInteraction"));
}

/** Button alias still delegates to Premium — not a third family. */
{
  const src = readFileSync(join(root, "src/components/ui/Button.tsx"), "utf8");
  assert.ok(src.includes("PremiumActionButton"));
  assert.ok(src.includes("loadingLabel"));
}

/** Legacy loading without loadingLabel keeps muted chrome path available. */
{
  assert.equal(shouldRetainLoadingContext({ loading: true }), false);
  assert.equal(resolvePrimaryLoadingChrome({ loading: true, retainActiveChrome: false }), "muted");
  assert.equal(
    resolveActionLoadingLabel({ label: "Save", loading: true }),
    "Save"
  );
}

/** Auth primary loading chrome contract unchanged. */
{
  assert.equal(resolveAuthV2PrimaryChrome({ disabled: true, loading: true }), "active");
  assert.equal(resolveActionInteraction({ loading: true }).pressable, false);
}

assert.ok(ACTION_PRESS_SCALE === 0.97);

console.log("actionSystem.compat.contract.test.ts: ok");
