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
import { BillingError } from "../errors";
import {
  billingDetailsPath,
  companyBillingPath,
  financialLedgerPath,
  invoiceCounterPath,
  invoiceRetryQueuePath,
  subscriptionHistoryPath,
} from "../paths";
import { MemoryBillingStore } from "../store";
import type {
  BillingEventLedgerDoc,
  CompanyBillingDoc,
  SubscriptionBillingDetailsDoc,
  SubscriptionInvoiceDoc,
} from "../types";
import {
  allocateCreditNoteStub,
  creditNoteIdForRefundEvent,
  developerCreditNoteRequired,
} from "./creditNote";
import { istWallClockToEpochMs, formatIstCalendarDate } from "./financialYearUtils";
import { APPROVED_RENDERING_PROFILE, buildSubscriptionTaxDocumentHtml } from "./htmlDocument";
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
    reverseChargeMode: "no",
    subscriptionDescription: "Vyaamikk Diary Professional Subscription (Yearly)",
    seller: null,
    buyer: {
      classification: "b2c",
      legalName: null,
      gstin: null,
      gstinVerificationStatus: "not_provided",
      billingAddress: null,
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
      section52TcsStatus: "requires_tax_review",
      table14ClassificationStatus: "requires_tax_review",
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
  const original = (
    await allocateInvoiceStub(store, {
      stub: skeleton({
        invoiceId: invoiceIdForFinancialEvent("inv-orig"),
        financialEventId: "inv-orig",
        documentType: "tax_invoice_b2b",
      }),
      financialYear: "2026-27",
      nowMs: NOW,
      allocateNumber: true,
    })
  ).invoice;
  assert.equal(developerCreditNoteRequired(original), true);
  const refundId = "refund-1";
  const cnId = creditNoteIdForRefundEvent(refundId);
  const first = await allocateCreditNoteStub(store, {
    stub: {
      creditNoteId: cnId,
      originalInvoiceId: original.invoiceId,
      originalDocumentNumber: original.documentNumber,
      refundFinancialEventId: refundId,
      uid: original.uid,
      diagnosticUid: original.diagnosticUid,
      documentNumber: null,
      financialYear: null,
      taxPeriodMonth: "2026-09",
      taxPeriodStatus: "pending_issue",
      issuedAt: null,
      issuedOnIst: null,
      buyerGstin: null,
      buyerClassification: null,
      originalInvoiceIssuedOnIst: null,
      placeOfSupplyStateCode: null,
      gstRateBps: null,
      taxType: null,
      taxResponsibilityMode: original.taxResponsibilityMode,
      taxableAmountReversedInPaise: original.taxableAmountInPaise,
      cgstReversedInPaise: original.cgstInPaise,
      sgstReversedInPaise: original.sgstInPaise,
      igstReversedInPaise: original.igstInPaise,
      totalTaxReversedInPaise: original.totalTaxInPaise,
      totalReversedInPaise: original.totalInPaise,
      gstrReportable: true,
      gstrReportedMonth: null,
      gstrFilingBatchId: null,
      createdAt: NOW,
      updatedAt: NOW,
    },
    financialYear: "2026-27",
    nowMs: NOW,
    original,
  });
  assert.match(first.creditNote.documentNumber ?? "", /^CN\/2026-27\/0001$/);
  assert.equal(first.creditNote.originalInvoiceId, original.invoiceId);
  const counter = store.docs.get(invoiceCounterPath("2026-27")) as { currentTaxInvoiceCount: number };
  assert.equal(counter.currentTaxInvoiceCount, 1);
  const retry = await allocateCreditNoteStub(store, {
    stub: { ...first.creditNote, documentNumber: null },
    financialYear: "2026-27",
    nowMs: NOW + 5,
    original,
  });
  assert.equal(retry.reused, true);
  assert.equal(retry.creditNote.documentNumber, first.creditNote.documentNumber);
}

async function testHtmlEmailDownloadRenderer(): Promise<void> {
  const store = new MemoryBillingStore();
  const evt = ledger({ financialEventId: "html-1" });
  seedLedger(store, evt);
  store.docs.set(billingDetailsPath("user-1"), {
    ...emptyBuyer(),
    gstin: "27AAAAA0000A1Z5",
    gstinVerificationStatus: "verified",
    verifiedLegalName: "Buyer LLP",
    verifiedStateCode: "27",
    billingStateCode: "27",
    billingStateName: "Maharashtra",
  } satisfies SubscriptionBillingDetailsDoc);
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

async function main(): Promise<void> {
  await testAllocationConcurrency();
  await testOrchestratorAuthorityAndRetries();
  await testCreditNotes();
  await testHtmlEmailDownloadRenderer();
  await testUnissuedDraftLifecycle();
  await testIssueTimestampAndIstDate();
  await testEmailAndRetrySeparation();
  console.log("gst.documents.unit.test.ts: ok");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
