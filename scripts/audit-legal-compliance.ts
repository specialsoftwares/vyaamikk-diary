/**
 * Static compliance checks for store-readiness wiring.
 * Run: npm run audit:legal-compliance
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function ok(message: string) {
  console.log(`OK: ${message}`);
}

const en = read("src/i18n/locales/en.json");
const settings = read("app/(app)/(tabs)/settings.tsx");
const phoneEntry = read("src/auth-v2/screens/PhoneEntryScreen.tsx");
const authGate = read("src/auth-v2/AuthFlowGate.tsx");
const envExample = read(".env.example");
const legalTs = read("src/config/legal.ts");
const validation = read("src/utils/validation.ts");

if (/example\.com|support@.*\.example/i.test(envExample)) {
  fail(".env.example still contains example.com legal URLs or .example support email");
}
ok(".env.example legal URLs are not example.com");

if (!legalTs.includes("findLegalConfigBlockers")) {
  fail("src/config/legal.ts missing findLegalConfigBlockers");
}
ok("Legal config exports findLegalConfigBlockers");

if (!settings.includes("deleteAccountAndData")) {
  fail("Settings tab missing Delete Account & Data entry");
}
ok("Settings has Delete Account & Data");

if (!settings.includes('router.push("/(app)/settings/legal")')) {
  fail("Settings legal row does not route to in-app legal hub");
}
ok("Settings legal hub route present");

const termsRows = (settings.match(/settings\.terms/g) ?? []).length;
if (termsRows > 0) {
  fail("Settings tab still references duplicate settings.terms row");
}
ok("No duplicate Terms row in Settings tab");

if (!phoneEntry.includes("LegalConsentCheckboxes")) {
  fail("Phone entry missing affirmative consent checkboxes");
}
if (!phoneEntry.includes("!consentReady")) {
  fail("Phone continue button does not block on consent");
}
ok("Onboarding consent checkboxes gate phone continue");

if (!authGate.includes("savePendingConsent")) {
  fail("AuthFlowGate does not log pending consent before OTP send");
}
if (!authGate.includes("consentPatchForProfile")) {
  fail("AuthFlowGate does not attach consent after OTP");
}
ok("Consent logged at OTP send and attached after verify");

if (!en.includes('"deleteAccountAndData"')) {
  fail("en.json missing deleteAccountAndData copy");
}
ok("Delete Account & Data copy present in en.json");

if (!validation.includes("optionalIdentityField")) {
  fail("Onboarding validation still requires all identity fields");
}
ok("Onboarding core schema minimizes required fields");

if (!read("app.json").includes("NSCameraUsageDescription")) {
  fail("app.json missing NSCameraUsageDescription");
}
ok("Camera purpose string declared");

if (!read("src/services/accountDeletion/firebaseServerDeletion.ts").includes("callCompleteAccountDeletion")) {
  fail("Production deletion Cloud Function not wired");
}
ok("Production deletion prefers Cloud Function");

console.log("\nAll legal compliance checks passed.");
