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
 */

import type { EmailProvider } from "../../email/provider";
import { BillingError } from "../errors";
import {
  isCanonicalSku,
  subscriptionDescriptionForSku,
  getCatalogEntry,
} from "../products";
import {
  billingDetailsPath,
  companyBillingPath,
  financialLedgerPath,
  invoicePdfStoragePath,
  subscriptionHistoryPath,
  subscriptionInvoicePath,
} from "../paths";
import type { BillingStore } from "../store";
import type {
  BillingEventLedgerDoc,
  BuyerTaxSnapshot,
  CompanyBillingDoc,
  InvoicePdfStatus,
  PlatformTaxChannel,
  SubscriptionBillingDetailsDoc,
  SubscriptionInvoiceDoc,
  TaxResponsibilityMode,
} from "../types";
import { INVOICE_OPERATIONAL_KEYS } from "../types";

import { persistTaxDocument, applyOperationalInvoicePatch, invoiceIdForFinancialEvent, isIssuedInvoice } from "./invoiceAllocation";
import {
  EMAIL_INVOICE_DOWNLOAD_TTL_MS,
  authoritativeVerifiedEmail,
  sendInvoiceEmail,
  shouldAttemptInvoiceEmail,
  type VerifiedEmailLookup,
} from "./invoiceEmail";
import { APPROVED_RENDERING_PROFILE, buildSubscriptionTaxDocumentHtml } from "./htmlDocument";
import {
  classifyTaxDocument,
  mayIssueDeveloperTaxInvoice,
  resolvePlatformTaxPolicy,
} from "./platformTaxPolicy";
import { resolvePlaceOfSupply } from "./placeOfSupply";
import type { InvoicePdfRenderer } from "./pdfRenderer";
import { enqueueInvoiceRetry, resolveInvoiceRetryStage, type InvoiceRetryAlerter } from "./retryQueue";
import {
  isReverseChargeApproved,
  isSacAndRateApproved,
  isSellerIdentityComplete,
  loadSellerTaxIdentity,
  type SellerIdentityConfig,
} from "./sellerIdentity";
import { calculateGst } from "./taxMath";
import { gstStateName, isKnownGstStateCode } from "./gstin";

export const IN_APP_INVOICE_DOWNLOAD_TTL_MS = 15 * 60 * 1000;

export interface PutObjectInput {
  path: string;
  bytes: Buffer;
  contentType: string;
  customMetadata?: Record<string, string>;
}

export interface InvoiceObjectStorage {
  putObject(input: PutObjectInput): Promise<void>;
  getSignedDownloadUrl(path: string, expiresMs: number): Promise<string>;
}

export class MemoryInvoiceObjectStorage implements InvoiceObjectStorage {
  readonly objects = new Map<string, Buffer>();
  readonly contentTypes = new Map<string, string>();
  readonly metadata = new Map<string, Record<string, string>>();
  async putObject(input: PutObjectInput): Promise<void> {
    this.objects.set(input.path, input.bytes);
    this.contentTypes.set(input.path, input.contentType);
    this.metadata.set(input.path, input.customMetadata ?? {});
  }
  async getSignedDownloadUrl(path: string, expiresMs: number): Promise<string> {
    if (!this.objects.has(path)) {
      throw new BillingError({ clientCode: "not_entitled", causeCode: "invoice_pdf_missing" });
    }
    return `https://signed.example/${path}?exp=${expiresMs}`;
  }
}

export interface TaxOrchestratorDeps {
  store: BillingStore;
  config: SellerIdentityConfig;
  renderer: InvoicePdfRenderer;
  storage: InvoiceObjectStorage;
  email: EmailProvider;
  loadUser: (uid: string) => Promise<VerifiedEmailLookup>;
  diagnosticUidFor: (uid: string) => string;
  nowMs: number;
  historyEventId?: string;
  alerter?: InvoiceRetryAlerter;
}

function buyerFromDetails(
  details: SubscriptionBillingDetailsDoc | null
): BuyerTaxSnapshot {
  const verified = details?.gstinVerificationStatus === "verified";
  const addressParts = [
    details?.billingAddressLine1,
    details?.billingAddressLine2,
    details?.billingCity,
    details?.billingPostalCode,
  ].filter((p): p is string => Boolean(p && p.trim()));
  const stateCode =
    verified && details?.verifiedStateCode
      ? details.verifiedStateCode
      : details?.billingStateCode ?? null;
  return {
    classification: verified ? "b2b" : "b2c",
    legalName: verified ? details?.verifiedLegalName ?? details?.billingBusinessName ?? null : details?.billingBusinessName ?? null,
    gstin: details?.gstin ?? null,
    gstinVerificationStatus: details?.gstinVerificationStatus ?? "not_provided",
    billingAddress: addressParts.length ? addressParts.join(", ") : null,
    stateCode,
    stateName: stateCode && isKnownGstStateCode(stateCode) ? gstStateName(stateCode) : details?.billingStateName ?? null,
  };
}

function policyModeOverrides(
  config: SellerIdentityConfig
): Partial<Record<PlatformTaxChannel, TaxResponsibilityMode>> {
  return {
    apple_app_store_india: config.appleTaxResponsibilityMode,
    google_play_india: config.googleTaxResponsibilityMode,
    direct_web_india: config.directWebTaxResponsibilityMode,
  };
}

function emptyInvoiceSkeleton(
  ledger: BillingEventLedgerDoc,
  invoiceId: string,
  diagnosticUid: string,
  nowMs: number,
  historyEventId: string | null
): SubscriptionInvoiceDoc {
  return {
    invoiceId,
    uid: ledger.uid,
    diagnosticUid,
    financialEventId: ledger.financialEventId,
    platform: ledger.platform,
    canonicalSku: ledger.canonicalSku,
    plan: null,
    billingPeriod: null,
    subscriptionDescription: null,
    taxResponsibilityMode: "unconfirmed",
    documentType: "compliance_review_required",
    documentNumber: null,
    financialYear: null,
    taxPeriodMonth: null,
    taxPeriodStatus: "pending_issue",
    invoiceIssuedAt: null,
    invoiceIssuedOnIst: null,
    supplyOccurredAt: ledger.occurredAt,
    issueStatus: "unissued_draft",
    reverseChargeMode: null,
    seller: null,
    buyer: buyerFromDetails(null),
    placeOfSupplyStateCode: null,
    placeOfSupplyStateName: null,
    sacCode: null,
    serviceDescription: null,
    currency: ledger.currency,
    grossCustomerAmountInPaise: ledger.grossAmountInPaise,
    taxableAmountInPaise: null,
    gstRateBps: null,
    taxType: null,
    cgstInPaise: null,
    sgstInPaise: null,
    igstInPaise: null,
    totalTaxInPaise: null,
    totalInPaise: null,
    platformCommissionInPaise:
      ledger.actualPlatformCommissionInPaise ?? ledger.estimatedPlatformCommissionInPaise,
    ecoReporting: {
      platform: ledger.platform,
      operatorIdentifier: ledger.platform === "android" ? "google_play" : "apple_app_store",
      operatorGstin: null,
      taxResponsibilityMode: "unconfirmed",
      section52TcsStatus: "requires_tax_review",
      table14ClassificationStatus: "requires_tax_review",
    },
    pdfStatus: "pending",
    invoicePdfStoragePath: null,
    emailStatus: "pending",
    emailProviderMessageId: null,
    invoiceEmailAcceptedAt: null,
    invoiceEmailDeliveredAt: null,
    gstrReportable: false,
    gstrReportedMonth: null,
    gstrFilingBatchId: null,
    historyEventId,
    createdAt: nowMs,
    updatedAt: nowMs,
  };
}

async function persistInvoice(
  store: BillingStore,
  invoice: SubscriptionInvoiceDoc
): Promise<void> {
  const path = subscriptionInvoicePath(invoice.invoiceId);
  await store.runTransaction(async (tx) => {
    const snap = await tx.get(path);
    if (!snap.exists) {
      throw new BillingError({ clientCode: "internal_error", causeCode: "invoice_stub_missing" });
    }
    const current = snap.data() as unknown as SubscriptionInvoiceDoc;
    const operational: Partial<SubscriptionInvoiceDoc> = {};
    for (const key of INVOICE_OPERATIONAL_KEYS) {
      operational[key] = invoice[key] as never;
    }
    const next = applyOperationalInvoicePatch(current, operational);
    tx.set(path, next as unknown as Record<string, unknown>);
  });
}

/**
 * Starts AFTER the financial ledger row exists. Never called from
 * applySubscriptionTransition. Idempotent across PDF/email retries.
 */
export async function orchestrateTaxDocument(
  deps: TaxOrchestratorDeps,
  financialEventId: string
): Promise<SubscriptionInvoiceDoc> {
  const ledgerPath = financialLedgerPath(financialEventId);
  const ledgerSnap = await deps.store.runTransaction(async (tx) => tx.get(ledgerPath));
  if (!ledgerSnap.exists) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "financial_event_missing",
    });
  }
  const ledger = ledgerSnap.data() as unknown as BillingEventLedgerDoc;
  if (!isCanonicalSku(ledger.canonicalSku)) {
    throw new BillingError({
      clientCode: "internal_error",
      causeCode: "unknown_canonical_sku",
    });
  }
  const catalog = getCatalogEntry(ledger.canonicalSku);
  const subscriptionDescription = subscriptionDescriptionForSku(ledger.canonicalSku);
  const invoiceId = invoiceIdForFinancialEvent(ledger.financialEventId);
  const diagnosticUid = deps.diagnosticUidFor(ledger.uid);
  const detailsSnap = await deps.store.runTransaction(async (tx) =>
    tx.get(billingDetailsPath(ledger.uid))
  );
  const details = detailsSnap.exists
    ? (detailsSnap.data() as unknown as SubscriptionBillingDetailsDoc)
    : null;
  const buyer = buyerFromDetails(details);
  const policy = resolvePlatformTaxPolicy(ledger.platform, policyModeOverrides(deps.config));
  const documentType = classifyTaxDocument({
    policy,
    buyerIsVerifiedB2b: buyer.classification === "b2b",
  });

  const amountOk =
    Number.isInteger(ledger.grossAmountInPaise) &&
    ledger.grossAmountInPaise >= 0 &&
    ledger.currency === "INR";

  const sellerReady = isSellerIdentityComplete(deps.config);
  const sacReady = isSacAndRateApproved(deps.config);
  const reverseChargeReady = isReverseChargeApproved(deps.config.reverseChargeMode);
  const priceBasisReady = typeof deps.config.priceIncludesGst === "boolean";
  const seller = sellerReady ? loadSellerTaxIdentity(deps.config) : null;

  let pdfStatus: InvoicePdfStatus = "pending";
  if (!amountOk) pdfStatus = "awaiting_financial_evidence";

  const canFinalizeDeveloperInvoice =
    mayIssueDeveloperTaxInvoice(documentType) &&
    amountOk &&
    sellerReady &&
    sacReady &&
    reverseChargeReady &&
    priceBasisReady &&
    seller != null;

  const allocateNumber =
    pdfStatus !== "awaiting_financial_evidence" &&
    (documentType === "platform_subscription_receipt" || canFinalizeDeveloperInvoice);

  let taxFields: Partial<SubscriptionInvoiceDoc> = {
    plan: catalog.plan,
    billingPeriod: catalog.period,
    subscriptionDescription,
    reverseChargeMode: deps.config.reverseChargeMode,
  };
  if (canFinalizeDeveloperInvoice && seller && typeof deps.config.priceIncludesGst === "boolean") {
    const pos = resolvePlaceOfSupply({
      classification: buyer.classification,
      verifiedRecipientStateCode:
        buyer.classification === "b2b" ? buyer.stateCode : null,
      recipientAddressStateCode:
        buyer.classification === "b2c" ? buyer.stateCode : null,
      sellerStateCode: seller.stateCode,
    });
    const math = calculateGst({
      totalInPaise: ledger.grossAmountInPaise,
      gstRateBps: deps.config.gstRateBps as number,
      priceIncludesGst: deps.config.priceIncludesGst,
      taxType: pos.taxType,
      currency: "INR",
    });
    taxFields = {
      ...taxFields,
      seller,
      placeOfSupplyStateCode: pos.placeOfSupplyStateCode,
      placeOfSupplyStateName: pos.placeOfSupplyStateName,
      sacCode: deps.config.serviceSacCode,
      serviceDescription: deps.config.serviceSacDescription,
      gstRateBps: math.gstRateBps,
      taxType: math.taxType,
      taxableAmountInPaise: math.taxableAmountInPaise,
      cgstInPaise: math.cgstInPaise,
      sgstInPaise: math.sgstInPaise,
      igstInPaise: math.igstInPaise,
      totalTaxInPaise: math.totalTaxInPaise,
      totalInPaise: math.totalInPaise,
    };
  } else if (documentType === "platform_subscription_receipt" && amountOk) {
    taxFields = {
      ...taxFields,
      seller,
      totalInPaise: ledger.grossAmountInPaise,
      serviceDescription: "Platform-processed subscription payment",
    };
  } else if (seller) {
    taxFields = { ...taxFields, seller };
  }

  const stub: SubscriptionInvoiceDoc = {
    ...emptyInvoiceSkeleton(
      ledger,
      invoiceId,
      diagnosticUid,
      deps.nowMs,
      deps.historyEventId ?? null
    ),
    buyer,
    taxResponsibilityMode: policy.mode,
    documentType,
    pdfStatus,
    ecoReporting: {
      platform: ledger.platform,
      operatorIdentifier: ledger.platform === "android" ? "google_play" : "apple_app_store",
      operatorGstin: null,
      taxResponsibilityMode: policy.mode,
      section52TcsStatus: policy.section52TcsStatus,
      table14ClassificationStatus: policy.table14ClassificationStatus,
    },
    supplyOccurredAt: ledger.occurredAt,
    ...taxFields,
  };

  const allocated = await persistTaxDocument(deps.store, {
    stub,
    nowMs: deps.nowMs,
    allocateNumber,
  });
  let invoice = allocated.invoice;

  if (
    isIssuedInvoice(invoice) &&
    invoice.pdfStatus !== "ready" &&
    invoice.pdfStatus !== "awaiting_financial_evidence"
  ) {
    try {
      const html = buildSubscriptionTaxDocumentHtml(invoice);
      const pdf = await deps.renderer.renderHtmlToPdf({
        documentId: invoice.invoiceId,
        html,
        renderingProfile: APPROVED_RENDERING_PROFILE,
      });
      const fy = invoice.financialYear;
      if (!fy) {
        throw new BillingError({
          clientCode: "internal_error",
          causeCode: "issued_invoice_missing_financial_year",
        });
      }
      const storagePath = invoicePdfStoragePath(fy, invoice.invoiceId);
      await deps.storage.putObject({
        path: storagePath,
        bytes: pdf,
        contentType: "application/pdf",
        customMetadata: {
          invoiceNumber: invoice.documentNumber ?? "",
          plan: invoice.plan ?? "unknown",
          billingPeriod: invoice.billingPeriod ?? "",
          financialEventId: invoice.financialEventId,
        },
      });
      invoice = applyOperationalInvoicePatch(invoice, {
        pdfStatus: "ready",
        invoicePdfStoragePath: storagePath,
        updatedAt: deps.nowMs,
      });
      await persistInvoice(deps.store, invoice);
      await resolveInvoiceRetryStage(deps.store, {
        invoiceId: invoice.invoiceId,
        financialEventId,
        stage: "pdf",
        nowMs: deps.nowMs,
      });
    } catch (err) {
      const cause = err instanceof BillingError ? err.causeCode : "invoice_pdf_failed";
      const awaiting = cause === "invoice_renderer_unconfigured";
      invoice = applyOperationalInvoicePatch(invoice, {
        pdfStatus: awaiting ? "awaiting_renderer" : "failed",
        updatedAt: deps.nowMs,
      });
      await persistInvoice(deps.store, invoice);
      await enqueueInvoiceRetry(deps.store, {
        invoiceId: invoice.invoiceId,
        financialEventId,
        stage: "pdf",
        errorCode: cause,
        nowMs: deps.nowMs,
        alerter: deps.alerter,
      });
    }
  }

  if (invoice.pdfStatus === "ready") {
    const user = await deps.loadUser(ledger.uid);
    const hasVerified = Boolean(authoritativeVerifiedEmail(user));
    if (shouldAttemptInvoiceEmail(invoice.emailStatus, hasVerified)) {
      try {
        const downloadUrl = invoice.invoicePdfStoragePath
          ? await deps.storage.getSignedDownloadUrl(
              invoice.invoicePdfStoragePath,
              EMAIL_INVOICE_DOWNLOAD_TTL_MS
            )
          : null;
        const mailed = await sendInvoiceEmail({
          provider: deps.email,
          invoice,
          recipient: user,
          nowMs: deps.nowMs,
          fromAddress: deps.config.billingEmailFromAddress,
          downloadUrl,
        });
        invoice = applyOperationalInvoicePatch(invoice, {
          emailStatus: mailed.emailStatus,
          emailProviderMessageId: mailed.emailProviderMessageId,
          invoiceEmailAcceptedAt: mailed.invoiceEmailAcceptedAt,
          updatedAt: deps.nowMs,
        });
        await persistInvoice(deps.store, invoice);
        if (mailed.emailStatus === "failed") {
          await enqueueInvoiceRetry(deps.store, {
            invoiceId: invoice.invoiceId,
            financialEventId,
            stage: "email",
            errorCode: "invoice_email_failed",
            nowMs: deps.nowMs,
            alerter: deps.alerter,
          });
        } else if (mailed.emailStatus === "accepted") {
          await resolveInvoiceRetryStage(deps.store, {
            invoiceId: invoice.invoiceId,
            financialEventId,
            stage: "email",
            nowMs: deps.nowMs,
          });
        }
      } catch (err) {
        const cause = err instanceof BillingError ? err.causeCode : "invoice_email_failed";
        invoice = applyOperationalInvoicePatch(invoice, {
          emailStatus: "failed",
          updatedAt: deps.nowMs,
        });
        await persistInvoice(deps.store, invoice);
        await enqueueInvoiceRetry(deps.store, {
          invoiceId: invoice.invoiceId,
          financialEventId,
          stage: "email",
          errorCode: cause,
          nowMs: deps.nowMs,
          alerter: deps.alerter,
        });
      }
    }
  }

  if (invoice.historyEventId) {
    const histPath = subscriptionHistoryPath(ledger.uid, invoice.historyEventId);
    await deps.store.runTransaction(async (tx) => {
      const snap = await tx.get(histPath);
      if (!snap.exists) return;
      const current = snap.data() ?? {};
      tx.set(histPath, {
        ...current,
        taxDocumentId: invoice.invoiceId,
        taxDocumentNumber: invoice.documentNumber,
        taxDocumentType: invoice.documentType,
        plan: invoice.plan,
        billingPeriod: invoice.billingPeriod,
        taxableAmountInPaise: invoice.taxableAmountInPaise,
        taxAmountInPaise: invoice.totalTaxInPaise,
        totalInPaise: invoice.totalInPaise,
        invoiceAvailableForDownload: invoice.pdfStatus === "ready",
        gstinVerificationStatus: invoice.buyer.gstinVerificationStatus,
      });
    });
  }

  await deps.store.runTransaction(async (tx) => {
    const path = companyBillingPath(ledger.uid);
    const snap = await tx.get(path);
    if (!snap.exists) return;
    const current = snap.data() as unknown as CompanyBillingDoc;
    tx.set(path, {
      ...current,
      latestTaxDocumentId: invoice.invoiceId,
      updatedAt: deps.nowMs,
    } as unknown as Record<string, unknown>);
  });

  return invoice;
}
