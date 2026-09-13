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
 * responsible for charging GST.
 *
 * No tax invoice may be generated from an unconfirmed tax-responsibility
 * policy.
 *
 * Run: npm run test:billing-gst-documents
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { EmailProvider } from "../../email/provider";
import { createInvoiceDownloadUrl } from "../callables/getInvoiceDownloadUrl";
import { applyUpdateBillingDetails } from "../callables/updateBillingDetails";
import { applyVerifyGstinManual } from "../callables/verifyGstinManual";
import { BillingError } from "../errors";
import {
  billingDetailsPath,
  companyBillingPath,
  financialLedgerPath,
  invoiceRetryQueuePath,
  subscriptionHistoryPath,
  subscriptionTaxCompliancePath,
  creditNoteCounterPath,
} from "../paths";
import { MemoryBillingStore } from "../store";
import type { BillingStore, BillingTransaction } from "../store";
import type {
  BillingEventLedgerDoc,
  CompanyBillingDoc,
  SubscriptionBillingDetailsDoc,
  SubscriptionInvoiceDoc,
  SubscriptionTaxComplianceDoc,
} from "../types";
import {
  developerCreditNoteRequired,
  finalizeSubscriptionCreditNote,
} from "./creditNote";
import { istWallClockToEpochMs, formatIstCalendarDate } from "./financialYearUtils";
import { APPROVED_RENDERING_PROFILE, buildSubscriptionCreditNoteHtml, buildSubscriptionTaxDocumentHtml } from "./htmlDocument";
import {
  allocateInvoiceStub,
  applyOperationalInvoicePatch,
  invoiceIdForFinancialEvent,
} from "./invoiceAllocation";
import { authoritativeVerifiedEmail, sendInvoiceEmail, shouldAttemptInvoiceEmail } from "./invoiceEmail";
import {
  CloudRunInvoicePdfRenderer,
  FakeInvoicePdfRenderer,
  MissingRenderer,
  createInvoicePdfRenderer,
} from "./pdfRenderer";
import { enqueueInvoiceRetry, resolveInvoiceRetryStage, INVOICE_RETRY_MAX_ATTEMPTS } from "./retryQueue";
import type { SellerIdentityConfig } from "./sellerIdentity";
import { notApplicableChannelEco, unreviewedChannelEco } from "./sellerIdentity";
import { finalizeUnissuedInvoice } from "./taxDocumentFinalization";
import { applyReviewTaxCompliance } from "./taxCompliance";
import { MemoryTaxComplianceReportSource } from "./taxComplianceReportSource";
import { buildGstr1WorkingPapers } from "./gstr1WorkingPapers";
import {
  MemoryInvoiceObjectStorage,
  orchestrateTaxDocument,
} from "./taxDocumentOrchestrator";

const NOW = 1_800_000_000_000;
const SELLER_GSTIN = "09AAAAA0000A1Z5";

function isCause(code: string) {
  return (e: unknown) => e instanceof BillingError && e.causeCode === code;
}

function sellerConfig(overrides: Partial<SellerIdentityConfig> = {}): SellerIdentityConfig {
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
    reverseChargeMode: "no" as const,
    appleTaxResponsibilityMode: "unconfirmed" as const,
    googleTaxResponsibilityMode: "developer" as const,
    directWebTaxResponsibilityMode: "developer" as const,
    googleEco: unreviewedChannelEco("google_play"),
    appleEco: unreviewedChannelEco("apple_app_store"),
    directWebEco: notApplicableChannelEco(null),
    billingEmailFromAddress: "billing@example.test",
    invoiceRendererUrl: "https://renderer.example.test",
    adminIdentityProvisioned: false,
    gstrFilingFrequency: "monthly",
    ...overrides,
  };
}

function ledger(patch: Partial<BillingEventLedgerDoc> & { financialEventId: string }): BillingEventLedgerDoc {
  return {
    platform: "android",
    uid: "user-1",
    canonicalSku: "vyd_professional_yearly",
    eventType: "purchase",
    grossAmountInPaise: 11800,
    currency: "INR",
    actualPlatformCommissionInPaise: 1770,
    estimatedPlatformCommissionInPaise: null,
    occurredAt: istWallClockToEpochMs("2026-09-12T12:00:00"),
    monthKey: "2026-09",
    relatedFinancialEventId: null,
    recordedAt: NOW,
    recordedBy: "androidValidation",
    ...patch,
  };
}

function seedLedger(store: MemoryBillingStore, doc: BillingEventLedgerDoc): void {
  store.docs.set(financialLedgerPath(doc.financialEventId), { ...doc });
}

function fakeEmail(fail = false): EmailProvider & { sends: unknown[] } {
  const sends: unknown[] = [];
  return {
    sends,
    async send(input) {
      sends.push(input);
      if (fail) return { delivered: false, provider: "resend", errorCode: "EMAIL_PROVIDER_UNAVAILABLE" };
      return { delivered: true, provider: "resend", providerMessageId: "re_msg_1" };
    },
  };
}

function emptyBuyer(): SubscriptionBillingDetailsDoc {
  return {
    gstin: null,
    billingRecipientName: null,
    billingBusinessName: null,
    billingAddressLine1: null,
    billingAddressLine2: null,
    billingCity: null,
    billingPostalCode: null,
    billingStateCode: null,
    billingStateName: null,
    gstinVerificationStatus: "not_provided",
    verifiedLegalName: null,
    verifiedStateCode: null,
    verifiedAt: null,
    verifiedByDiagnosticUid: null,
    updatedAt: NOW,
  };
}

function completeB2cDetails(): SubscriptionBillingDetailsDoc {
  return {
    ...emptyBuyer(),
    billingRecipientName: "Test Recipient",
    billingAddressLine1: "1 Test Street",
    billingCity: "Lucknow",
    billingPostalCode: "226001",
    billingStateCode: "09",
    billingStateName: "Uttar Pradesh",
  };
}

function completeB2bDetails(): SubscriptionBillingDetailsDoc {
  return {
    ...emptyBuyer(),
    gstin: "27AAAAA0000A1Z5",
    gstinVerificationStatus: "verified",
    verifiedLegalName: "Buyer LLP",
    verifiedStateCode: "27",
    billingRecipientName: "Buyer Contact",
    billingBusinessName: "Buyer LLP",
    billingAddressLine1: "12 MG Road",
    billingCity: "Mumbai",
    billingPostalCode: "400001",
    billingStateCode: "27",
    billingStateName: "Maharashtra",
    verifiedAt: NOW,
    verifiedByDiagnosticUid: "admindiag01",
  };
}

function skeleton(partial: Partial<SubscriptionInvoiceDoc> & Pick<SubscriptionInvoiceDoc, "invoiceId" | "financialEventId" | "documentType">): SubscriptionInvoiceDoc {
  return {
    uid: "user-1",
    diagnosticUid: "diag01",
    platform: "android",
    canonicalSku: "vyd_professional_yearly",
    plan: "professional",
    billingPeriod: "yearly",
    taxResponsibilityMode: "developer",
    documentNumber: null,
    financialYear: "2026-27",
    taxPeriodMonth: "2026-09",
    taxPeriodStatus: "pending_issue",
    invoiceIssuedAt: null,
    invoiceIssuedOnIst: null,
    supplyOccurredAt: NOW,
    issueStatus: "unissued_draft",
    issueHoldReason: null,
    reverseChargeMode: "no",
    subscriptionDescription: "Vyaamikk Diary Professional Subscription (Yearly)",
    seller: null,
    buyer: {
      classification: "b2c",
      legalName: null,
      gstin: null,
      gstinVerificationStatus: "not_provided",
      billingAddress: null,
      postalCode: null,
      stateCode: null,
      stateName: null,
    },
    placeOfSupplyStateCode: "09",
    placeOfSupplyStateName: "Uttar Pradesh",
    sacCode: "TESTSAC",
    serviceDescription: "Test",
    currency: "INR",
    grossCustomerAmountInPaise: 11800,
    taxableAmountInPaise: 10000,
    gstRateBps: 1800,
    taxType: "cgst_sgst",
    cgstInPaise: 900,
    sgstInPaise: 900,
    igstInPaise: 0,
    totalTaxInPaise: 1800,
    totalInPaise: 11800,
    platformCommissionInPaise: 1770,
    ecoReporting: {
      platform: "android",
      operatorIdentifier: "google_play",
      operatorGstin: null,
      taxResponsibilityMode: "developer",
      ecoReportingCategory: "requires_tax_review",
    },
    pdfStatus: "pending",
    invoicePdfStoragePath: null,
    emailStatus: "pending",
    emailProviderMessageId: null,
    invoiceEmailAcceptedAt: null,
    invoiceEmailDeliveredAt: null,
    gstrReportable: true,
    gstrReportedMonth: null,
    gstrFilingBatchId: null,
    historyEventId: null,
    invoiceIssueDueAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  };
}

async function orchestrate(opts: {
  store: MemoryBillingStore;
  event: BillingEventLedgerDoc;
  renderer?: FakeInvoicePdfRenderer | MissingRenderer;
  email?: EmailProvider;
  user?: { emailStatus: string; normalizedEmail?: string | null };
  historyEventId?: string;
  config?: SellerIdentityConfig;
  nowMs?: number;
  storage?: MemoryInvoiceObjectStorage;
}) {
  const uid = opts.event.uid;
  if (!opts.store.docs.has(billingDetailsPath(uid))) {
    opts.store.docs.set(billingDetailsPath(uid), { ...completeB2cDetails() });
  }
  return orchestrateTaxDocument(
    {
      store: opts.store,
      config: opts.config ?? sellerConfig(),
      renderer: opts.renderer ?? new FakeInvoicePdfRenderer(),
      storage: opts.storage ?? new MemoryInvoiceObjectStorage(),
      email: opts.email ?? fakeEmail(),
      loadUser: async () => opts.user ?? { emailStatus: "verified", normalizedEmail: "owner@example.com" },
      diagnosticUidFor: () => "diag01",
      nowMs: opts.nowMs ?? NOW,
      historyEventId: opts.historyEventId,
    },
    opts.event.financialEventId
  );
}

async function testAllocationConcurrency(): Promise<void> {
  const store = new MemoryBillingStore();
  const a = skeleton({
    invoiceId: invoiceIdForFinancialEvent("evt-a"),
    financialEventId: "evt-a",
    documentType: "tax_invoice_b2c",
  });
  const b = skeleton({
    invoiceId: invoiceIdForFinancialEvent("evt-b"),
    financialEventId: "evt-b",
    documentType: "tax_invoice_b2c",
  });
  const [ra, rb] = await Promise.all([
    allocateInvoiceStub(store, { stub: a, financialYear: "2026-27", nowMs: NOW, allocateNumber: true }),
    allocateInvoiceStub(store, { stub: b, financialYear: "2026-27", nowMs: NOW, allocateNumber: true }),
  ]);
  assert.notEqual(ra.invoice.documentNumber, rb.invoice.documentNumber);
  assert.equal(new Set([ra.invoice.documentNumber, rb.invoice.documentNumber]).size, 2);

  const retry = await allocateInvoiceStub(store, {
    stub: a,
    financialYear: "2026-27",
    nowMs: NOW + 1,
    allocateNumber: true,
  });
  assert.equal(retry.reused, true);
  assert.equal(retry.invoice.documentNumber, ra.invoice.documentNumber);

  const blocked = skeleton({
    invoiceId: invoiceIdForFinancialEvent("evt-apple"),
    financialEventId: "evt-apple",
    documentType: "compliance_review_required",
    taxResponsibilityMode: "unconfirmed",
  });
  const noNum = await allocateInvoiceStub(store, {
    stub: blocked,
    financialYear: "2026-27",
    nowMs: NOW,
    allocateNumber: true,
  });
  assert.equal(noNum.invoice.documentNumber, null);
}

async function testOrchestratorAuthorityAndRetries(): Promise<void> {
  const store = new MemoryBillingStore();
  await assert.rejects(
    orchestrateTaxDocument(
      {
        store,
        config: sellerConfig(),
        renderer: new FakeInvoicePdfRenderer(),
        storage: new MemoryInvoiceObjectStorage(),
        email: fakeEmail(),
        loadUser: async () => ({ emailStatus: "verified", normalizedEmail: "a@b.c" }),
        diagnosticUidFor: () => "diag01",
        nowMs: NOW,
      },
      "missing-event"
    ),
    isCause("financial_event_missing")
  );

  const evidence = ledger({ financialEventId: "evt-bad-amt", grossAmountInPaise: -5 });
  seedLedger(store, evidence);
  const waiting = await orchestrate({ store, event: evidence });
  assert.equal(waiting.pdfStatus, "awaiting_financial_evidence");
  assert.equal(waiting.documentNumber, null);

  const appleStore = new MemoryBillingStore();
  const appleEvt = ledger({ financialEventId: "evt-ios", platform: "ios" });
  seedLedger(appleStore, appleEvt);
  const appleInv = await orchestrate({ store: appleStore, event: appleEvt });
  assert.equal(appleInv.documentType, "compliance_review_required");
  assert.equal(appleInv.documentNumber, null);
  assert.equal(appleInv.taxResponsibilityMode, "unconfirmed");

  const googleStore = new MemoryBillingStore();
  const gEvt = ledger({ financialEventId: "evt-g1" });
  seedLedger(googleStore, gEvt);
  const failing = {
    async renderHtmlToPdf() {
      throw new BillingError({
        clientCode: "temporary_unavailable",
        causeCode: "invoice_pdf_failed",
        retryable: true,
      });
    },
  };
  const failedPdf = await orchestrate({
    store: googleStore,
    event: gEvt,
    renderer: failing as unknown as FakeInvoicePdfRenderer,
  });
  assert.equal(failedPdf.pdfStatus, "failed");
  assert.match(failedPdf.documentNumber ?? "", /^SS\/2026-27\/0001$/);

  const recovered = await orchestrate({
    store: googleStore,
    event: gEvt,
    renderer: new FakeInvoicePdfRenderer(),
  });
  assert.equal(recovered.documentNumber, failedPdf.documentNumber);
  assert.equal(recovered.pdfStatus, "ready");

  const emailStore = new MemoryBillingStore();
  const eEvt = ledger({ financialEventId: "evt-email" });
  seedLedger(emailStore, eEvt);
  const mailedFail = await orchestrate({
    store: emailStore,
    event: eEvt,
    email: fakeEmail(true),
  });
  assert.equal(mailedFail.documentNumber, "SS/2026-27/0001");
  assert.equal(mailedFail.emailStatus, "failed");
  const mailedRetry = await orchestrate({
    store: emailStore,
    event: eEvt,
    email: fakeEmail(),
  });
  assert.equal(mailedRetry.documentNumber, mailedFail.documentNumber);

  const twoStore = new MemoryBillingStore();
  const r1 = ledger({ financialEventId: "renew-1", eventType: "renewal" });
  const r2 = ledger({ financialEventId: "renew-2", eventType: "renewal" });
  seedLedger(twoStore, r1);
  seedLedger(twoStore, r2);
  twoStore.docs.set(companyBillingPath("user-1"), {
    uid: "user-1",
    platform: "android",
    canonicalSku: "vyd_professional_yearly",
    productId: "x",
    basePlanId: null,
    latestOrderId: null,
    originalTransactionId: null,
    credentialFingerprint: null,
    encryptedPurchaseCredential: null,
    invalidatedCredentialFingerprints: [],
    lastReconciledAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  } satisfies CompanyBillingDoc);
  const inv1 = await orchestrate({ store: twoStore, event: r1 });
  const inv2 = await orchestrate({ store: twoStore, event: r2 });
  assert.notEqual(inv1.invoiceId, inv2.invoiceId);
  assert.notEqual(inv1.documentNumber, inv2.documentNumber);
  const pointer = twoStore.docs.get(companyBillingPath("user-1")) as CompanyBillingDoc;
  assert.equal(pointer.latestTaxDocumentId, inv2.invoiceId);
  assert.ok(twoStore.docs.has(`_subscriptionInvoices/${inv1.invoiceId}`));
  assert.ok(twoStore.docs.has(`_subscriptionInvoices/${inv2.invoiceId}`));

  const histStore = new MemoryBillingStore();
  const hEvt = ledger({ financialEventId: "hist-1" });
  seedLedger(histStore, hEvt);
  histStore.docs.set(subscriptionHistoryPath("user-1", "hist-evt"), {
    type: "purchaseActivated",
    occurredAt: NOW,
    planAfter: "professional",
    billingStatusAfter: "active",
    platform: "android",
    canonicalSku: "vyd_professional_yearly",
    amountInPaise: 11800,
    currency: "INR",
  });
  const withHist = await orchestrate({
    store: histStore,
    event: hEvt,
    historyEventId: "hist-evt",
  });
  const hist = histStore.docs.get(subscriptionHistoryPath("user-1", "hist-evt")) as Record<string, unknown>;
  assert.equal(hist.taxDocumentId, withHist.invoiceId);
  assert.equal(hist.invoiceAvailableForDownload, true);

  const skipStore = new MemoryBillingStore();
  const skipEvt = ledger({ financialEventId: "evt-skip-email" });
  seedLedger(skipStore, skipEvt);
  const skippedInv = await orchestrate({
    store: skipStore,
    event: skipEvt,
    user: { emailStatus: "unverified", normalizedEmail: "a@b.c" },
  });
  assert.equal(skippedInv.emailStatus, "skipped_no_verified_email");

  const missingRendererStore = new MemoryBillingStore();
  const mrEvt = ledger({ financialEventId: "evt-norender" });
  seedLedger(missingRendererStore, mrEvt);
  const awaiting = await orchestrate({
    store: missingRendererStore,
    event: mrEvt,
    renderer: new MissingRenderer(),
  });
  assert.equal(awaiting.pdfStatus, "awaiting_renderer");
  assert.ok(awaiting.documentNumber);
}

async function testCreditNotes(): Promise<void> {
  const store = new MemoryBillingStore();
  const purchaseId = "inv-orig";
  const refundId = "refund-1";
  seedLedger(store, ledger({ financialEventId: purchaseId }));
  store.docs.set(billingDetailsPath("user-1"), { ...completeB2bDetails() });
  const original = await orchestrate({ store, event: ledger({ financialEventId: purchaseId }) });
  assert.equal(developerCreditNoteRequired(original), true);
  seedLedger(
    store,
    ledger({
      financialEventId: refundId,
      eventType: "refund",
      relatedFinancialEventId: purchaseId,
      occurredAt: istWallClockToEpochMs("2026-09-20T12:00:00"),
      monthKey: "2026-09",
    })
  );
  const first = await finalizeSubscriptionCreditNote(store, {
    refundFinancialEventId: refundId,
    diagnosticUidFor: () => "diag01",
    nowMs: NOW,
    section34CreditNotePolicy: "full_refund_developer_tax_invoice",
  });
  assert.match(first.creditNote.documentNumber ?? "", /^CN\/2026-27\/0001$/);
  assert.equal(first.creditNote.originalInvoiceId, original.invoiceId);
  assert.equal(first.creditNote.totalReversedInPaise, original.totalInPaise);
  assert.equal(first.creditNote.taxableAmountReversedInPaise, original.taxableAmountInPaise);
  assert.equal(first.creditNote.nature, "CREDIT NOTE");
  assert.equal(first.creditNote.seller?.legalName, original.seller?.legalName);
  assert.equal(first.creditNote.seller?.gstin, original.seller?.gstin);
  assert.equal(first.creditNote.seller?.registeredAddress, original.seller?.registeredAddress);
  assert.equal(first.creditNote.buyer?.legalName, original.buyer.legalName);
  assert.equal(first.creditNote.buyer?.billingAddress, original.buyer.billingAddress);
  assert.equal(first.creditNote.buyer?.gstin, original.buyer.gstin);
  assert.equal(first.creditNote.originalDocumentNumber, original.documentNumber);
  assert.equal(first.creditNote.originalInvoiceIssuedOnIst, original.invoiceIssuedOnIst);
  assert.equal(first.creditNote.gstRateBps, original.gstRateBps);
  assert.equal(first.creditNote.igstReversedInPaise, original.igstInPaise);
  assert.equal(first.creditNote.gstAdjustmentEligibility, "requires_review");
  const cnHtml = buildSubscriptionCreditNoteHtml(first.creditNote);
  assert.match(cnHtml, /CREDIT NOTE/);
  assert.match(cnHtml, /Nature of document: CREDIT NOTE/);
  assert.match(cnHtml, /SPECIAL SOFTWARES LLP/);
  assert.match(cnHtml, /Buyer LLP/);
  assert.match(cnHtml, new RegExp(original.documentNumber?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") ?? "missing"));
  assert.match(cnHtml, /Taxable value credited/);
  assert.ok((first.creditNote.documentNumber ?? "").length <= 16);
  const retry = await finalizeSubscriptionCreditNote(store, {
    refundFinancialEventId: refundId,
    diagnosticUidFor: () => "diag01",
    nowMs: NOW + 5,
    section34CreditNotePolicy: "full_refund_developer_tax_invoice",
  });
  assert.equal(retry.reused, true);
  assert.equal(retry.creditNote.documentNumber, first.creditNote.documentNumber);

  const overStore = new MemoryBillingStore();
  seedLedger(overStore, ledger({ financialEventId: purchaseId }));
  overStore.docs.set(billingDetailsPath("user-1"), { ...completeB2bDetails() });
  await orchestrate({ store: overStore, event: ledger({ financialEventId: purchaseId }) });
  seedLedger(
    overStore,
    ledger({
      financialEventId: "refund-over",
      eventType: "refund",
      relatedFinancialEventId: purchaseId,
      grossAmountInPaise: 20000,
    })
  );
  await assert.rejects(
    finalizeSubscriptionCreditNote(overStore, {
      refundFinancialEventId: "refund-over",
      diagnosticUidFor: () => "diag01",
      nowMs: NOW,
      section34CreditNotePolicy: "full_refund_developer_tax_invoice",
    }),
    isCause("credit_exceeds_original")
  );

  const partialStore = new MemoryBillingStore();
  seedLedger(partialStore, ledger({ financialEventId: purchaseId }));
  partialStore.docs.set(billingDetailsPath("user-1"), { ...completeB2bDetails() });
  await orchestrate({ store: partialStore, event: ledger({ financialEventId: purchaseId }) });
  seedLedger(
    partialStore,
    ledger({
      financialEventId: "refund-partial",
      eventType: "refund",
      relatedFinancialEventId: purchaseId,
      grossAmountInPaise: 5900,
    })
  );
  await assert.rejects(
    finalizeSubscriptionCreditNote(partialStore, {
      refundFinancialEventId: "refund-partial",
      diagnosticUidFor: () => "diag01",
      nowMs: NOW,
      section34CreditNotePolicy: "full_refund_developer_tax_invoice",
    }),
    isCause("partial_refund_not_supported")
  );

  const secondCnStore = new MemoryBillingStore();
  seedLedger(secondCnStore, ledger({ financialEventId: purchaseId }));
  secondCnStore.docs.set(billingDetailsPath("user-1"), { ...completeB2bDetails() });
  await orchestrate({ store: secondCnStore, event: ledger({ financialEventId: purchaseId }) });
  seedLedger(
    secondCnStore,
    ledger({
      financialEventId: refundId,
      eventType: "refund",
      relatedFinancialEventId: purchaseId,
    })
  );
  await finalizeSubscriptionCreditNote(secondCnStore, {
    refundFinancialEventId: refundId,
    diagnosticUidFor: () => "diag01",
    nowMs: NOW,
    section34CreditNotePolicy: "full_refund_developer_tax_invoice",
  });
  seedLedger(
    secondCnStore,
    ledger({
      financialEventId: "refund-2",
      eventType: "refund",
      relatedFinancialEventId: purchaseId,
    })
  );
  await assert.rejects(
    finalizeSubscriptionCreditNote(secondCnStore, {
      refundFinancialEventId: "refund-2",
      diagnosticUidFor: () => "diag01",
      nowMs: NOW + 1,
      section34CreditNotePolicy: "full_refund_developer_tax_invoice",
    }),
    isCause("credit_exceeds_original")
  );

  await assert.rejects(
    finalizeSubscriptionCreditNote(secondCnStore, {
      refundFinancialEventId: "refund-2",
      diagnosticUidFor: () => "diag01",
      nowMs: NOW + 2,
      section34CreditNotePolicy: "unconfirmed",
    }),
    isCause("gst_credit_note_policy_unconfirmed")
  );

  const chargebackStore = new MemoryBillingStore();
  seedLedger(chargebackStore, ledger({ financialEventId: purchaseId }));
  chargebackStore.docs.set(billingDetailsPath("user-1"), { ...completeB2bDetails() });
  await orchestrate({ store: chargebackStore, event: ledger({ financialEventId: purchaseId }) });
  seedLedger(
    chargebackStore,
    ledger({
      financialEventId: "cb-1",
      eventType: "chargeback",
      relatedFinancialEventId: purchaseId,
    })
  );
  await assert.rejects(
    finalizeSubscriptionCreditNote(chargebackStore, {
      refundFinancialEventId: "cb-1",
      diagnosticUidFor: () => "diag01",
      nowMs: NOW,
      section34CreditNotePolicy: "full_refund_developer_tax_invoice",
    }),
    isCause("chargeback_credit_note_not_automatic")
  );
  const cbPapers = buildGstr1WorkingPapers({
    month: "2026-09",
    ...(await new MemoryTaxComplianceReportSource(chargebackStore).loadMonthlyScope("2026-09")),
  });
  assert.equal(cbPapers.reviewStatus, "requires_tax_review");
  assert.ok(cbPapers.taxAdjustments.some((row) => row.eventType === "chargeback"));
  assert.ok(
    cbPapers.complianceOpenItems.some((i) => i.unresolvedReasons.includes("gst_adjustment_requires_review"))
  );

  const lateStore = new MemoryBillingStore();
  seedLedger(lateStore, ledger({ financialEventId: purchaseId }));
  lateStore.docs.set(billingDetailsPath("user-1"), { ...completeB2bDetails() });
  await orchestrate({ store: lateStore, event: ledger({ financialEventId: purchaseId }) });
  seedLedger(
    lateStore,
    ledger({
      financialEventId: "refund-late",
      eventType: "refund",
      relatedFinancialEventId: purchaseId,
    })
  );
  const lateCn = await finalizeSubscriptionCreditNote(lateStore, {
    refundFinancialEventId: "refund-late",
    diagnosticUidFor: () => "diag01",
    nowMs: istWallClockToEpochMs("2027-12-01T00:00:00"),
    section34CreditNotePolicy: "full_refund_developer_tax_invoice",
  });
  assert.equal(lateCn.creditNote.gstAdjustmentEligibility, "ineligible_for_output_tax_reduction");

  const raceStore = new MemoryBillingStore();
  seedLedger(raceStore, ledger({ financialEventId: purchaseId }));
  raceStore.docs.set(billingDetailsPath("user-1"), { ...completeB2bDetails() });
  const racedOriginal = await orchestrate({
    store: raceStore,
    event: ledger({ financialEventId: purchaseId }),
  });
  seedLedger(
    raceStore,
    ledger({
      financialEventId: "refund-race-a",
      eventType: "refund",
      relatedFinancialEventId: purchaseId,
    })
  );
  seedLedger(
    raceStore,
    ledger({
      financialEventId: "refund-race-b",
      eventType: "refund",
      relatedFinancialEventId: purchaseId,
    })
  );
  const raced = await Promise.allSettled([
    finalizeSubscriptionCreditNote(raceStore, {
      refundFinancialEventId: "refund-race-a",
      diagnosticUidFor: () => "diag01",
      nowMs: NOW,
      section34CreditNotePolicy: "full_refund_developer_tax_invoice",
    }),
    finalizeSubscriptionCreditNote(raceStore, {
      refundFinancialEventId: "refund-race-b",
      diagnosticUidFor: () => "diag01",
      nowMs: NOW,
      section34CreditNotePolicy: "full_refund_developer_tax_invoice",
    }),
  ]);
  const racedOk = raced.filter((r) => r.status === "fulfilled");
  const racedFail = raced.filter((r) => r.status === "rejected");
  assert.equal(racedOk.length, 1);
  assert.equal(racedFail.length, 1);
  const racedFailErr = (racedFail[0] as PromiseRejectedResult).reason as BillingError;
  assert.equal(racedFailErr.causeCode, "credit_exceeds_original");
  const cnDocs = [...raceStore.docs.keys()].filter((k) => k.startsWith("_subscriptionCreditNotes/"));
  assert.equal(cnDocs.length, 1);
  const counter = raceStore.docs.get(creditNoteCounterPath("2026-27")) as { currentCount: number };
  assert.equal(counter.currentCount, 1);
  const origComp = raceStore.docs.get(
    subscriptionTaxCompliancePath(racedOriginal.invoiceId)
  ) as SubscriptionTaxComplianceDoc;
  assert.equal(origComp.cumulativeCreditReversedInPaise, racedOriginal.totalInPaise);
}

async function testHtmlEmailDownloadRenderer(): Promise<void> {
  const store = new MemoryBillingStore();
  const evt = ledger({ financialEventId: "html-1" });
  seedLedger(store, evt);
  store.docs.set(billingDetailsPath("user-1"), { ...completeB2bDetails() });
  const inv = await orchestrate({ store, event: evt });
  const html = buildSubscriptionTaxDocumentHtml(inv);
  assert.match(html, /TAX INVOICE/);
  assert.match(html, /SPECIAL SOFTWARES/);
  assert.match(html, /TESTSAC/);
  assert.match(html, /Place of supply/);
  assert.match(html, /Reverse charge: No/);
  assert.match(html, /Vyaamikk Diary Professional Subscription \(Yearly\)/);
  assert.match(html, /Computer-generated document/);
  assert.match(
    html,
    /This document may be used as supporting tax-invoice documentation for GST purposes, subject to the recipient&#39;s eligibility and applicable GST law\./
  );
  assert.doesNotMatch(html, /you are entitled to ITC/i);
  assert.doesNotMatch(html, /eligible for input tax credit automatically/i);

  assert.equal(authoritativeVerifiedEmail({ emailStatus: "pending", normalizedEmail: "a@b.c" }), null);
  const skip = await sendInvoiceEmail({
    provider: fakeEmail(),
    invoice: inv,
    recipient: { emailStatus: "unverified", normalizedEmail: "a@b.c" },
    nowMs: NOW,
  });
  assert.equal(skip.emailStatus, "skipped_no_verified_email");
  const accepted = await sendInvoiceEmail({
    provider: fakeEmail(),
    invoice: inv,
    recipient: { emailStatus: "verified", normalizedEmail: "owner@example.com" },
    nowMs: NOW,
  });
  assert.equal(accepted.emailStatus, "accepted");
  assert.notEqual(accepted.emailStatus, "delivered");

  const storage = new MemoryInvoiceObjectStorage();
  await storage.putObject({
    path: inv.invoicePdfStoragePath ?? "company/invoices/2026-27/x.pdf",
    bytes: Buffer.from("%PDF"),
    contentType: "application/pdf",
    customMetadata: {
      invoiceNumber: inv.documentNumber ?? "n",
      plan: "professional",
      financialEventId: inv.financialEventId,
    },
  });
  const readyStore = new MemoryBillingStore();
  readyStore.docs.set(`_subscriptionInvoices/${inv.invoiceId}`, { ...inv, pdfStatus: "ready" });
  const url = await createInvoiceDownloadUrl(readyStore, storage, {
    taxDocumentId: inv.invoiceId,
    uid: "user-1",
  });
  assert.equal(url.expiresInMs, 15 * 60 * 1000);
  await assert.rejects(
    createInvoiceDownloadUrl(readyStore, storage, { taxDocumentId: inv.invoiceId, uid: "other" }),
    isCause("invoice_not_owned")
  );
  await assert.rejects(
    createInvoiceDownloadUrl(readyStore, storage, { taxDocumentId: "company/invoices/hack.pdf", uid: "user-1" }),
    isCause("tax_document_id_invalid")
  );
  const pendingStore = new MemoryBillingStore();
  pendingStore.docs.set(`_subscriptionInvoices/${inv.invoiceId}`, { ...inv, pdfStatus: "pending", invoicePdfStoragePath: null });
  await assert.rejects(
    createInvoiceDownloadUrl(pendingStore, storage, { taxDocumentId: inv.invoiceId, uid: "user-1" }),
    isCause("invoice_pdf_not_ready")
  );

  const missing = createInvoicePdfRenderer({ rendererUrl: null });
  await assert.rejects(missing.renderHtmlToPdf({
    documentId: "d",
    html: "<p>x</p>",
    renderingProfile: APPROVED_RENDERING_PROFILE,
  }), isCause("invoice_renderer_unconfigured"));

  let seenAudience = "";
  const cloud = new CloudRunInvoicePdfRenderer({
    rendererUrl: "https://renderer.example.test",
    idTokens: {
      async getIdToken(audience) {
        seenAudience = audience;
        return "id-token";
      },
    },
    fetchImpl: async (input, init) => {
      assert.equal(String(input), "https://renderer.example.test/render");
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer id-token");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.renderingProfile, APPROVED_RENDERING_PROFILE);
      return new Response(Buffer.from("%PDF-OK"), { status: 200 });
    },
  });
  const pdf = await cloud.renderHtmlToPdf({
    documentId: "d1",
    html: "<html><body>ok</body></html>",
    renderingProfile: APPROVED_RENDERING_PROFILE,
  });
  assert.equal(seenAudience, "https://renderer.example.test");
  assert.ok(pdf.toString().startsWith("%PDF"));

  assert.throws(
    () =>
      applyOperationalInvoicePatch(inv, { taxableAmountInPaise: 1 }),
    isCause("invoice_immutable_field_mutation")
  );

  const retryStore = new MemoryBillingStore();
  let last = await enqueueInvoiceRetry(retryStore, {
    invoiceId: inv.invoiceId,
    financialEventId: inv.financialEventId,
    stage: "pdf",
    errorCode: "invoice_pdf_failed",
    nowMs: NOW,
  });
  last = await enqueueInvoiceRetry(retryStore, {
    invoiceId: inv.invoiceId,
    financialEventId: inv.financialEventId,
    stage: "pdf",
    errorCode: "invoice_pdf_failed",
    nowMs: NOW + 1,
  });
  last = await enqueueInvoiceRetry(retryStore, {
    invoiceId: inv.invoiceId,
    financialEventId: inv.financialEventId,
    stage: "pdf",
    errorCode: "invoice_pdf_failed",
    nowMs: NOW + 2,
  });
  assert.equal(last.pdf.attempts, INVOICE_RETRY_MAX_ATTEMPTS);
  assert.equal(last.pdf.deadLettered, true);
  assert.equal(last.email.attempts, 0);

  const persistSrc = readFileSync(resolve(process.cwd(), "functions/src/billing/applyTransition.ts"), "utf8");
  assert.doesNotMatch(persistSrc, /orchestrateTaxDocument/);
  const fnPkg = readFileSync(resolve(process.cwd(), "functions/package.json"), "utf8");
  assert.doesNotMatch(fnPkg, /puppeteer/);
}

async function testUnissuedDraftLifecycle(): Promise<void> {
  const sellerStore = new MemoryBillingStore();
  const sellerEvt = ledger({ financialEventId: "evt-seller-draft" });
  seedLedger(sellerStore, sellerEvt);
  const incompleteSeller = await orchestrate({
    store: sellerStore,
    event: sellerEvt,
    config: sellerConfig({ companyGstin: null }),
  });
  assert.equal(incompleteSeller.documentNumber, null);
  assert.equal(incompleteSeller.invoiceIssuedAt, null);
  assert.equal(incompleteSeller.issueStatus, "unissued_draft");
  const sellerId = incompleteSeller.invoiceId;
  const completeSeller = await orchestrate({ store: sellerStore, event: sellerEvt });
  assert.equal(completeSeller.invoiceId, sellerId);
  assert.equal(completeSeller.documentNumber, "SS/2026-27/0001");
  assert.ok(completeSeller.invoiceIssuedAt);
  assert.equal(completeSeller.issueStatus, "issued");
  assert.equal(completeSeller.seller?.gstin, SELLER_GSTIN);

  const sacStore = new MemoryBillingStore();
  const sacEvt = ledger({ financialEventId: "evt-sac-draft" });
  seedLedger(sacStore, sacEvt);
  const missingSac = await orchestrate({
    store: sacStore,
    event: sacEvt,
    config: sellerConfig({ serviceSacCode: null }),
  });
  assert.equal(missingSac.documentNumber, null);
  const sacReady = await orchestrate({ store: sacStore, event: sacEvt });
  assert.equal(sacReady.invoiceId, missingSac.invoiceId);
  assert.equal(sacReady.documentNumber, "SS/2026-27/0001");
  assert.equal(sacReady.sacCode, "TESTSAC");

  const appleStore = new MemoryBillingStore();
  const appleEvt = ledger({ financialEventId: "evt-apple-draft", platform: "ios" });
  seedLedger(appleStore, appleEvt);
  const appleDraft = await orchestrate({ store: appleStore, event: appleEvt });
  assert.equal(appleDraft.documentType, "compliance_review_required");
  assert.equal(appleDraft.documentNumber, null);
  const appleConfirmed = await orchestrate({
    store: appleStore,
    event: appleEvt,
    config: sellerConfig({ appleTaxResponsibilityMode: "developer" }),
  });
  assert.equal(appleConfirmed.invoiceId, appleDraft.invoiceId);
  assert.equal(appleConfirmed.documentType, "tax_invoice_b2c");
  assert.equal(appleConfirmed.documentNumber, "SS/2026-27/0001");

  const rcStore = new MemoryBillingStore();
  const rcEvt = ledger({ financialEventId: "evt-rc" });
  seedLedger(rcStore, rcEvt);
  const rcDraft = await orchestrate({
    store: rcStore,
    event: rcEvt,
    config: sellerConfig({ reverseChargeMode: "unconfirmed" }),
  });
  assert.equal(rcDraft.documentNumber, null);
  const pricedStore = new MemoryBillingStore();
  const pricedEvt = ledger({ financialEventId: "evt-price" });
  seedLedger(pricedStore, pricedEvt);
  const priceDraft = await orchestrate({
    store: pricedStore,
    event: pricedEvt,
    config: sellerConfig({ priceIncludesGst: null }),
  });
  assert.equal(priceDraft.documentNumber, null);

  assert.throws(
    () => applyOperationalInvoicePatch(completeSeller, { buyer: { ...completeSeller.buyer, gstin: "27AAAAA0000A1Z5" } }),
    isCause("invoice_immutable_field_mutation")
  );
}

async function testIssueTimestampAndIstDate(): Promise<void> {
  const store = new MemoryBillingStore();
  const supply = istWallClockToEpochMs("2027-03-31T23:59:59");
  const issue = istWallClockToEpochMs("2027-04-01T00:01:00");
  const evt = ledger({
    financialEventId: "evt-cross-fy",
    occurredAt: supply,
    monthKey: "2027-03",
  });
  seedLedger(store, evt);
  const inv = await orchestrate({ store, event: evt, nowMs: issue });
  assert.equal(inv.documentNumber, "SS/2027-28/0001");
  assert.equal(inv.financialYear, "2027-28");
  assert.equal(inv.supplyOccurredAt, supply);
  assert.equal(inv.invoiceIssuedAt, issue);
  assert.equal(inv.taxPeriodStatus, "unresolved_cross_period");
  assert.equal(inv.gstrReportable, false);

  const dateStore = new MemoryBillingStore();
  const istIssue = Date.parse("2026-09-13T00:15:00+05:30");
  const dateEvt = ledger({
    financialEventId: "evt-ist-date",
    occurredAt: istIssue,
    monthKey: "2026-09",
  });
  seedLedger(dateStore, dateEvt);
  const dated = await orchestrate({ store: dateStore, event: dateEvt, nowMs: istIssue });
  assert.equal(formatIstCalendarDate(istIssue), "13-09-2026");
  assert.equal(dated.invoiceIssuedOnIst, "13-09-2026");
  assert.match(buildSubscriptionTaxDocumentHtml(dated), /Issue date: 13-09-2026/);
  assert.doesNotMatch(buildSubscriptionTaxDocumentHtml(dated), /Issue date: 12-09-2026/);
}

async function testEmailAndRetrySeparation(): Promise<void> {
  assert.equal(shouldAttemptInvoiceEmail("accepted", true), false);
  assert.equal(shouldAttemptInvoiceEmail("delivered", true), false);
  assert.equal(shouldAttemptInvoiceEmail("bounced", true), false);
  assert.equal(shouldAttemptInvoiceEmail("skipped_no_verified_email", false), false);
  assert.equal(shouldAttemptInvoiceEmail("skipped_no_verified_email", true), true);
  assert.equal(shouldAttemptInvoiceEmail("pending", true), true);
  assert.equal(shouldAttemptInvoiceEmail("failed", true), true);

  const store = new MemoryBillingStore();
  const evt = ledger({ financialEventId: "evt-email-once" });
  seedLedger(store, evt);
  const email = fakeEmail();
  const first = await orchestrate({ store, event: evt, email });
  assert.equal(first.emailStatus, "accepted");
  assert.equal(email.sends.length, 1);
  const send = email.sends[0] as { htmlBody?: string; fromAddress?: string; textBody: string };
  assert.match(send.textBody, /expires in 7 days/);
  assert.match(send.htmlBody ?? "", /Download invoice PDF/);
  assert.equal(send.fromAddress, "billing@example.test");
  const second = await orchestrate({ store, event: evt, email });
  assert.equal(second.emailStatus, "accepted");
  assert.equal(email.sends.length, 1);

  const pdfStore = new MemoryBillingStore();
  const pdfEvt = ledger({ financialEventId: "evt-pdf-budget" });
  seedLedger(pdfStore, pdfEvt);
  const failing = {
    async renderHtmlToPdf() {
      throw new BillingError({
        clientCode: "temporary_unavailable",
        causeCode: "invoice_pdf_failed",
        retryable: true,
      });
    },
  };
  await orchestrate({
    store: pdfStore,
    event: pdfEvt,
    renderer: failing as unknown as FakeInvoicePdfRenderer,
  });
  await orchestrate({
    store: pdfStore,
    event: pdfEvt,
    renderer: failing as unknown as FakeInvoicePdfRenderer,
  });
  const retry = pdfStore.docs.get(invoiceRetryQueuePath(invoiceIdForFinancialEvent("evt-pdf-budget"))) as {
    pdf: { attempts: number };
    email: { attempts: number };
  };
  assert.equal(retry.pdf.attempts, 2);
  assert.equal(retry.email.attempts, 0);

  const recovered = await orchestrate({
    store: pdfStore,
    event: pdfEvt,
    renderer: new FakeInvoicePdfRenderer(),
  });
  assert.equal(recovered.pdfStatus, "ready");
  const resolved = await resolveInvoiceRetryStage(pdfStore, {
    invoiceId: recovered.invoiceId,
    financialEventId: pdfEvt.financialEventId,
    stage: "pdf",
    nowMs: NOW + 9,
  });
  assert.equal(resolved?.pdf.resolved, true);
  assert.equal(recovered.plan, "professional");
  assert.equal(recovered.billingPeriod, "yearly");
}

const BUYER_MH_GSTIN = "27AAAAA0000A1Z5";
const ADMIN = {
  uid: "admin-1",
  tokenAdmin: true,
  adminIdentityProvisioned: true,
};

class FlipBillingDetailsStore implements BillingStore {
  constructor(
    readonly inner: MemoryBillingStore,
    readonly flipPath: string,
    readonly flipped: Record<string, unknown>
  ) {}
  async runTransaction<T>(fn: (tx: BillingTransaction) => Promise<T>): Promise<T> {
    return this.inner.runTransaction(async (tx) => {
      return fn({
        get: async (path: string) => {
          if (path === this.flipPath) {
            this.inner.docs.set(path, this.flipped);
            return { exists: true, data: () => this.flipped };
          }
          return tx.get(path);
        },
        create: (path: string, data: Record<string, unknown>) => tx.create(path, data),
        set: (path: string, data: Record<string, unknown>) => tx.set(path, data),
      });
    });
  }
}

async function testPendingGstinAndTransactionalFinalization(): Promise<void> {
  const finalSrc = readFileSync(
    resolve(process.cwd(), "functions/src/billing/tax/taxDocumentFinalization.ts"),
    "utf8"
  );
  assert.match(finalSrc, /tx\.get\(ledgerPath\)/);
  assert.match(finalSrc, /tx\.get\(billingDetailsPath/);
  assert.match(finalSrc, /tx\.get\(counterPath\)/);
  assert.match(finalSrc, /tx\.get\(invoicePath\)/);
  assert.match(finalSrc, /subscriptionTaxCompliancePath/);
  const orchSrc = readFileSync(
    resolve(process.cwd(), "functions/src/billing/tax/taxDocumentOrchestrator.ts"),
    "utf8"
  );
  assert.match(orchSrc, /finalizeUnissuedInvoice/);
  assert.doesNotMatch(orchSrc, /persistTaxDocument/);
  assert.doesNotMatch(orchSrc, /buyerFromDetails/);

  const noGstinStore = new MemoryBillingStore();
  const noGstinEvt = ledger({ financialEventId: "evt-no-gstin" });
  seedLedger(noGstinStore, noGstinEvt);
  const b2c = await orchestrate({ store: noGstinStore, event: noGstinEvt });
  assert.equal(b2c.documentType, "tax_invoice_b2c");
  assert.equal(b2c.documentNumber, "SS/2026-27/0001");
  assert.equal(b2c.buyer.gstin, null);
  assert.equal(b2c.ecoReporting.ecoReportingCategory, "requires_tax_review");

  const pendingStore = new MemoryBillingStore();
  const pendingEvt = ledger({ financialEventId: "evt-pending-gstin" });
  seedLedger(pendingStore, pendingEvt);
  pendingStore.docs.set(billingDetailsPath("user-1"), {
    ...completeB2bDetails(),
    gstinVerificationStatus: "pending_manual_verification",
    verifiedLegalName: null,
    verifiedStateCode: null,
    verifiedAt: null,
    verifiedByDiagnosticUid: null,
  });
  const pendingInv = await orchestrate({ store: pendingStore, event: pendingEvt });
  assert.equal(pendingInv.documentType, "compliance_review_required");
  assert.equal(pendingInv.documentNumber, null);
  assert.equal(pendingInv.issueHoldReason, "recipient_tax_classification_pending");
  assert.equal(pendingInv.buyer.gstin, null);
  assert.equal(pendingInv.buyer.gstinVerificationStatus, "pending_manual_verification");
  const pendingId = pendingInv.invoiceId;

  await applyVerifyGstinManual(pendingStore, {
    targetUid: "user-1",
    decision: "verified",
    verifiedLegalName: "Buyer LLP",
    nowMs: NOW + 1,
    admin: ADMIN,
    adminDiagnosticUid: "admindiag01",
  });
  const verifiedInv = await orchestrate({ store: pendingStore, event: pendingEvt });
  assert.equal(verifiedInv.invoiceId, pendingId);
  assert.equal(verifiedInv.documentType, "tax_invoice_b2b");
  assert.equal(verifiedInv.documentNumber, "SS/2026-27/0001");
  assert.equal(verifiedInv.buyer.gstin, BUYER_MH_GSTIN);

  const rejectStore = new MemoryBillingStore();
  const rejectEvt = ledger({ financialEventId: "evt-reject-gstin" });
  seedLedger(rejectStore, rejectEvt);
  rejectStore.docs.set(billingDetailsPath("user-1"), {
    ...completeB2cDetails(),
    gstin: BUYER_MH_GSTIN,
    gstinVerificationStatus: "pending_manual_verification",
    billingStateCode: "27",
    billingStateName: "Maharashtra",
  });
  const rejectDraft = await orchestrate({ store: rejectStore, event: rejectEvt });
  assert.equal(rejectDraft.documentNumber, null);
  await applyVerifyGstinManual(rejectStore, {
    targetUid: "user-1",
    decision: "rejected",
    nowMs: NOW + 2,
    admin: ADMIN,
    adminDiagnosticUid: "admindiag01",
  });
  const rejectedInv = await orchestrate({ store: rejectStore, event: rejectEvt });
  assert.equal(rejectedInv.invoiceId, rejectDraft.invoiceId);
  assert.equal(rejectedInv.documentType, "tax_invoice_b2c");
  assert.equal(rejectedInv.documentNumber, "SS/2026-27/0001");
  assert.equal(rejectedInv.buyer.gstin, null);
  assert.doesNotMatch(buildSubscriptionTaxDocumentHtml(rejectedInv), /27AAAAA0000A1Z5/);
  assert.doesNotMatch(buildSubscriptionTaxDocumentHtml(rejectedInv), /GSTIN: 27/);

  const clearStore = new MemoryBillingStore();
  const clearEvt = ledger({ financialEventId: "evt-clear-gstin" });
  seedLedger(clearStore, clearEvt);
  clearStore.docs.set(billingDetailsPath("user-1"), {
    ...completeB2cDetails(),
    gstin: BUYER_MH_GSTIN,
    gstinVerificationStatus: "pending_manual_verification",
  });
  const clearDraft = await orchestrate({ store: clearStore, event: clearEvt });
  await applyUpdateBillingDetails(clearStore, "user-1", { gstin: null }, NOW + 3);
  const clearedInv = await orchestrate({ store: clearStore, event: clearEvt });
  assert.equal(clearedInv.invoiceId, clearDraft.invoiceId);
  assert.equal(clearedInv.documentType, "tax_invoice_b2c");
  assert.ok(clearedInv.documentNumber);

  const raceInner = new MemoryBillingStore();
  const raceEvt = ledger({ financialEventId: "evt-race-gstin" });
  seedLedger(raceInner, raceEvt);
  raceInner.docs.set(billingDetailsPath("user-1"), {
    ...completeB2bDetails(),
    gstinVerificationStatus: "pending_manual_verification",
    verifiedLegalName: null,
    verifiedStateCode: null,
    verifiedAt: null,
    verifiedByDiagnosticUid: null,
  });
  const flipStore = new FlipBillingDetailsStore(raceInner, billingDetailsPath("user-1"), {
    ...completeB2bDetails(),
  });
  const raced = await finalizeUnissuedInvoice(flipStore, {
    financialEventId: raceEvt.financialEventId,
    config: sellerConfig(),
    diagnosticUidFor: () => "diag01",
    nowMs: NOW,
    section34CreditNotePolicy: "full_refund_developer_tax_invoice",
  });
  assert.equal(raced.invoice.documentType, "tax_invoice_b2b");
  assert.equal(raced.invoice.buyer.gstin, BUYER_MH_GSTIN);
  assert.ok(raced.invoice.documentNumber);

  const ecoStore = new MemoryBillingStore();
  const ecoEvt = ledger({ financialEventId: "evt-eco-classified" });
  seedLedger(ecoStore, ecoEvt);
  const ecoInv = await orchestrate({
    store: ecoStore,
    event: ecoEvt,
    config: sellerConfig({
      googleEco: {
        ecoReportingCategory: "requires_tax_review",
        operatorIdentifier: "google_play",
        operatorGstin: null,
      },
    }),
  });
  assert.equal(ecoInv.ecoReporting.ecoReportingCategory, "requires_tax_review");

  const appleEcoStore = new MemoryBillingStore();
  const appleEcoEvt = ledger({ financialEventId: "evt-apple-eco", platform: "ios" });
  seedLedger(appleEcoStore, appleEcoEvt);
  const appleIssued = await orchestrate({
    store: appleEcoStore,
    event: appleEcoEvt,
    config: sellerConfig({ appleTaxResponsibilityMode: "developer" }),
  });
  assert.equal(appleIssued.documentType, "tax_invoice_b2c");
  assert.equal(appleIssued.ecoReporting.ecoReportingCategory, "requires_tax_review");
}

async function testCreditNoteIssueMonthTaxPeriod(): Promise<void> {
  const store = new MemoryBillingStore();
  const sepIssue = istWallClockToEpochMs("2026-09-12T12:00:00");
  const octIssue = istWallClockToEpochMs("2026-10-05T10:00:00");
  const purchaseId = "inv-cn-sep";
  seedLedger(store, ledger({ financialEventId: purchaseId, occurredAt: sepIssue }));
  store.docs.set(billingDetailsPath("user-1"), { ...completeB2bDetails() });
  const original = await orchestrate({
    store,
    event: ledger({ financialEventId: purchaseId, occurredAt: sepIssue }),
    nowMs: sepIssue,
  });
  seedLedger(
    store,
    ledger({
      financialEventId: "refund-oct",
      eventType: "refund",
      relatedFinancialEventId: purchaseId,
      occurredAt: octIssue,
      monthKey: "2026-10",
    })
  );
  const octCn = await finalizeSubscriptionCreditNote(store, {
    refundFinancialEventId: "refund-oct",
    diagnosticUidFor: () => "diag01",
    nowMs: octIssue,
    section34CreditNotePolicy: "full_refund_developer_tax_invoice",
  });
  assert.equal(octCn.creditNote.taxPeriodMonth, "2026-10");
  assert.equal(octCn.creditNote.taxPeriodStatus, "resolved");
  assert.notEqual(octCn.creditNote.taxPeriodStatus, "unresolved_cross_period");
  assert.equal(octCn.creditNote.financialYear, "2026-27");
  assert.equal(octCn.creditNote.issuedOnIst, "05-10-2026");

  const fyStore = new MemoryBillingStore();
  const marIssue = istWallClockToEpochMs("2027-03-15T12:00:00");
  const aprIssue = istWallClockToEpochMs("2027-04-02T09:00:00");
  const marPurchase = "inv-cn-mar";
  seedLedger(fyStore, ledger({ financialEventId: marPurchase, occurredAt: marIssue }));
  fyStore.docs.set(billingDetailsPath("user-1"), { ...completeB2cDetails() });
  const marOriginal = await orchestrate({
    store: fyStore,
    event: ledger({ financialEventId: marPurchase, occurredAt: marIssue }),
    nowMs: marIssue,
  });
  assert.equal(marOriginal.financialYear, "2026-27");
  seedLedger(
    fyStore,
    ledger({
      financialEventId: "refund-apr",
      eventType: "refund",
      relatedFinancialEventId: marPurchase,
      occurredAt: aprIssue,
      monthKey: "2027-04",
    })
  );
  const aprCn = await finalizeSubscriptionCreditNote(fyStore, {
    refundFinancialEventId: "refund-apr",
    diagnosticUidFor: () => "diag01",
    nowMs: aprIssue,
    section34CreditNotePolicy: "full_refund_developer_tax_invoice",
  });
  assert.equal(aprCn.creditNote.financialYear, "2027-28");
  assert.equal(aprCn.creditNote.taxPeriodMonth, "2027-04");
  assert.equal(aprCn.creditNote.taxPeriodStatus, "resolved");
  assert.match(aprCn.creditNote.documentNumber ?? "", /^CN\/2027-28\/0001$/);
}

async function testRound3ComplianceRecipientAndEco(): Promise<void> {
  const sep = istWallClockToEpochMs("2026-09-12T12:00:00");
  const admin = { uid: "admin-1", tokenAdmin: true, adminIdentityProvisioned: true };

  const appleStore = new MemoryBillingStore();
  const appleEvt = ledger({ financialEventId: "evt-apple-sep", platform: "ios", occurredAt: sep });
  seedLedger(appleStore, appleEvt);
  const appleInv = await orchestrate({ store: appleStore, event: appleEvt, nowMs: sep });
  assert.equal(appleInv.documentNumber, null);
  assert.equal(appleInv.taxPeriodMonth, null);
  const appleCompliance = appleStore.docs.get(
    subscriptionTaxCompliancePath(appleInv.invoiceId)
  ) as SubscriptionTaxComplianceDoc;
  assert.equal(appleCompliance.supplyMonthKey, "2026-09");
  assert.equal(appleCompliance.reportingTaxPeriodMonth, null);
  const applePapers = buildGstr1WorkingPapers({
    month: "2026-09",
    ...(await new MemoryTaxComplianceReportSource(appleStore).loadMonthlyScope("2026-09")),
  });
  assert.ok(applePapers.complianceOpenItems.some((i) => i.invoiceId === appleInv.invoiceId));
  assert.equal(applePapers.reviewStatus, "requires_tax_review");

  const pendingStore = new MemoryBillingStore();
  const pendingEvt = ledger({ financialEventId: "evt-pending-sep", occurredAt: sep });
  seedLedger(pendingStore, pendingEvt);
  pendingStore.docs.set(billingDetailsPath("user-1"), {
    ...completeB2bDetails(),
    gstinVerificationStatus: "pending_manual_verification",
    verifiedLegalName: null,
    verifiedStateCode: null,
    verifiedAt: null,
    verifiedByDiagnosticUid: null,
  });
  const pendingInv = await orchestrate({ store: pendingStore, event: pendingEvt, nowMs: sep });
  assert.equal(pendingInv.documentNumber, null);
  const pendingPapers = buildGstr1WorkingPapers({
    month: "2026-09",
    ...(await new MemoryTaxComplianceReportSource(pendingStore).loadMonthlyScope("2026-09")),
  });
  assert.ok(pendingPapers.complianceOpenItems.some((i) => i.invoiceId === pendingInv.invoiceId));
  assert.equal(pendingPapers.reviewStatus, "requires_tax_review");

  const sellerStore = new MemoryBillingStore();
  const sellerEvt = ledger({ financialEventId: "evt-seller-sep", occurredAt: sep });
  seedLedger(sellerStore, sellerEvt);
  const sellerInv = await orchestrate({
    store: sellerStore,
    event: sellerEvt,
    nowMs: sep,
    config: sellerConfig({ companyGstin: null }),
  });
  assert.equal(sellerInv.documentNumber, null);
  const sellerPapers = buildGstr1WorkingPapers({
    month: "2026-09",
    ...(await new MemoryTaxComplianceReportSource(sellerStore).loadMonthlyScope("2026-09")),
  });
  assert.ok(sellerPapers.complianceOpenItems.some((i) => i.invoiceId === sellerInv.invoiceId));

  const crossStore = new MemoryBillingStore();
  const marchSupply = istWallClockToEpochMs("2026-03-20T12:00:00");
  const aprilIssue = istWallClockToEpochMs("2026-04-05T12:00:00");
  const crossEvt = ledger({
    financialEventId: "evt-cross",
    occurredAt: marchSupply,
    monthKey: "2026-03",
  });
  seedLedger(crossStore, crossEvt);
  const crossInv = await orchestrate({ store: crossStore, event: crossEvt, nowMs: aprilIssue });
  assert.equal(crossInv.taxPeriodStatus, "unresolved_cross_period");
  const marchPapers = buildGstr1WorkingPapers({
    month: "2026-03",
    ...(await new MemoryTaxComplianceReportSource(crossStore).loadMonthlyScope("2026-03")),
  });
  const aprilPapers = buildGstr1WorkingPapers({
    month: "2026-04",
    ...(await new MemoryTaxComplianceReportSource(crossStore).loadMonthlyScope("2026-04")),
  });
  assert.ok(marchPapers.complianceOpenItems.some((i) => i.invoiceId === crossInv.invoiceId));
  assert.ok(aprilPapers.complianceOpenItems.some((i) => i.invoiceId === crossInv.invoiceId));

  const googleStore = new MemoryBillingStore();
  const gEvt = ledger({ financialEventId: "evt-google-eco", occurredAt: sep });
  seedLedger(googleStore, gEvt);
  const googleInv = await orchestrate({ store: googleStore, event: gEvt, nowMs: sep });
  assert.match(googleInv.documentNumber ?? "", /^SS\//);
  const beforeLegal = JSON.stringify({
    seller: googleInv.seller,
    buyer: googleInv.buyer,
    documentNumber: googleInv.documentNumber,
    taxableAmountInPaise: googleInv.taxableAmountInPaise,
    totalInPaise: googleInv.totalInPaise,
    ecoReporting: googleInv.ecoReporting,
  });
  const googleOpen = buildGstr1WorkingPapers({
    month: "2026-09",
    ...(await new MemoryTaxComplianceReportSource(googleStore).loadMonthlyScope("2026-09")),
  });
  assert.equal(googleOpen.reviewStatus, "requires_tax_review");
  const reviewed = await applyReviewTaxCompliance(googleStore, {
    invoiceId: googleInv.invoiceId,
    admin,
    reviewedByDiagnosticUid: "admindiag01",
    reviewBasis: "CA Table 14(a) classification for synthetic operator",
    nowMs: sep + 1,
    ecoReportingCategory: "section52_table14a",
    operatorGstin: "29AAAAA0000A1Z5",
    operatorIdentifier: "google_play",
  });
  assert.equal(reviewed.ecoReportingCategory, "section52_table14a");
  const afterInv = googleStore.docs.get(
    `_subscriptionInvoices/${googleInv.invoiceId}`
  ) as SubscriptionInvoiceDoc;
  assert.equal(
    JSON.stringify({
      seller: afterInv.seller,
      buyer: afterInv.buyer,
      documentNumber: afterInv.documentNumber,
      taxableAmountInPaise: afterInv.taxableAmountInPaise,
      totalInPaise: afterInv.totalInPaise,
      ecoReporting: afterInv.ecoReporting,
    }),
    beforeLegal
  );
  assert.equal(afterInv.ecoReporting.ecoReportingCategory, "requires_tax_review");
  const googleReady = buildGstr1WorkingPapers({
    month: "2026-09",
    ...(await new MemoryTaxComplianceReportSource(googleStore).loadMonthlyScope("2026-09")),
  });
  assert.equal(googleReady.reviewStatus, "ready_to_file");
  assert.equal(googleReady.table14a.length, 1);
  assert.equal(googleReady.table14a[0]?.operatorGstin, "29AAAAA0000A1Z5");
  assert.equal(googleReady.table14a[0]?.fileReady, true);

  const b2bStore = new MemoryBillingStore();
  const b2bEvt = ledger({ financialEventId: "evt-b2b-addr" });
  seedLedger(b2bStore, b2bEvt);
  b2bStore.docs.set(billingDetailsPath("user-1"), {
    ...emptyBuyer(),
    gstin: BUYER_MH_GSTIN,
    gstinVerificationStatus: "verified",
    verifiedLegalName: "Buyer LLP",
    verifiedStateCode: "27",
    billingStateCode: "27",
    billingStateName: "Maharashtra",
  });
  const noAddr = await orchestrate({ store: b2bStore, event: b2bEvt });
  assert.equal(noAddr.documentNumber, null);
  assert.equal(noAddr.issueHoldReason, "recipient_invoice_details_incomplete");
  const heldId = noAddr.invoiceId;
  b2bStore.docs.set(billingDetailsPath("user-1"), { ...completeB2bDetails() });
  const withAddr = await orchestrate({ store: b2bStore, event: b2bEvt });
  assert.equal(withAddr.invoiceId, heldId);
  assert.match(withAddr.documentNumber ?? "", /^SS\//);

  const noNameStore = new MemoryBillingStore();
  const noNameEvt = ledger({ financialEventId: "evt-b2c-noname" });
  seedLedger(noNameStore, noNameEvt);
  noNameStore.docs.set(billingDetailsPath("user-1"), {
    ...completeB2cDetails(),
    billingRecipientName: null,
  });
  const noName = await orchestrate({ store: noNameStore, event: noNameEvt });
  assert.equal(noName.documentNumber, null);

  const noPinStore = new MemoryBillingStore();
  const noPinEvt = ledger({ financialEventId: "evt-b2c-nopin" });
  seedLedger(noPinStore, noPinEvt);
  noPinStore.docs.set(billingDetailsPath("user-1"), {
    ...completeB2cDetails(),
    billingPostalCode: null,
  });
  const noPin = await orchestrate({ store: noPinStore, event: noPinEvt });
  assert.equal(noPin.documentNumber, null);

  const completeB2cStore = new MemoryBillingStore();
  const completeEvt = ledger({ financialEventId: "evt-b2c-complete" });
  seedLedger(completeB2cStore, completeEvt);
  const completeB2c = await orchestrate({ store: completeB2cStore, event: completeEvt });
  assert.match(completeB2c.documentNumber ?? "", /^SS\//);
  assert.equal(completeB2c.buyer.legalName, "Test Recipient");
  assert.ok(completeB2c.invoiceIssueDueAt != null);

  const refundStore = new MemoryBillingStore();
  seedLedger(
    refundStore,
    ledger({
      financialEventId: "evt-refund-only",
      eventType: "refund",
      relatedFinancialEventId: "orig-missing",
    })
  );
  await assert.rejects(
    orchestrate({ store: refundStore, event: ledger({ financialEventId: "evt-refund-only" }) }),
    isCause("financial_event_not_invoiceable")
  );
  seedLedger(
    refundStore,
    ledger({
      financialEventId: "evt-chargeback-only",
      eventType: "chargeback",
      relatedFinancialEventId: "orig-missing",
    })
  );
  await assert.rejects(
    finalizeUnissuedInvoice(refundStore, {
      financialEventId: "evt-chargeback-only",
      config: sellerConfig(),
      diagnosticUidFor: () => "diag01",
      nowMs: NOW,
    }),
    isCause("financial_event_not_invoiceable")
  );
}

async function main(): Promise<void> {
  await testAllocationConcurrency();
  await testOrchestratorAuthorityAndRetries();
  await testCreditNotes();
  await testHtmlEmailDownloadRenderer();
  await testUnissuedDraftLifecycle();
  await testIssueTimestampAndIstDate();
  await testEmailAndRetrySeparation();
  await testPendingGstinAndTransactionalFinalization();
  await testCreditNoteIssueMonthTaxPeriod();
  await testRound3ComplianceRecipientAndEco();
  console.log("gst.documents.unit.test.ts: ok");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
