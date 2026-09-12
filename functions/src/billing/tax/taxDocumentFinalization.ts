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

import { BillingError } from "../errors";
import {
  billingDetailsPath,
  financialLedgerPath,
  invoiceCounterPath,
  subscriptionInvoicePath,
  subscriptionTaxCompliancePath,
} from "../paths";
import {
  getCatalogEntry,
  isCanonicalSku,
  subscriptionDescriptionForSku,
} from "../products";
import type { BillingStore } from "../store";
import type {
  BillingEventLedgerDoc,
  InvoiceCounterDoc,
  InvoicePdfStatus,
  SubscriptionBillingDetailsDoc,
  SubscriptionInvoiceDoc,
  SubscriptionTaxComplianceDoc,
} from "../types";

import {
  isRecipientTaxClassificationPending,
  recipientInvoiceDetailsIncomplete,
  statutoryBuyerFromDetails,
} from "./buyerSnapshot";
import { formatIstCalendarDate, getFinancialYearForDate } from "./financialYearUtils";
import {
  formatPlatformReceiptNumber,
  formatTaxInvoiceNumber,
  invoiceIdForFinancialEvent,
  isIssuedInvoice,
  isUnissuedDraft,
  type AllocateInvoiceResult,
} from "./invoiceAllocation";
import { resolvePlaceOfSupply } from "./placeOfSupply";
import {
  channelForStorePlatform,
  classifyTaxDocument,
  ecoSnapshotFromPolicy,
  mayAllocateStatutoryNumber,
  mayIssueDeveloperTaxInvoice,
  resolvePlatformTaxPolicy,
} from "./platformTaxPolicy";
import {
  isReverseChargeApproved,
  isSacAndRateApproved,
  isSellerIdentityComplete,
  loadSellerTaxIdentity,
  policyOverridesFromConfig,
  type SellerIdentityConfig,
} from "./sellerIdentity";
import { calculateGst } from "./taxMath";
import { resolveTaxPeriod } from "./taxPeriod";
import { buildInvoiceComplianceDoc } from "./taxCompliance";

export interface FinalizeUnissuedInvoiceInput {
  financialEventId: string;
  config: SellerIdentityConfig;
  diagnosticUidFor: (uid: string) => string;
  nowMs: number;
  historyEventId?: string | null;
}

function operationalFrom(
  existing: SubscriptionInvoiceDoc | null,
  pdfStatus: InvoicePdfStatus
): Pick<
  SubscriptionInvoiceDoc,
  | "pdfStatus"
  | "invoicePdfStoragePath"
  | "emailStatus"
  | "emailProviderMessageId"
  | "invoiceEmailAcceptedAt"
  | "invoiceEmailDeliveredAt"
  | "gstrReportedMonth"
  | "gstrFilingBatchId"
> {
  return {
    pdfStatus: existing?.pdfStatus ?? pdfStatus,
    invoicePdfStoragePath: existing?.invoicePdfStoragePath ?? null,
    emailStatus: existing?.emailStatus ?? "pending",
    emailProviderMessageId: existing?.emailProviderMessageId ?? null,
    invoiceEmailAcceptedAt: existing?.invoiceEmailAcceptedAt ?? null,
    invoiceEmailDeliveredAt: existing?.invoiceEmailDeliveredAt ?? null,
    gstrReportedMonth: existing?.gstrReportedMonth ?? null,
    gstrFilingBatchId: existing?.gstrFilingBatchId ?? null,
  };
}

/**
 * Authoritative statutory finalization. All Firestore documents used for
 * issuance are read in THIS transaction before any write.
 */
export async function finalizeUnissuedInvoice(
  store: BillingStore,
  input: FinalizeUnissuedInvoiceInput
): Promise<AllocateInvoiceResult> {
  const ledgerPath = financialLedgerPath(input.financialEventId);
  const issueAt = input.nowMs;
  const fyForIssue = getFinancialYearForDate(issueAt);
  const counterPath = invoiceCounterPath(fyForIssue);
  const overrides = policyOverridesFromConfig(input.config);

  return store.runTransaction(async (tx) => {
    const ledgerSnap = await tx.get(ledgerPath);
    if (!ledgerSnap.exists) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "financial_event_missing",
      });
    }
    const ledger = ledgerSnap.data() as unknown as BillingEventLedgerDoc;
    if (ledger.financialEventId !== input.financialEventId) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "financial_event_missing",
      });
    }
    if (ledger.eventType === "refund" || ledger.eventType === "chargeback") {
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "financial_event_not_invoiceable",
      });
    }
    if (ledger.eventType !== "purchase" && ledger.eventType !== "renewal") {
      throw new BillingError({
        clientCode: "invalid_purchase",
        causeCode: "unknown_financial_event_type",
      });
    }
    if (!isCanonicalSku(ledger.canonicalSku)) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "unknown_canonical_sku",
      });
    }
    const invoiceId = invoiceIdForFinancialEvent(ledger.financialEventId);
    const invoicePath = subscriptionInvoicePath(invoiceId);
    const existingSnap = await tx.get(invoicePath);
    const existing = existingSnap.exists
      ? (existingSnap.data() as unknown as SubscriptionInvoiceDoc)
      : null;
    if (existing && existing.financialEventId !== ledger.financialEventId) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "invoice_id_collision",
      });
    }
    const detailsSnap = await tx.get(billingDetailsPath(ledger.uid));
    const counterSnap = await tx.get(counterPath);
    const compliancePath = subscriptionTaxCompliancePath(invoiceId);
    const complianceSnap = await tx.get(compliancePath);
    if (existing && isIssuedInvoice(existing)) {
      return { invoice: existing, reused: true, newlyIssued: false };
    }
    if (existing && !isUnissuedDraft(existing)) {
      throw new BillingError({
        clientCode: "internal_error",
        causeCode: "invoice_issue_state_corrupt",
      });
    }

    const details = detailsSnap.exists
      ? (detailsSnap.data() as unknown as SubscriptionBillingDetailsDoc)
      : null;

    const catalog = getCatalogEntry(ledger.canonicalSku);
    const subscriptionDescription = subscriptionDescriptionForSku(ledger.canonicalSku);
    const buyer = statutoryBuyerFromDetails(details);
    const pendingRecipient = isRecipientTaxClassificationPending(details);
    const recipientDetailsIncomplete = recipientInvoiceDetailsIncomplete(
      details,
      buyer.classification
    );
    const issueHoldReason = pendingRecipient
      ? "recipient_tax_classification_pending"
      : recipientDetailsIncomplete
        ? "recipient_invoice_details_incomplete"
        : null;
    const channel = channelForStorePlatform(ledger.platform);
    const policy = resolvePlatformTaxPolicy(ledger.platform, overrides);
    const ecoIds = ecoSnapshotFromPolicy(ledger.platform, policy, overrides[channel]);
    const documentType = classifyTaxDocument({
      policy,
      buyerIsVerifiedB2b: buyer.classification === "b2b" && buyer.gstinVerificationStatus === "verified",
      recipientClassificationPending: pendingRecipient,
    });
    const amountOk =
      Number.isInteger(ledger.grossAmountInPaise) &&
      ledger.grossAmountInPaise >= 0 &&
      ledger.currency === "INR";
    const sellerReady = isSellerIdentityComplete(input.config);
    const sacReady = isSacAndRateApproved(input.config);
    const reverseChargeReady = isReverseChargeApproved(input.config.reverseChargeMode);
    const priceBasisReady = typeof input.config.priceIncludesGst === "boolean";
    const seller = sellerReady ? loadSellerTaxIdentity(input.config) : null;
    const pdfStatus: InvoicePdfStatus = amountOk ? "pending" : "awaiting_financial_evidence";
    const canFinalizeDeveloperInvoice =
      mayIssueDeveloperTaxInvoice(documentType) &&
      amountOk &&
      sellerReady &&
      sacReady &&
      reverseChargeReady &&
      priceBasisReady &&
      seller != null &&
      !pendingRecipient &&
      !recipientDetailsIncomplete;
    const allocateNumber =
      pdfStatus !== "awaiting_financial_evidence" &&
      !pendingRecipient &&
      !recipientDetailsIncomplete &&
      (documentType === "platform_subscription_receipt" || canFinalizeDeveloperInvoice);

    const diagnosticUid = input.diagnosticUidFor(ledger.uid);
    let stub: SubscriptionInvoiceDoc = {
      invoiceId,
      uid: ledger.uid,
      diagnosticUid,
      financialEventId: ledger.financialEventId,
      platform: ledger.platform,
      canonicalSku: ledger.canonicalSku,
      plan: catalog.plan,
      billingPeriod: catalog.period,
      subscriptionDescription,
      taxResponsibilityMode: policy.mode,
      documentType,
      documentNumber: null,
      financialYear: null,
      taxPeriodMonth: null,
      taxPeriodStatus: "pending_issue",
      invoiceIssuedAt: null,
      invoiceIssuedOnIst: null,
      supplyOccurredAt: ledger.occurredAt,
      issueStatus: "unissued_draft",
      issueHoldReason,
      reverseChargeMode: input.config.reverseChargeMode,
      seller,
      buyer,
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
        operatorIdentifier: ecoIds.operatorIdentifier,
        operatorGstin: ecoIds.operatorGstin,
        taxResponsibilityMode: policy.mode,
        ecoReportingCategory: policy.ecoReportingCategory,
      },
      gstrReportable: false,
      ...operationalFrom(existing, pdfStatus),
      pdfStatus: existing?.pdfStatus === "ready" ? existing.pdfStatus : pdfStatus,
      historyEventId: existing?.historyEventId ?? input.historyEventId ?? null,
      createdAt: existing?.createdAt ?? issueAt,
      updatedAt: issueAt,
    };

    if (canFinalizeDeveloperInvoice && seller && typeof input.config.priceIncludesGst === "boolean") {
      const pos = resolvePlaceOfSupply({
        classification: buyer.classification,
        verifiedRecipientStateCode: buyer.classification === "b2b" ? buyer.stateCode : null,
        recipientAddressStateCode: buyer.classification === "b2c" ? buyer.stateCode : null,
        sellerStateCode: seller.stateCode,
      });
      const math = calculateGst({
        totalInPaise: ledger.grossAmountInPaise,
        gstRateBps: input.config.gstRateBps as number,
        priceIncludesGst: input.config.priceIncludesGst,
        taxType: pos.taxType,
        currency: "INR",
      });
      stub = {
        ...stub,
        seller,
        placeOfSupplyStateCode: pos.placeOfSupplyStateCode,
        placeOfSupplyStateName: pos.placeOfSupplyStateName,
        sacCode: input.config.serviceSacCode,
        serviceDescription: input.config.serviceSacDescription,
        gstRateBps: math.gstRateBps,
        taxType: math.taxType,
        taxableAmountInPaise: math.taxableAmountInPaise,
        cgstInPaise: math.cgstInPaise,
        sgstInPaise: math.sgstInPaise,
        igstInPaise: math.igstInPaise,
        totalTaxInPaise: math.totalTaxInPaise,
        totalInPaise: math.totalInPaise,
      };
    } else if (
      documentType === "platform_subscription_receipt" &&
      amountOk &&
      !pendingRecipient &&
      !recipientDetailsIncomplete
    ) {
      stub = {
        ...stub,
        totalInPaise: ledger.grossAmountInPaise,
        serviceDescription: "Platform-processed subscription payment",
      };
    }

    let documentNumber: string | null = null;
    let invoiceIssuedAt: number | null = null;
    let nextCounter: InvoiceCounterDoc | null = null;
    const wantsNumber = allocateNumber && mayAllocateStatutoryNumber(documentType);
    if (wantsNumber) {
      const prior = (counterSnap.data() as InvoiceCounterDoc | undefined) ?? {
        currentTaxInvoiceCount: 0,
        currentReceiptCount: 0,
        financialYear: fyForIssue,
        updatedAt: issueAt,
      };
      if (documentType === "platform_subscription_receipt") {
        const serial = prior.currentReceiptCount + 1;
        documentNumber = formatPlatformReceiptNumber(fyForIssue, serial);
        nextCounter = { ...prior, currentReceiptCount: serial, updatedAt: issueAt };
      } else {
        const serial = prior.currentTaxInvoiceCount + 1;
        documentNumber = formatTaxInvoiceNumber(fyForIssue, serial);
        nextCounter = { ...prior, currentTaxInvoiceCount: serial, updatedAt: issueAt };
      }
      invoiceIssuedAt = issueAt;
    }

    const taxPeriod = resolveTaxPeriod({
      supplyOccurredAt: ledger.occurredAt,
      invoiceIssuedAt,
    });
    const issued = documentNumber != null && invoiceIssuedAt != null;
    const created: SubscriptionInvoiceDoc = {
      ...stub,
      documentNumber,
      invoiceIssuedAt,
      invoiceIssuedOnIst: invoiceIssuedAt ? formatIstCalendarDate(invoiceIssuedAt) : null,
      financialYear: issued ? fyForIssue : null,
      taxPeriodMonth: taxPeriod.taxPeriodMonth,
      taxPeriodStatus: taxPeriod.taxPeriodStatus,
      issueStatus: issued ? "issued" : "unissued_draft",
      issueHoldReason: issued ? null : stub.issueHoldReason,
      gstrReportable:
        issued &&
        taxPeriod.taxPeriodStatus === "resolved" &&
        mayIssueDeveloperTaxInvoice(documentType),
      createdAt: existing?.createdAt ?? issueAt,
      updatedAt: issueAt,
    };
    const priorCompliance = complianceSnap.exists
      ? (complianceSnap.data() as unknown as SubscriptionTaxComplianceDoc)
      : null;
    const compliance = buildInvoiceComplianceDoc({
      invoice: created,
      existing: priorCompliance,
      nowMs: issueAt,
    });
    if (existingSnap.exists) {
      tx.set(invoicePath, created as unknown as Record<string, unknown>);
    } else {
      tx.create(invoicePath, created as unknown as Record<string, unknown>);
    }
    if (complianceSnap.exists) {
      tx.set(compliancePath, compliance as unknown as Record<string, unknown>);
    } else {
      tx.create(compliancePath, compliance as unknown as Record<string, unknown>);
    }
    if (nextCounter) {
      tx.set(counterPath, nextCounter as unknown as Record<string, unknown>);
    }
    return { invoice: created, reused: false, newlyIssued: issued };
  });
}
