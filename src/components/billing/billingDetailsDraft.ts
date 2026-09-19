/**
 * Billing-details draft mapping. Kept out of the RN form so Node tests can
 * exercise the session-owned management runtime without transforming RN.
 * GSTIN is never client-verified.
 */

import { gstStateName } from "@/subscription/gstStates";
import type { ClientBillingDetails } from "@/subscription/billingDetailsReader";

export type BillingDetailsDraft = {
  billingRecipientName: string;
  gstin: string;
  billingBusinessName: string;
  billingAddressLine1: string;
  billingAddressLine2: string;
  billingCity: string;
  billingPostalCode: string;
  billingStateCode: string;
};

export function draftFromDetails(details: ClientBillingDetails | null): BillingDetailsDraft {
  return {
    billingRecipientName: details?.billingRecipientName ?? "",
    gstin: details?.gstin ?? "",
    billingBusinessName: details?.billingBusinessName ?? "",
    billingAddressLine1: details?.billingAddressLine1 ?? "",
    billingAddressLine2: details?.billingAddressLine2 ?? "",
    billingCity: details?.billingCity ?? "",
    billingPostalCode: details?.billingPostalCode ?? "",
    billingStateCode: details?.billingStateCode ?? "",
  };
}

export function payloadFromDraft(draft: BillingDetailsDraft) {
  const stateCode = draft.billingStateCode.trim();
  return {
    billingRecipientName: draft.billingRecipientName.trim() || null,
    gstin: draft.gstin.trim() || null,
    billingBusinessName: draft.billingBusinessName.trim() || null,
    billingAddressLine1: draft.billingAddressLine1.trim() || null,
    billingAddressLine2: draft.billingAddressLine2.trim() || null,
    billingCity: draft.billingCity.trim() || null,
    billingPostalCode: draft.billingPostalCode.trim() || null,
    billingStateCode: stateCode || null,
    billingStateName: stateCode ? gstStateName(stateCode) : null,
  };
}
