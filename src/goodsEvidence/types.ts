import { GOODS_EVIDENCE_SCHEMA_VERSION } from "./constants";
import type { Quantity } from "./quantities";
import type { EwbLink } from "./ewb";

export type SchemaVersioned = { readonly schemaVersion: typeof GOODS_EVIDENCE_SCHEMA_VERSION };

export type CaptureProvenance = "online" | "offline" | "late_entry";

export type SupplierRegistration =
  | { kind: "registered"; gstin: string }
  | { kind: "unregistered" }
  | { kind: "not_supplied" };

export type OptionalText =
  | { kind: "present"; value: string }
  | { kind: "unknown"; reason: string }
  | { kind: "not_supplied" };

export type MoneyMinor = {
  currency: string;
  /** Integer minor units (paise for INR). */
  minorUnits: number;
};

export type QcStatus = "accepted" | "hold" | "partial" | "rejected";

export type CustodyState =
  | "received"
  | "held_for_qc"
  | "accepted_for_stock"
  | "refused_at_gate"
  | "returned";

export type AcknowledgementOutcome = "signed" | "refused" | "unavailable" | "not_requested";

export type GrinEventType =
  | "receipt_registered"
  | "field_amended"
  | "evidence_registered"
  | "evidence_verified"
  | "qc_decision"
  | "qc_reclassified"
  | "acknowledgement_recorded"
  | "stock_reference_recorded"
  | "payment_reference_recorded"
  | "ewb_observation_recorded"
  | "ewb_linked"
  | "rejection_recorded"
  | "return_dispatched"
  | "return_received"
  | "void_with_reason"
  | "exception_resolved";

export interface BuyerIdentitySnapshot {
  legalName: string;
  gstin: OptionalText;
  address: OptionalText;
}

export interface SupplierSnapshot {
  name: OptionalText;
  registration: SupplierRegistration;
  address: OptionalText;
  contact: OptionalText;
}

export interface CommercialLinks {
  supplierInvoiceNumber: OptionalText;
  supplierInvoiceDate: OptionalText;
  supplierInvoiceValue: MoneyMinor | null;
  purchaseOrderNumber: OptionalText;
  purchaseOrderInternalId: OptionalText;
  challanNumber: OptionalText;
  missingDocumentReason: OptionalText;
}

export interface TransportSnapshot {
  vehicleNumber: OptionalText;
  transporterName: OptionalText;
  transporterId: OptionalText;
  lrNumber: OptionalText;
  mode: OptionalText;
}

export interface ReceiptLine {
  lineId: string;
  description: string;
  hsn: OptionalText;
  invoiceLineRef: OptionalText;
  invoiceQuantity: Quantity | null;
  expectedOnThisDelivery: Quantity;
  physicallyReceived: Quantity;
  unit: string;
  grossWeight: Quantity | null;
  tareWeight: Quantity | null;
  netWeight: Quantity | null;
  weightUnit: OptionalText;
  packageCount: Quantity | null;
  shortageOrExcess: "shortage" | "excess" | "none" | "unknown";
  condition: OptionalText;
  qcStatus: QcStatus | null;
}

export interface AcknowledgementState {
  outcome: AcknowledgementOutcome;
  claimedRole: OptionalText;
  statement: string;
  explanation: OptionalText;
}

/**
 * Immutable issued envelope. Amendments never rewrite this document.
 * Display number and serverRegisteredAt are null only before registration.
 */
export interface ImmutableGrin extends SchemaVersioned {
  receiptId: string;
  ownerUid: string;
  ledgerId: string;
  series: string;
  serial: number | null;
  issuedNumber: string | null;
  fyToken: string | null;
  buyer: BuyerIdentitySnapshot;
  supplier: SupplierSnapshot;
  commercial: CommercialLinks;
  ewb: EwbLink;
  transport: TransportSnapshot;
  lines: ReceiptLine[];
  custody: CustodyState;
  receivingEmployeeAttributed: OptionalText;
  qualityCheckedByAttributed: OptionalText;
  remarks: OptionalText;
  acknowledgement: AcknowledgementState;
  warehouse: OptionalText;
  locationBin: OptionalText;
  captureProvenance: CaptureProvenance;
  capturedAtClientUtc: string;
  reportedArrivalAt: string;
  reportedArrivalTimeZone: string;
  serverRegisteredAtUtc: string | null;
  originalSnapshotHash: string | null;
}

export interface GrinEvent extends SchemaVersioned {
  eventId: string;
  receiptId: string;
  streamSequence: number;
  type: GrinEventType;
  actorUid: string;
  serverAcceptedAtUtc: string;
  clientObservedAtUtc: string;
  reason: string;
  expectedPreviousVersion: number;
  typedChanges: Record<string, unknown>;
  previousHash: string | null;
  eventHash: string;
  /** Resolved after commit; never mixed into eventHash. */
  firestoreCommitTime: string | null;
}

export interface GrinView extends SchemaVersioned {
  receiptId: string;
  eventVersion: number;
  headHash: string;
  issuedNumber: string | null;
  custody: CustodyState;
  qcStatus: QcStatus | null;
  voided: boolean;
  warnings: string[];
}

export type CommandAdmission =
  | { ok: true; replayed: boolean }
  | {
      ok: false;
      code: "digest_conflict" | "version_conflict" | "disabled" | "voided" | "receipt_exists" | "invalid";
      detail: string;
    };
