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
const hi = readFileSync(join(root, "../../i18n/locales/hi.ts"), "utf8");
const en = readFileSync(join(root, "../../i18n/locales/en.ts"), "utf8");
const route = readFileSync(
  join(root, "../../../app/(app)/settings/billing-ux-preview.tsx"),
  "utf8"
);
const settings = readFileSync(
  join(root, "../../../app/(app)/(tabs)/settings.tsx"),
  "utf8"
);
const publicPreview = readFileSync(
  join(root, "../../../app/(public)/billing-ux-preview.tsx"),
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
assert.match(sheet, /billing\.upgrade\.letterheadIncluded/);
assert.match(en, /letterheadIncluded:/);
assert.match(hi, /letterheadIncluded:/);
assert.match(en, /do not require buying a pack during this period/);
assert.doesNotMatch(en.slice(en.indexOf("plans:"), en.indexOf("trialNote:")), /[Ll]etterhead/);
assert.doesNotMatch(hi.slice(hi.indexOf("plans:"), hi.indexOf("trialNote:")), /लेटरहेड/);
assert.match(sheet, /decideUpgradeSheetDispatch/);
assert.match(sheet, /sheetDispatch\.primaryPress/);
assert.match(sheet, /sheetDispatch\.restoreEnabled/);
assert.match(sheet, /trialActionAvailable/);
assert.match(sheet, /onStartTrial/);
assert.doesNotMatch(sheet, /if \(resolvedSku && purchaseEnabled\) onPurchase\(resolvedSku\)/);
assert.doesNotMatch(sheet, /grantProfessionalTrial/);
assert.doesNotMatch(sheet, /https\.onCall/);
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
assert.match(lab, /CLIENT_MANUAL_TRIAL_START_SUPPORTED/);
assert.match(lab, /onStartTrial/);
assert.match(lab, /purchase:\$\{sku\}/);
assert.match(lab, /setLastPreviewAction\("trial"\)/);
assert.match(lab, /billing\.preview\.entitlement/);
assert.match(lab, /billing\.preview\.restorePending/);
assert.match(sheet, /restoreCtaLabel/);
assert.doesNotMatch(sheet, /restoreEnabled \? t\("billing\.upgrade\.ctaRestore"\)/);
assert.match(hi, /ट्रायल-अपात्र फिक्स्चर/);
assert.doesNotMatch(hi, /ट्रायल-अपत्र फिक्स्चर/);
assert.doesNotMatch(lab, /useIap\b/);
assert.doesNotMatch(lab, /grantProfessionalTrial/);
assert.match(route, /isBillingUxPreviewEnabled/);
assert.match(route, /Redirect/);
assert.match(publicPreview, /isBillingUxPreviewEnabled/);
assert.match(publicPreview, /BillingUxPreviewLab/);
assert.match(publicPreview, /Redirect/);
assert.match(publicPreview, /\/\(public\)\/landing/);
assert.doesNotMatch(publicPreview, /useIap\b/);
assert.doesNotMatch(publicPreview, /onPurchase/);
assert.match(settings, /isBillingUxPreviewEnabled\(\)/);
assert.match(settings, /billing-ux-preview/);
assert.doesNotMatch(settings, /Subscription & Billing/);

const header = stripComments(read("../ui/Header.tsx"));
assert.match(header, /backAccessibilityLabel\?: string/);
assert.match(header, /common\.goBack/);

const curtain = readFileSync(join(root, "../ui/CurtainSheet.tsx"), "utf8");
assert.match(curtain, /closeOnBackdropPress\?: boolean/);
assert.match(curtain, /closeOnBackdropPress = true/);

console.log("upgradePresentation.contract.test.ts: ok");
