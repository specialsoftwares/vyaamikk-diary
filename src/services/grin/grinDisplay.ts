import type { Quantity as Qty } from "@/goodsEvidence/quantities";
import type {
  AcknowledgementOutcome,
  CaptureProvenance,
  CustodyState,
  OptionalText as Opt,
  QcStatus,
} from "@/goodsEvidence/types";
import type { OutboxLocalState } from "@/goodsEvidence/ports";
import type { EwbPortalStatus, EwbInternalMovement } from "@/goodsEvidence/ewb";
import type { ExceptionResultKind, ExceptionRuleId } from "@/goodsEvidence/exceptions";
import { GRIN_DOCUMENT_FOOTER, OFFLINE_PENDING_BANNER } from "@/goodsEvidence/constants";

type TFn = (key: string, vars?: Record<string, string | number>) => string;

export function formatOptionalText(value: Opt, t: TFn): string {
  if (value.kind === "present") return value.value;
  if (value.kind === "unknown") return t("grin.optional.unknownWithReason", { reason: value.reason });
  return t("grin.optional.notSupplied");
}

export function formatQuantity(qty: Qty | null | undefined, t: TFn): string {
  if (!qty) return t("grin.optional.notSupplied");
  return `${qty.value} ${qty.unit}`;
}

export function formatMoneyMinor(value: { currency: string; minorUnits: number } | null, t: TFn): string {
  if (!value) return t("grin.optional.notSupplied");
  const major = (value.minorUnits / 100).toFixed(2);
  return `${value.currency} ${major}`;
}

export function custodyLabel(custody: CustodyState | null, t: TFn): string {
  if (custody == null) return t("grin.projection.incomplete");
  switch (custody) {
    case "received":
      return t("grin.custody.received");
    case "held_for_qc":
      return t("grin.custody.heldForQc");
    case "accepted_for_stock":
      return t("grin.custody.acceptedForStock");
    case "refused_at_gate":
      return t("grin.custody.refusedAtGate");
    case "partially_returned":
      return t("grin.custody.partiallyReturned");
    case "returned":
      return t("grin.custody.returned");
  }
}

export function qcLabel(status: QcStatus | null, t: TFn): string {
  if (status == null) return t("grin.qc.notRecorded");
  switch (status) {
    case "accepted":
      return t("grin.qc.accepted");
    case "hold":
      return t("grin.qc.hold");
    case "partial":
      return t("grin.qc.partial");
    case "rejected":
      return t("grin.qc.rejected");
  }
}

export function ackLabel(outcome: AcknowledgementOutcome, t: TFn): string {
  switch (outcome) {
    case "signed":
      return t("grin.ack.signed");
    case "refused":
      return t("grin.ack.refused");
    case "unavailable":
      return t("grin.ack.unavailable");
    case "not_requested":
      return t("grin.ack.notRequested");
  }
}

export function localStateLabel(state: OutboxLocalState, t: TFn): string {
  switch (state) {
    case "draft":
      return t("grin.local.draft");
    case "queued":
      return t("grin.local.queued");
    case "dispatching":
      return t("grin.local.dispatching");
    case "issued":
      return t("grin.local.issued");
    case "attachment_pending":
      return t("grin.local.attachmentPending");
    case "conflicted":
      return t("grin.local.conflicted");
    case "failed_retryable":
      return t("grin.local.failedRetryable");
    case "failed_permanent":
      return t("grin.local.failedPermanent");
  }
}

export function captureLabel(value: CaptureProvenance | null, t: TFn): string {
  if (value == null) return t("grin.projection.incomplete");
  switch (value) {
    case "online":
      return t("grin.capture.online");
    case "offline":
      return t("grin.capture.offline");
    case "late_entry":
      return t("grin.capture.lateEntry");
  }
}

export function shortageLabel(value: "shortage" | "excess" | "none" | "unknown", t: TFn): string {
  switch (value) {
    case "shortage":
      return t("grin.shortage.shortage");
    case "excess":
      return t("grin.shortage.excess");
    case "none":
      return t("grin.shortage.none");
    case "unknown":
      return t("grin.shortage.unknown");
  }
}

export function portalStatusLabel(status: EwbPortalStatus, t: TFn): string {
  switch (status) {
    case "generated_active":
      return t("grin.ewb.status.generatedActive");
    case "cancelled":
      return t("grin.ewb.status.cancelled");
    case "cancellation_unvalidated":
      return t("grin.ewb.status.cancellationUnvalidated");
    case "expired":
      return t("grin.ewb.status.expired");
    case "closed":
      return t("grin.ewb.status.closed");
    case "unknown":
      return t("grin.ewb.status.unknown");
  }
}

export function movementLabel(movement: EwbInternalMovement, t: TFn): string {
  switch (movement) {
    case "planned":
      return t("grin.ewb.movement.planned");
    case "in_transit":
      return t("grin.ewb.movement.inTransit");
    case "arrived_received":
      return t("grin.ewb.movement.arrivedReceived");
    case "gate_refused":
      return t("grin.ewb.movement.gateRefused");
    case "return_in_transit":
      return t("grin.ewb.movement.returnInTransit");
    case "return_delivered":
      return t("grin.ewb.movement.returnDelivered");
  }
}

export function exceptionKindLabel(kind: ExceptionResultKind, t: TFn): string {
  switch (kind) {
    case "clear":
      return t("grin.exception.kind.clear");
    case "exception":
      return t("grin.exception.kind.exception");
    case "not_applicable":
      return t("grin.exception.kind.notApplicable");
    case "unknown_incomplete_source":
      return t("grin.exception.kind.unknownIncompleteSource");
  }
}

export function exceptionRuleLabel(ruleId: ExceptionRuleId, t: TFn): string {
  switch (ruleId) {
    case "ewb_without_invoice_or_book_entry":
      return t("grin.exception.rule.ewbWithoutInvoiceOrBook");
    case "invoice_requires_ewb_none_linked":
      return t("grin.exception.rule.invoiceRequiresEwb");
    case "inward_ewb_without_grin":
      return t("grin.exception.rule.inwardEwbWithoutGrin");
    case "grin_without_invoice":
      return t("grin.exception.rule.grinWithoutInvoice");
    case "cancelled_ewb_lacks_reason_or_replacement":
      return t("grin.exception.rule.cancelledEwbDetails");
    case "amount_or_party_mismatch":
      return t("grin.exception.rule.amountOrPartyMismatch");
    case "gstr2b_purchase_without_grin":
      return t("grin.exception.rule.gstr2bWithoutGrin");
    case "grin_or_invoice_missing_from_2b":
      return t("grin.exception.rule.missingFrom2b");
    case "supplier_later_suspended_or_cancelled":
      return t("grin.exception.rule.supplierStatus");
    case "return_without_return_ewb_or_credit_note":
      return t("grin.exception.rule.returnDocumentGap");
  }
}

export function offlinePendingBannerText(t: TFn): string {
  const translated = t("grin.offlinePendingBanner");
  if (!translated || translated === "grin.offlinePendingBanner") return OFFLINE_PENDING_BANNER;
  return translated;
}

export function grinDocumentFooterText(): string {
  return GRIN_DOCUMENT_FOOTER;
}
