/**
 * App Store billing-plan / commitment gates (VYD-33).
 *
 * Inspects types exported by `@apple/app-store-server-library@3.1.0`:
 * `BillingPlanType` / `RenewalBillingPlanType` (`BILLED_UPFRONT`, `MONTHLY`),
 * `JWSTransactionDecodedPayload.billingPlanType` + `commitmentInfo`
 * (`TransactionCommitmentInfo`), and
 * `JWSRenewalInfoDecodedPayload.renewalBillingPlanType` + `commitmentInfo`
 * (`RenewalCommitmentInfo`). Vyaamikk has not designed commitment
 * subscriptions. MONTHLY (12-month commitment billed monthly), non-empty
 * commitmentInfo, unknown future plan types, and a transaction/renewal plan
 * mismatch fail closed. Absent fields and BILLED_UPFRONT are allowed.
 */

import {
  BillingPlanType,
  RenewalBillingPlanType,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
} from "@apple/app-store-server-library";

import { BillingError } from "../errors";

function unsupportedCommitment(): BillingError {
  return new BillingError({
    clientCode: "verification_failed",
    causeCode: "unsupported_ios_commitment_billing_plan",
  });
}

function hasMaterialCommitment(info: unknown): boolean {
  if (info == null) return false;
  if (typeof info !== "object" || Array.isArray(info)) {
    throw unsupportedCommitment();
  }
  return Object.values(info as Record<string, unknown>).some((value) => value != null && value !== "");
}

function assertTransactionBillingPlan(transaction: JWSTransactionDecodedPayload): void {
  if (hasMaterialCommitment(transaction.commitmentInfo)) {
    throw unsupportedCommitment();
  }
  const plan = transaction.billingPlanType;
  if (plan == null) return;
  if (plan === BillingPlanType.MONTHLY) {
    throw unsupportedCommitment();
  }
  if (plan !== BillingPlanType.BILLED_UPFRONT) {
    throw unsupportedCommitment();
  }
}

function assertRenewalBillingPlan(renewal: JWSRenewalInfoDecodedPayload): void {
  if (hasMaterialCommitment(renewal.commitmentInfo)) {
    throw unsupportedCommitment();
  }
  const plan = renewal.renewalBillingPlanType;
  if (plan == null) return;
  if (plan === RenewalBillingPlanType.MONTHLY) {
    throw unsupportedCommitment();
  }
  if (plan !== RenewalBillingPlanType.BILLED_UPFRONT) {
    throw unsupportedCommitment();
  }
}

export function iosBillingPlanSemanticKey(
  transaction: JWSTransactionDecodedPayload,
  renewal: JWSRenewalInfoDecodedPayload
): unknown {
  return {
    billingPlanType: transaction.billingPlanType ?? null,
    commitmentInfo: transaction.commitmentInfo ?? null,
    renewalBillingPlanType: renewal.renewalBillingPlanType ?? null,
    renewalCommitmentInfo: renewal.commitmentInfo ?? null,
  };
}

export function assertIosBillingPlanSupported(
  transaction: JWSTransactionDecodedPayload,
  renewal?: JWSRenewalInfoDecodedPayload
): void {
  assertTransactionBillingPlan(transaction);
  if (!renewal) return;
  assertRenewalBillingPlan(renewal);
  const txPlan = transaction.billingPlanType;
  const renewalPlan = renewal.renewalBillingPlanType;
  if (txPlan != null && renewalPlan != null && txPlan !== renewalPlan) {
    throw unsupportedCommitment();
  }
}
