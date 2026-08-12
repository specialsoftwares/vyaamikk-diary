import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  AUTH_SECONDARY_ACTIVE,
  contrastRatioCss,
  resolveAuthSecondaryActiveAppearance,
  resolveCardActionAccessibility,
} from "@/actionSystem";
import { authV2Tokens } from "@/auth-v2/theme/authV2Theme";
import { darkColors } from "@/theme/palettes";

const root = join(__dirname, "../..");

function read(pathFromRoot: string): string {
  return readFileSync(join(root, pathFromRoot), "utf8");
}

/** Contacts Change must not style enabled actions with tokens.link. */
{
  const src = read("src/auth-v2/contactChange/VerifiedContactChangePanel.tsx");
  assert.equal(src.includes("tokens.link"), false, "VerifiedContactChangePanel must not use tokens.link");
  assert.ok(src.includes("AuthCardActionAffordance"));
  assert.ok(src.includes('purpose="security"') || src.includes("purpose=\"security\""));
  assert.ok(src.includes("AuthSecondaryActiveChip") || src.includes("AuthCardActionAffordance"));
}

/** Review cards use whole-card affordance + secondary-active chip. */
{
  const src = read("src/auth-v2/screens/ProfileReviewPresentation.tsx");
  assert.ok(src.includes("AuthCardActionAffordance"));
  assert.equal(src.includes('borderColor: "#A5B4FC"'), false);
  assert.ok(src.includes("Confirming…") || src.includes("loadingLabel"));
}

/** Email OTP resend must not use tokens.link. */
{
  const src = read("src/auth-v2/screens/EmailOtpScreen.tsx");
  assert.equal(src.includes("tokens.link"), false);
  assert.ok(src.includes("AuthTertiaryTextAction"));
  assert.ok(src.includes("useAuthV2Theme"));
}

/** Phone OTP uses tertiary recovery actions + always-dark theme hook. */
{
  const src = read("src/auth-v2/screens/OtpVerificationScreen.tsx");
  assert.ok(src.includes("AuthTertiaryTextAction"));
  assert.ok(src.includes("useAuthV2Theme"));
  assert.equal(src.includes("authV2Tokens(colors"), false);
}

/** Secondary-active contrast still holds under poisoned device dark palette. */
{
  const tokens = authV2Tokens(darkColors, true);
  assert.notEqual(tokens.secondaryActiveFg, tokens.link);
  const enabled = resolveAuthSecondaryActiveAppearance("default");
  const ratio = contrastRatioCss(enabled.color, AUTH_SECONDARY_ACTIVE.referenceCardBg);
  assert.ok(ratio !== null && ratio >= 3);
}

/** Whole-card a11y merges to a single focus target. */
{
  const plan = resolveCardActionAccessibility({
    actionLabel: "Change",
    onAction: () => undefined,
    wholeCardActivates: true,
  });
  assert.equal(plan.chip.accessibilityElementsHidden, true);
  assert.equal(plan.card.accessibilityRole, "button");
}

/** Shared Stage 2 primitives exist. */
{
  for (const path of [
    "src/auth-v2/components/AuthSecondaryActiveChip.tsx",
    "src/auth-v2/components/AuthSecondaryActiveButton.tsx",
    "src/auth-v2/components/AuthTertiaryTextAction.tsx",
    "src/auth-v2/components/AuthCardActionAffordance.tsx",
  ]) {
    assert.ok(read(path).length > 0);
  }
}

/** Logo Choose/Change uses secondary-active button. */
{
  const src = read("src/auth-v2/screens/reviewEdit/ReviewEditSectionViews.tsx");
  assert.ok(src.includes("AuthSecondaryActiveButton"));
  assert.equal(src.includes("AuthV2SecondaryButton"), false);
}

console.log("actionSystem.stage2.authMigration.contract.test.ts: ok");
