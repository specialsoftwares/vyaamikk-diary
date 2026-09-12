/**
 * VYAAMIKK DIARY — INDIA GST TAX-DOCUMENT MODEL
 *
 * This module must not infer GST liability merely from the payment channel.
 *
 * IGST Act section 14 applies to specified OIDAR supplies made from a
 * non-taxable territory to a non-taxable online recipient. It is not a
 * blanket rule making Google Play or Apple the GST supplier for subscriptions
 * sold by an Indian LLP.
 *
 * For India-based Google Play developers, Google's current tax documentation
 * states that the developer remains responsible for determining applicable
 * GST on app / in-app sales; Google separately handles applicable marketplace
 * TDS / GST-TCS obligations.
 *
 * Apple tax treatment must follow the applicable Paid Apps Agreement /
 * Schedule 2, App Store tax settings and India-specific arrangement. Do not
 * assume Apple's tax responsibility until that channel has been formally
 * classified.
 *
 * Therefore tax-document generation is controlled by a verified
 * PlatformTaxPolicy, not merely by whether the buyer supplied a GSTIN.
 *
 * Direct-web/Razorpay sales, when introduced, are developer-direct supplies
 * and have their own explicitly configured GST treatment.
 *
 * Buyer GST registration determines B2B/B2C recipient classification; it
 * does NOT by itself determine whether Special Softwares or a platform is
 * responsible for charging/reporting tax.
 *
 * No tax invoice may be generated from an unconfirmed tax-responsibility
 * policy.
 *
 * Run: npm run test:billing-gst-core
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { BillingError } from "../errors";
import { MemoryBillingStore } from "../store";
import { applyUpdateBillingDetails } from "../callables/updateBillingDetails";
import { applyVerifyGstinManual } from "../callables/verifyGstinManual";
import { assertAdminAuthorized } from "./adminAuth";
import {
  getFinancialYearForDate,
  getFinancialYearStartDate,
  getMonthKey,
  istWallClockToEpochMs,
  parseFinancialYear,
  formatIstCalendarDate,
} from "./financialYearUtils";
import {
  gstStateCodeFromGstin,
  gstStateName,
  isValidGstinFormat,
  normalizeGstin,
} from "./gstin";
import { GST_TAX_DOCUMENT_LEGAL_MODEL } from "./legalContext";
import {
  classifyTaxDocument,
  mayAllocateStatutoryNumber,
  platformTaxPolicy,
  resolvePlatformTaxPolicy,
} from "./platformTaxPolicy";
import { resolvePlaceOfSupply } from "./placeOfSupply";
import { loadSellerTaxIdentity, parsePriceIncludesGst, parseReverseChargeMode, type SellerIdentityConfig } from "./sellerIdentity";
import { calculateGst, isPaiseCalculationValid } from "./taxMath";
import { parseGstrMonth, resolveTaxPeriod } from "./taxPeriod";
import {
  formatTaxInvoiceNumber,
  STATUTORY_DOCUMENT_NUMBER_MAX_LEN,
} from "./invoiceAllocation";
import { formatCreditNoteNumber } from "./creditNote";

const SELLER_GSTIN = "09AAAAA0000A1Z5";
const BUYER_MH_GSTIN = "27AAAAA0000A1Z5";

function isCause(code: string) {
  return (e: unknown) => e instanceof BillingError && e.causeCode === code;
}

function completeSeller(overrides: Partial<SellerIdentityConfig> = {}): SellerIdentityConfig {
  return {
    companyGstin: SELLER_GSTIN,
    companyLegalName: "SPECIAL SOFTWARES LLP (TEST — CERTIFICATE UNCONFIRMED)",
    companyTradeName: "Vyaamikk Diary",
    companyGstRegisteredAddress:
      "TEST REGISTERED ADDRESS PLACEHOLDER — not copied from a GST certificate.",
    configuredStateCode: "09",
    serviceSacCode: "TESTSAC",
    serviceSacDescription: "Test software subscription service (CA approval required)",
    gstRateBps: 1800,
    priceIncludesGst: true,
    reverseChargeMode: "no",
    appleTaxResponsibilityMode: "unconfirmed",
    googleTaxResponsibilityMode: "developer",
    directWebTaxResponsibilityMode: "developer",
    billingEmailFromAddress: "billing@specialsoftwares.com",
    invoiceRendererUrl: "https://renderer.example.test",
    adminIdentityProvisioned: false,
    gstrFilingFrequency: "monthly",
    ...overrides,
  };
}

function testLegalHeaders(): void {
  const here = resolve(process.cwd(), "functions/src/billing/tax");
  const files = readdirSync(here).filter((f) => f.endsWith(".ts"));
  for (const file of files) {
    const src = readFileSync(join(here, file), "utf8");
    assert.match(
      src,
      /must not infer GST liability merely from the payment channel/,
      file
    );
    assert.doesNotMatch(src, /blanket OIDAR rule that Google\/Apple is always the supplier/i);
  }
  assert.match(GST_TAX_DOCUMENT_LEGAL_MODEL, /Buyer GSTIN determines B2B\/B2C/);
  assert.match(GST_TAX_DOCUMENT_LEGAL_MODEL, /Unconfirmed platform policy fails closed/);
}

function testGstin(): void {
  assert.equal(normalizeGstin("  09aaaaa0000a1z5  "), SELLER_GSTIN);
  assert.equal(isValidGstinFormat("09aaaaa0000a1z5"), true);
  assert.equal(isValidGstinFormat("not-a-gstin"), false);
  assert.equal(isValidGstinFormat("99AAAAA0000A1Z5"), false);
  assert.equal(gstStateCodeFromGstin(SELLER_GSTIN), "09");
  assert.equal(gstStateName("09"), "Uttar Pradesh");
  assert.notEqual(gstStateName("09"), "UP");
  assert.notEqual(gstStateCodeFromGstin(SELLER_GSTIN), "MH");
  assert.equal(gstStateCodeFromGstin(BUYER_MH_GSTIN), "27");
  assert.throws(() => gstStateCodeFromGstin("UPAAAAA0000A1Z5"), isCause("gstin_format_invalid"));
}

async function testBillingDetailsAndVerification(): Promise<void> {
  const store = new MemoryBillingStore();
  const uid = "user-1";
  const saved = await applyUpdateBillingDetails(
    store,
    uid,
    { gstin: "  09aaaaa0000a1z5  ", billingBusinessName: "Buyer LLP" },
    1000
  );
  assert.equal(saved.gstin, SELLER_GSTIN);
  assert.equal(saved.gstinVerificationStatus, "pending_manual_verification");
  assert.notEqual(saved.gstinVerificationStatus, "verified");

  await assert.rejects(
    applyUpdateBillingDetails(store, uid, { gstin: "bad" }, 1001),
    isCause("gstin_format_invalid")
  );

  const cleared = await applyUpdateBillingDetails(store, uid, { gstin: null }, 1002);
  assert.equal(cleared.gstin, null);
  assert.equal(cleared.gstinVerificationStatus, "not_provided");

  await applyUpdateBillingDetails(store, uid, { gstin: SELLER_GSTIN }, 1003);
  const admin = {
    uid: "admin-1",
    tokenAdmin: true,
    adminIdentityProvisioned: true,
  };
  await assert.rejects(
    applyVerifyGstinManual(store, {
      targetUid: uid,
      decision: "verified",
      verifiedLegalName: "Buyer LLP",
      verifiedStateCode: "27",
      nowMs: 1004,
      admin,
      adminDiagnosticUid: "admindiag01",
    }),
    isCause("verified_state_code_mismatch")
  );

  const verified = await applyVerifyGstinManual(store, {
    targetUid: uid,
    decision: "verified",
    verifiedLegalName: "Buyer LLP",
    verifiedStateCode: "09",
    nowMs: 1005,
    admin,
    adminDiagnosticUid: "admindiag01",
  });
  assert.equal(verified.gstinVerificationStatus, "verified");
  assert.equal(verified.verifiedStateCode, "09");
  assert.equal(verified.verifiedByDiagnosticUid, "admindiag01");
  assert.notEqual(verified.verifiedByDiagnosticUid, admin.uid);

  const changed = await applyUpdateBillingDetails(
    store,
    uid,
    { gstin: BUYER_MH_GSTIN },
    1006
  );
  assert.equal(changed.gstinVerificationStatus, "pending_manual_verification");
  assert.equal(changed.verifiedLegalName, null);
  assert.equal(changed.verifiedStateCode, null);

  assert.throws(
    () =>
      assertAdminAuthorized({
        uid: "admin-1",
        tokenAdmin: true,
        adminIdentityProvisioned: false,
      }),
    isCause("admin_identity_unprovisioned")
  );
  assert.throws(
    () =>
      assertAdminAuthorized({
        uid: "admin-1",
        tokenAdmin: false,
        adminIdentityProvisioned: true,
      }),
    isCause("admin_claim_required")
  );
}

function testSeller(): void {
  const snap = loadSellerTaxIdentity(completeSeller());
  assert.equal(snap.gstin, SELLER_GSTIN);
  assert.equal(snap.stateCode, "09");
  assert.equal(snap.stateName, "Uttar Pradesh");
  assert.throws(
    () => loadSellerTaxIdentity(completeSeller({ configuredStateCode: "27" })),
    isCause("seller_state_code_mismatch")
  );
  assert.throws(
    () => loadSellerTaxIdentity(completeSeller({ companyLegalName: null })),
    isCause("seller_identity_incomplete")
  );
  assert.throws(
    () => loadSellerTaxIdentity(completeSeller({ companyGstRegisteredAddress: "" })),
    isCause("seller_identity_incomplete")
  );
  assert.throws(
    () => loadSellerTaxIdentity(completeSeller({ companyGstin: null })),
    isCause("seller_identity_incomplete")
  );
}

function testPolicy(): void {
  const google = resolvePlatformTaxPolicy("android");
  assert.equal(google.channel, "google_play_india");
  assert.equal(google.mode, "developer");
  assert.equal(
    classifyTaxDocument({ policy: google, buyerIsVerifiedB2b: true }),
    "tax_invoice_b2b"
  );
  assert.equal(
    classifyTaxDocument({ policy: google, buyerIsVerifiedB2b: false }),
    "tax_invoice_b2c"
  );

  const apple = resolvePlatformTaxPolicy("ios");
  assert.equal(apple.mode, "unconfirmed");
  assert.equal(
    classifyTaxDocument({ policy: apple, buyerIsVerifiedB2b: true }),
    "compliance_review_required"
  );
  assert.equal(mayAllocateStatutoryNumber("compliance_review_required"), false);

  const web = platformTaxPolicy("direct_web_india");
  assert.equal(web.mode, "developer");
  assert.equal(
    classifyTaxDocument({ policy: web, buyerIsVerifiedB2b: false }),
    "tax_invoice_b2c"
  );
}

function testPlaceOfSupply(): void {
  const same = resolvePlaceOfSupply({
    classification: "b2b",
    verifiedRecipientStateCode: "09",
    recipientAddressStateCode: null,
    sellerStateCode: "09",
  });
  assert.equal(same.taxType, "cgst_sgst");
  assert.equal(same.placeOfSupplyStateCode, "09");

  const inter = resolvePlaceOfSupply({
    classification: "b2b",
    verifiedRecipientStateCode: "27",
    recipientAddressStateCode: "09",
    sellerStateCode: "09",
  });
  assert.equal(inter.taxType, "igst");
  assert.equal(inter.placeOfSupplyStateCode, "27");

  const b2cAddr = resolvePlaceOfSupply({
    classification: "b2c",
    verifiedRecipientStateCode: null,
    recipientAddressStateCode: "29",
    sellerStateCode: "09",
  });
  assert.equal(b2cAddr.placeOfSupplyStateCode, "29");
  assert.equal(b2cAddr.taxType, "igst");

  const b2cNone = resolvePlaceOfSupply({
    classification: "b2c",
    verifiedRecipientStateCode: null,
    recipientAddressStateCode: null,
    sellerStateCode: "09",
  });
  assert.equal(b2cNone.placeOfSupplyStateCode, "09");
  assert.equal(b2cNone.taxType, "cgst_sgst");

  assert.throws(
    () =>
      resolvePlaceOfSupply({
        classification: "b2b",
        verifiedRecipientStateCode: null,
        recipientAddressStateCode: null,
        sellerStateCode: "09",
      }),
    isCause("b2b_place_of_supply_unresolved")
  );
}

function testTaxMath(): void {
  const incl = calculateGst({
    totalInPaise: 11800,
    gstRateBps: 1800,
    priceIncludesGst: true,
    taxType: "cgst_sgst",
    currency: "INR",
  });
  assert.equal(incl.taxableAmountInPaise, 10000);
  assert.equal(incl.totalTaxInPaise, 1800);
  assert.equal(incl.cgstInPaise, 900);
  assert.equal(incl.sgstInPaise, 900);
  assert.equal(incl.igstInPaise, 0);
  assert.equal(true, isPaiseCalculationValid(incl));

  const odd = calculateGst({
    totalInPaise: 101,
    gstRateBps: 1800,
    priceIncludesGst: true,
    taxType: "cgst_sgst",
    currency: "INR",
  });
  assert.equal(odd.cgstInPaise + odd.sgstInPaise, odd.totalTaxInPaise);
  assert.equal(
    odd.taxableAmountInPaise + odd.cgstInPaise + odd.sgstInPaise + odd.igstInPaise,
    odd.totalInPaise
  );

  const igst = calculateGst({
    totalInPaise: 11800,
    gstRateBps: 1800,
    priceIncludesGst: true,
    taxType: "igst",
    currency: "INR",
  });
  assert.equal(igst.igstInPaise, 1800);
  assert.equal(igst.cgstInPaise, 0);
  assert.equal(igst.sgstInPaise, 0);
  assert.equal(true, isPaiseCalculationValid(igst));

  assert.throws(
    () =>
      calculateGst({
        totalInPaise: -1,
        gstRateBps: 1800,
        priceIncludesGst: true,
        taxType: "igst",
        currency: "INR",
      }),
    isCause("invalid_paise_amount")
  );
  assert.throws(
    () =>
      calculateGst({
        totalInPaise: 10.5,
        gstRateBps: 1800,
        priceIncludesGst: true,
        taxType: "igst",
        currency: "INR",
      }),
    isCause("invalid_paise_amount")
  );
  assert.throws(
    () =>
      calculateGst({
        totalInPaise: 100,
        gstRateBps: 1800,
        priceIncludesGst: true,
        taxType: "igst",
        currency: "USD" as "INR",
      }),
    isCause("unsupported_invoice_currency")
  );
  assert.throws(
    () =>
      calculateGst({
        totalInPaise: 100,
        gstRateBps: 0,
        priceIncludesGst: true,
        taxType: "igst",
        currency: "INR",
      }),
    isCause("invalid_gst_rate_bps")
  );
}

function testFinancialYear(): void {
  const mar = istWallClockToEpochMs("2027-03-31T23:59:59");
  const apr = istWallClockToEpochMs("2027-04-01T00:00:00");
  assert.equal(getFinancialYearForDate(mar), "2026-27");
  assert.equal(getFinancialYearForDate(apr), "2027-28");
  assert.equal(getMonthKey(mar), "2027-03");
  assert.equal(getMonthKey(apr), "2027-04");
  assert.equal(getFinancialYearForDate(istWallClockToEpochMs("2026-12-31T23:59:59")), "2026-27");
  assert.equal(getFinancialYearForDate(istWallClockToEpochMs("2027-01-01T00:00:00")), "2026-27");
  assert.throws(() => parseFinancialYear("2026-28"), isCause("invalid_financial_year_string"));
  assert.throws(() => parseFinancialYear("FY26"), isCause("invalid_financial_year_string"));
  const start = getFinancialYearStartDate("2026-27");
  assert.equal(getFinancialYearForDate(start), "2026-27");
  assert.equal(getMonthKey(start.getTime()), "2026-04");

  const istBoundary = Date.parse("2026-09-13T00:15:00+05:30");
  assert.equal(formatIstCalendarDate(istBoundary), "13-09-2026");
  assert.notEqual(new Date(istBoundary).toISOString().slice(0, 10), "2026-09-13");
  assert.equal(formatIstCalendarDate(istWallClockToEpochMs("2026-09-12T23:59:59")), "12-09-2026");
  assert.equal(formatIstCalendarDate(istWallClockToEpochMs("2026-09-13T00:00:00")), "13-09-2026");
}

function testTaxPeriodAndMonth(): void {
  assert.deepEqual(parseGstrMonth("2026-09"), { year: 2026, month: 9 });
  assert.throws(() => parseGstrMonth("2026-00"), isCause("invalid_gstr_month"));
  assert.throws(() => parseGstrMonth("2026-13"), isCause("invalid_gstr_month"));
  const same = resolveTaxPeriod({
    supplyOccurredAt: istWallClockToEpochMs("2026-09-12T12:00:00"),
    invoiceIssuedAt: istWallClockToEpochMs("2026-09-30T23:59:59"),
  });
  assert.equal(same.taxPeriodStatus, "resolved");
  assert.equal(same.taxPeriodMonth, "2026-09");
  const cross = resolveTaxPeriod({
    supplyOccurredAt: istWallClockToEpochMs("2027-03-31T23:59:59"),
    invoiceIssuedAt: istWallClockToEpochMs("2027-04-01T00:01:00"),
  });
  assert.equal(cross.taxPeriodStatus, "unresolved_cross_period");
  assert.equal(cross.taxPeriodMonth, null);
}

function testFailClosedConfigAndNumbers(): void {
  assert.equal(parsePriceIncludesGst("true"), true);
  assert.equal(parsePriceIncludesGst("false"), false);
  assert.equal(parsePriceIncludesGst(undefined), null);
  assert.equal(parsePriceIncludesGst("TRUE"), null);
  assert.equal(parsePriceIncludesGst("yes"), null);
  assert.equal(parseReverseChargeMode("yes"), "yes");
  assert.equal(parseReverseChargeMode("no"), "no");
  assert.equal(parseReverseChargeMode(undefined), "unconfirmed");
  assert.equal(parseReverseChargeMode("maybe"), "unconfirmed");
  const ss = formatTaxInvoiceNumber("2026-27", 1);
  const cn = formatCreditNoteNumber("2026-27", 1);
  assert.equal(ss, "SS/2026-27/0001");
  assert.equal(cn, "CN/2026-27/0001");
  assert.ok(ss.length <= STATUTORY_DOCUMENT_NUMBER_MAX_LEN);
  assert.ok(cn.length <= STATUTORY_DOCUMENT_NUMBER_MAX_LEN);
  assert.throws(() => formatTaxInvoiceNumber("2026-27", 100000), isCause("statutory_number_too_long"));
}

async function main(): Promise<void> {
  testLegalHeaders();
  testGstin();
  await testBillingDetailsAndVerification();
  testSeller();
  testPolicy();
  testPlaceOfSupply();
  testTaxMath();
  testFinancialYear();
  testTaxPeriodAndMonth();
  testFailClosedConfigAndNumbers();
  console.log("gst.core.unit.test.ts: ok");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
