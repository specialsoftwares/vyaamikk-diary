import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  FORBIDDEN_W9_CLAIM_FRAGMENTS,
  SHOW_TRUSTED_BY_INDIAN_BUSINESS_OWNERS_CLAIM,
} from "./upgradePresentation";

const root = dirname(fileURLToPath(import.meta.url));

function read(name: string): string {
  return readFileSync(join(root, name), "utf8");
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const sheet = stripComments(read("UpgradeSheet.tsx"));
const education = stripComments(read("BenefitEducationScreen.tsx"));
const lab = stripComments(read("BillingUxPreviewLab.tsx"));
const route = readFileSync(
  join(root, "../../../app/(app)/settings/billing-ux-preview.tsx"),
  "utf8"
);
const settings = readFileSync(
  join(root, "../../../app/(app)/(tabs)/settings.tsx"),
  "utf8"
);

assert.match(sheet, /<CurtainSheet/);
assert.match(sheet, /closeOnBackdropPress=\{false\}/);
assert.match(sheet, /billing\.upgrade\.close/);
assert.doesNotMatch(sheet, /useIap\b/);
assert.doesNotMatch(sheet, /IapProvider/);
assert.doesNotMatch(sheet, /SubscriptionProvider/);
assert.doesNotMatch(sheet, /useAuth\b/);
assert.doesNotMatch(sheet, /restorePurchases/);
assert.doesNotMatch(sheet, /billingUxPreviewFixtures/);
assert.doesNotMatch(sheet, /\bswitch\s*\(\s*plan\s*\)/);
assert.doesNotMatch(education, /useIap\b/);
assert.doesNotMatch(education, /AsyncStorage/);
assert.doesNotMatch(education, /benefitScreenShown/);

for (const fragment of FORBIDDEN_W9_CLAIM_FRAGMENTS) {
  assert.equal(sheet.includes(fragment), false, `UpgradeSheet must not inline ${fragment}`);
  assert.equal(education.includes(fragment), false, `BenefitEducation must not inline ${fragment}`);
}

assert.equal(SHOW_TRUSTED_BY_INDIAN_BUSINESS_OWNERS_CLAIM, false);
assert.match(sheet, /shouldShowTrustedByClaim\(\)/);

assert.match(lab, /BILLING_UX_PREVIEW_ERROR/);
assert.match(lab, /fixtureReadyOffers/);
assert.doesNotMatch(lab, /useIap\b/);
assert.match(route, /isBillingUxPreviewEnabled/);
assert.match(route, /Redirect/);
assert.match(settings, /isBillingUxPreviewEnabled\(\)/);
assert.match(settings, /billing-ux-preview/);
assert.doesNotMatch(settings, /Subscription & Billing/);

const curtain = readFileSync(join(root, "../ui/CurtainSheet.tsx"), "utf8");
assert.match(curtain, /closeOnBackdropPress\?: boolean/);
assert.match(curtain, /closeOnBackdropPress = true/);

console.log("upgradePresentation.contract.test.ts: ok");
