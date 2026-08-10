import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PHONE_ENTRY_BRAND_COLORS,
  PHONE_ENTRY_BRAND_TAGLINE,
  PHONE_ENTRY_PROVENANCE_LINE_1,
  PHONE_ENTRY_PROVENANCE_LINE_2,
  shouldShowPhoneEntryBrand,
  shouldShowPhoneEntryProvenance,
} from "./phoneEntryBrandModel";

assert.equal(PHONE_ENTRY_BRAND_TAGLINE, "CREATE RECORDS. GROW BUSINESS.");
assert.equal(PHONE_ENTRY_BRAND_TAGLINE.includes(","), false);
assert.equal(PHONE_ENTRY_BRAND_TAGLINE.endsWith("."), true);
assert.match(PHONE_ENTRY_BRAND_TAGLINE, /RECORDS\./);
assert.match(PHONE_ENTRY_BRAND_TAGLINE, /BUSINESS\.$/);
assert.equal(PHONE_ENTRY_BRAND_TAGLINE.includes("CREATE RECORDS, GROW BUSINESS"), false);
assert.equal(PHONE_ENTRY_BRAND_COLORS.indigo, "#1E1B4B");
assert.equal(PHONE_ENTRY_BRAND_COLORS.periwinkle, "#818CF8");
assert.equal(PHONE_ENTRY_BRAND_COLORS.gold, "#C9A84C");

assert.equal(PHONE_ENTRY_PROVENANCE_LINE_1, "DESIGNED & DEVELOPED BY SPECIAL SOFTWARES");
assert.equal(PHONE_ENTRY_PROVENANCE_LINE_2, "BUILT IN INDIA. BUILT FOR INDIA");
assert.equal(PHONE_ENTRY_PROVENANCE_LINE_2.endsWith("."), false);
assert.equal(PHONE_ENTRY_PROVENANCE_LINE_1.includes("Designed and Developed"), false);
assert.equal(PHONE_ENTRY_PROVENANCE_LINE_2.includes("Made in India"), false);
assert.equal(PHONE_ENTRY_PROVENANCE_LINE_2.includes("Built in India. Built for India."), false);

assert.equal(shouldShowPhoneEntryBrand({ keyboardVisible: false }), true);
assert.equal(shouldShowPhoneEntryBrand({ keyboardVisible: true }), false);
assert.equal(
  shouldShowPhoneEntryProvenance({ keyboardVisible: false, windowHeight: 800 }),
  true
);
assert.equal(
  shouldShowPhoneEntryProvenance({ keyboardVisible: true, windowHeight: 800 }),
  false
);
assert.equal(
  shouldShowPhoneEntryProvenance({ keyboardVisible: false, windowHeight: 600 }),
  false
);

const screens = join(__dirname, "../screens");
const phone = readFileSync(join(screens, "PhoneEntryScreen.tsx"), "utf8");
const email = readFileSync(join(screens, "EmailEntryScreen.tsx"), "utf8");
const emailOtp = readFileSync(join(screens, "EmailOtpScreen.tsx"), "utf8");
const phoneOtp = readFileSync(join(screens, "OtpVerificationScreen.tsx"), "utf8");
const identity = readFileSync(join(screens, "BusinessIdentityScreen.tsx"), "utf8");
const shell = readFileSync(join(__dirname, "AuthShell.tsx"), "utf8");
const signature = readFileSync(join(__dirname, "PhoneEntryBrandSignature.tsx"), "utf8");
const model = readFileSync(join(__dirname, "phoneEntryBrandModel.ts"), "utf8");

assert.ok(phone.includes("PhoneEntryBrandSignature"));
assert.equal(phone.includes("midSlot"), false);
assert.ok(phone.includes("auth-v2-phone-continue"));
assert.ok(phone.indexOf("auth-v2-phone-continue") < phone.indexOf("PhoneEntryBrandSignature />"));
assert.equal(email.includes("PhoneEntryBrandSignature"), false);
assert.equal(emailOtp.includes("PhoneEntryBrandSignature"), false);
assert.equal(phoneOtp.includes("PhoneEntryBrandSignature"), false);
assert.equal(identity.includes("PhoneEntryBrandSignature"), false);
assert.equal(shell.includes("midSlot"), false);
assert.equal(signature.includes("CREATE RECORDS, GROW BUSINESS"), false);
assert.equal(model.includes("CREATE RECORDS, GROW BUSINESS"), false);
assert.ok(signature.includes("PHONE_ENTRY_BRAND_TAGLINE"));
assert.ok(signature.includes("PHONE_ENTRY_PROVENANCE_LINE_1"));
assert.ok(signature.includes("PHONE_ENTRY_PROVENANCE_LINE_2"));
assert.equal(signature.includes("Made in India"), false);
assert.equal(model.includes("Made in India"), false);

console.log("phoneEntryBrandModel.test.ts: ok");
