import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  ACTION_HAPTIC_NEVER_ON_PRESS,
  ACTION_MIN_TARGET_DP,
  ACTION_PRESS_OPACITY,
  ACTION_PRESS_SCALE,
  AUTH_SECONDARY_ACTIVE,
  contrastRatioCss,
  defaultHapticForPurpose,
  defaultVisualForPurpose,
  isNavigationPurpose,
  isRecoveryPurpose,
  isSecurityPurpose,
  isUnsafeAuthLinkColor,
  navigationPurpose,
  resolveActionInteraction,
  resolveActionLoadingLabel,
  resolveAuthSecondaryActiveAppearance,
  resolveCardActionAccessibility,
  resolvePrimaryLoadingChrome,
  shouldRetainLoadingContext,
} from "@/actionSystem";
import { authV2Tokens } from "@/auth-v2/theme/authV2Theme";
import { resolveAuthV2PrimaryChrome } from "@/auth-v2/components/authV2PrimaryButtonChrome";
import { darkColors, lightColors } from "@/theme/palettes";

// --- A/B primary enabled / disabled ---
{
  const enabled = resolveActionInteraction({ disabled: false, loading: false });
  assert.equal(enabled.pressable, true);
  assert.equal(enabled.accessibilityState.disabled, false);
  assert.equal(enabled.accessibilityState.busy, false);
  assert.equal(enabled.state, "default");
  assert.equal(enabled.accessibilityRole, "button");

  const disabled = resolveActionInteraction({ disabled: true, loading: false });
  assert.equal(disabled.pressable, false);
  assert.equal(disabled.accessibilityState.disabled, true);
  assert.equal(disabled.state, "disabled");
}

// --- C/D primary loading locks + busy a11y ---
{
  const loading = resolveActionInteraction({ disabled: false, loading: true });
  assert.equal(loading.pressable, false);
  assert.equal(loading.accessibilityState.busy, true);
  assert.equal(loading.accessibilityState.disabled, false);
  assert.equal(loading.state, "loading");
}

// --- E loading retains action context ---
{
  assert.equal(
    resolveActionLoadingLabel({
      label: "Save changes",
      loading: true,
      loadingLabel: "Saving…",
    }),
    "Saving…"
  );
  assert.equal(
    resolveActionLoadingLabel({ label: "Confirm & continue", loading: true }),
    "Confirm & continue"
  );
  assert.equal(shouldRetainLoadingContext({ loading: true, loadingLabel: "Saving…" }), true);
  assert.equal(shouldRetainLoadingContext({ loading: true }), false);
  assert.equal(
    resolvePrimaryLoadingChrome({ loading: true, retainActiveChrome: true }),
    "active"
  );
  assert.equal(
    resolvePrimaryLoadingChrome({ loading: true, retainActiveChrome: false }),
    "muted"
  );
  assert.equal(resolveAuthV2PrimaryChrome({ disabled: false, loading: true }), "active");
}

// --- F/G secondary dark-auth contrast + disabled distinct ---
{
  const tokensDarkDevice = authV2Tokens(darkColors, true);
  const enabled = resolveAuthSecondaryActiveAppearance("default");
  const disabled = resolveAuthSecondaryActiveAppearance("disabled");

  assert.equal(enabled.color, AUTH_SECONDARY_ACTIVE.fg);
  assert.equal(tokensDarkDevice.secondaryActiveFg, AUTH_SECONDARY_ACTIVE.fg);
  assert.notEqual(tokensDarkDevice.secondaryActiveFg, darkColors.primaryLight);
  assert.notEqual(tokensDarkDevice.secondaryActiveFg, tokensDarkDevice.link);
  assert.ok(isUnsafeAuthLinkColor(tokensDarkDevice.link, darkColors.primaryLight));

  const fgRatio = contrastRatioCss(enabled.color, AUTH_SECONDARY_ACTIVE.referenceCardBg);
  const borderRatio = contrastRatioCss(enabled.borderColor, AUTH_SECONDARY_ACTIVE.referenceCardBg);
  assert.ok(fgRatio !== null && fgRatio >= 3, `enabled secondary fg contrast ${fgRatio}`);
  assert.ok(borderRatio !== null && borderRatio >= 3, `enabled secondary border contrast ${borderRatio}`);

  assert.notEqual(disabled.color, enabled.color);
  assert.notEqual(disabled.borderColor, enabled.borderColor);
  assert.notEqual(disabled.backgroundColor, enabled.backgroundColor);

  // Disabled must remain below enabled contrast (distinct / quieter), still parseable.
  const disabledRatio = contrastRatioCss(disabled.color, AUTH_SECONDARY_ACTIVE.referenceCardBg);
  assert.ok(disabledRatio !== null && disabledRatio > 1.2);
  assert.ok(fgRatio! > disabledRatio!);
}

// --- H secondary onPress blocked when disabled ---
{
  const d = resolveActionInteraction({ disabled: true });
  assert.equal(d.pressable, false);
}

// --- I pressed state exists ---
{
  const pressed = resolveActionInteraction({ pressed: true });
  assert.equal(pressed.state, "pressed");
  assert.ok(ACTION_PRESS_SCALE >= 0.95 && ACTION_PRESS_SCALE <= 0.99);
  assert.ok(ACTION_PRESS_OPACITY >= 0.85 && ACTION_PRESS_OPACITY < 1);
}

// --- J min 44dp ---
{
  assert.equal(ACTION_MIN_TARGET_DP, 44);
  const card = resolveCardActionAccessibility({
    actionLabel: "Edit",
    onAction: () => undefined,
  });
  assert.ok(card.minTargetDp >= 44);
}

// --- K tertiary / L destructive / M security / N recovery vs navigate ---
{
  assert.equal(defaultVisualForPurpose("navigate"), "tertiary");
  assert.equal(defaultVisualForPurpose("retry"), "tertiary");
  assert.equal(defaultVisualForPurpose("delete"), "destructive");
  assert.equal(defaultVisualForPurpose("security"), "secondary");
  assert.equal(defaultVisualForPurpose("modify"), "secondary");
  assert.ok(isSecurityPurpose("security"));
  assert.ok(isRecoveryPurpose("retry"));
  assert.ok(isNavigationPurpose("navigate"));
  assert.equal(isRecoveryPurpose("navigate"), false);
  assert.equal(navigationPurpose(), "navigate");
  assert.equal(defaultHapticForPurpose("save"), "success");
  assert.equal(defaultHapticForPurpose("delete"), "destructiveConfirm");
  assert.equal(defaultHapticForPurpose("modify"), "none");
  assert.ok(ACTION_HAPTIC_NEVER_ON_PRESS.includes("change"));
}

// --- Card affordance a11y merge ---
{
  const chipOnly = resolveCardActionAccessibility({
    actionLabel: "Change",
    onAction: () => undefined,
    wholeCardActivates: false,
  });
  assert.equal(chipOnly.chip.accessibilityElementsHidden, false);
  assert.equal(chipOnly.card.accessibilityRole, "none");

  const whole = resolveCardActionAccessibility({
    actionLabel: "Change",
    onAction: () => undefined,
    wholeCardActivates: true,
  });
  assert.equal(whole.chip.accessibilityElementsHidden, true);
  assert.equal(whole.card.accessibilityRole, "button");
  assert.equal(whole.card.accessibilityLabel, "Change");
}

// --- O backward compat: existing chrome helpers + tokens still export legacy link ---
{
  const light = authV2Tokens(lightColors, true);
  assert.ok(typeof light.ctaActiveBg === "string");
  assert.ok(typeof light.link === "string");
  assert.equal(resolveAuthV2PrimaryChrome({ disabled: true, loading: false }), "muted");
}

// --- P no product/business source dependency in actionSystem ---
{
  const root = join(__dirname);
  const files = readdirSync(root).filter((f) => f.endsWith(".ts") && !f.includes(".test."));
  const forbidden = [
    "firebase",
    "@/services/auth",
    "@/services/records",
    "firestore",
    "confirmVerifiedMobile",
    "saveIdempotency",
  ];
  for (const file of files) {
    const abs = join(root, file);
    if (!statSync(abs).isFile()) continue;
    const src = readFileSync(abs, "utf8");
    for (const bad of forbidden) {
      assert.equal(src.includes(bad), false, `${file} must not depend on ${bad}`);
    }
  }
}

// Fixture matrix (test-only — not a production route)
{
  const matrix = [
    { visual: "primary", state: "default" },
    { visual: "primary", state: "loading" },
    { visual: "primary", state: "disabled" },
    { visual: "secondary", state: "default" },
    { visual: "secondary", state: "loading" },
    { visual: "secondary", state: "disabled" },
    { visual: "tertiary", state: "default" },
    { visual: "destructive", state: "default" },
  ] as const;
  assert.equal(matrix.length, 8);
}

console.log("actionSystem.contract.test.ts: ok");
