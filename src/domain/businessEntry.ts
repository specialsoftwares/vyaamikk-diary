/**
 * Structured business diary records — Business Entry Composer.
 *
 * Every record shares base metadata; type-specific fields live in `payload`.
 * Legacy V1 entries are normalised to `entryType: "legacy"` on read.
 */

import type { DocumentHistory } from "./documentHistory";
import type { IndianPostalLocation } from "./indianPostal";
import type { RecordGpsLocation } from "./recordLocation";
import type { EntryReminder, GeoPoint, UEID } from "./types";

export type BusinessEntryType =
  | "letterhead_matter"
  | "work_update_issue"
  | "staff_matter"
  | "business_cash_given"
  | "material_dispatched"
  | "material_received"
  | "material_return"
  | "payment_request"
  | "outward_freight_details"
  | "reminder_purchase"
  | "reminder_email"
  | "reminder_gst_return"
  | "legacy";

export type EntrySource = "composer" | "letterhead" | "legacy";
export type EntryRecordStatus = "active" | "settled" | "archived";

export interface AttachmentRef {
  id: string;
  uri: string;
  mimeType: string | null;
  name: string | null;
}

export interface EntryLocation {
  /** Manual site / place label (searchable without GPS permission). */
  name: string | null;
  /** Legacy GPS shape — kept for backward compatibility with stored rows. */
  geo: GeoPoint | null;
  /** Opt-in device GPS footprint (preferred when present). */
  gps?: RecordGpsLocation | null;
}

export type StaffMatterType =
  | "instruction"
  | "leave_absence"
  | "work_allocation"
  | "performance_issue"
  | "misconduct_negligence"
  | "appreciation"
  | "other_note";

export type CashSettlementStatus = "pending" | "partial" | "settled";

export type MaterialQualityStatus =
  | "ok"
  | "short"
  | "damaged"
  | "rejected"
  | "pending_issue";

export type GstReturnType = "gstr1" | "gstr3b" | "gstr9" | "other";

export type FreightType = "to_pay" | "paid" | "tbb" | "other";

export type CcCopyInstruction = "attach" | "not_attached" | "not_applicable";

export interface LetterheadMatterPayload {
  letterheadDocumentId: string | null;
  subject: string | null;
  reference: string | null;
  body: string;
  closing: string | null;
  signerName: string | null;
  designation: string | null;
  place: string | null;
}

export interface WorkUpdateIssuePayload {
  workDone: string | null;
  issueProblem: string | null;
  sitePlace: string | null;
  quantityOutput: string | null;
  responsiblePerson: string | null;
  followUpRequired: boolean;
}

export interface StaffMatterPayload {
  staffName: string;
  matterDetails: string;
  matterType: StaffMatterType;
  actionRequired: string | null;
}

export interface BusinessCashGivenPayload {
  amount: number;
  givenToName: string;
  purpose: string;
  paymentDate: number;
  paymentMode: string;
  settlementStatus: CashSettlementStatus;
  contactMobile: string | null;
  businessRef: string | null;
  siteRef: string | null;
  expectedSettlementDate: number | null;
  remarks: string | null;
}

export interface MaterialDispatchedPayload {
  partyName: string;
  materialName: string;
  quantity: number;
  unit: string;
  invoiceChallan: string | null;
  vehicleNumber: string | null;
  transporter: string | null;
  lrGrNumber: string | null;
  dispatchLocation: string | null;
  destination: string | null;
  dispatchFromPostal?: IndianPostalLocation | null;
  deliveryToPostal?: IndianPostalLocation | null;
  expectedDeliveryDate: number | null;
  remarks: string | null;
  /** User-entered 12-digit EBN — not GST-verified. */
  ewayBillNumber?: string | null;
  materialDescription?: string | null;
  referenceNote?: string | null;
  totalBoxes?: number | null;
  totalWeight?: number | null;
  weightUnit?: string | null;
  freightType?: FreightType | null;
  freightAmount?: number | null;
  ccCopyInstruction?: CcCopyInstruction | null;
  clarificationContactName?: string | null;
  clarificationContactMobile?: string | null;
}

export interface MaterialReceivedPayload {
  supplierName: string;
  materialName: string;
  quantity: number;
  unit: string;
  invoiceBill: string | null;
  vehicleNumber: string | null;
  receivedLocation: string | null;
  receivedAtPostal?: IndianPostalLocation | null;
  supplierPostal?: IndianPostalLocation | null;
  checkedBy: string | null;
  qualityStatus: MaterialQualityStatus;
  issueNote: string | null;
  paymentFollowUp: boolean;
}

/** Return / replacement movement — same family as dispatch/receipt/freight. */
export interface MaterialReturnPayload {
  partyName: string;
  materialName: string;
  quantity: number;
  unit: string;
  returnReason: string;
  fromLocation: string | null;
  toLocation: string | null;
  returnFromPostal?: IndianPostalLocation | null;
  returnToPostal?: IndianPostalLocation | null;
  lrGrNumber: string | null;
  vehicleNumber: string | null;
  transporter: string | null;
  remarks: string | null;
}

export interface ReminderPurchasePayload {
  itemMaterial: string;
  requiredQuantity: string | null;
  requiredByDate: number | null;
  vendor: string | null;
  estimatedAmount: string | null;
  priority: "low" | "normal" | "high" | null;
}

export interface ReminderEmailPayload {
  purposeSubject: string;
  recipientName: string | null;
  recipientEmail: string | null;
  relatedMatter: string | null;
  draftNotes: string | null;
}

export interface ReminderGstReturnPayload {
  returnType: GstReturnType;
  taxPeriod: string;
  dueDate: number;
  gstin: string | null;
  businessName: string | null;
  complianceNote: string | null;
}

export interface PaymentBankDetails {
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  upiId: string | null;
  paymentInstruction: string | null;
}

/** User-maintained dues / payment request — not a payment gateway or legal notice. */
export interface PaymentRequestPayload {
  partyName: string;
  invoiceNumber: string;
  invoiceDate: number | null;
  pendingAmount: number;
  dueDate: number | null;
  contactPerson: string | null;
  requestNote: string;
  includeBankDetailsInPdf: boolean;
  /** When true and both invoice/due dates are valid, PDF/share may include payment period. */
  includePaymentPeriodInPdf?: boolean;
  bankDetails: PaymentBankDetails | null;
  partyPostal?: IndianPostalLocation | null;
}

/** Transporter-facing dispatch / freight record — may link to material_dispatched. */
export interface OutwardFreightPayload {
  dispatchTitle: string | null;
  billNumber: string;
  billDate: number | null;
  lrGrNumber: string | null;
  deliveryLocation: string;
  dispatchFromLocation: string | null;
  totalBoxes: number;
  totalWeight: number;
  weightUnit: string;
  freightType: FreightType;
  transporterName: string | null;
  vehicleNumber: string | null;
  ccCopyInstruction: CcCopyInstruction;
  clarificationContactName: string;
  clarificationContactMobile: string;
  remarks: string | null;
  partyName: string | null;
  materialName: string | null;
  linkedDispatchId: string | null;
  /** Dispatch `updatedAt` when this freight record was last synced from dispatch. */
  linkedDispatchUpdatedAt: number | null;
  dispatchFromPostal?: IndianPostalLocation | null;
  deliveryToPostal?: IndianPostalLocation | null;
  /** User-entered 12-digit EBN — not GST-verified. */
  ewayBillNumber?: string | null;
  materialDescription?: string | null;
  referenceNote?: string | null;
  freightAmount?: number | null;
}

/** V1 diary shape preserved for old records. */
export interface LegacyPayload {
  category: string;
  quantity: string | null;
  issue: string | null;
  tags: string[];
  locationName: string | null;
  geo: GeoPoint | null;
}

export type BusinessEntryPayload =
  | { entryType: "letterhead_matter"; data: LetterheadMatterPayload }
  | { entryType: "work_update_issue"; data: WorkUpdateIssuePayload }
  | { entryType: "staff_matter"; data: StaffMatterPayload }
  | { entryType: "business_cash_given"; data: BusinessCashGivenPayload }
  | { entryType: "material_dispatched"; data: MaterialDispatchedPayload }
  | { entryType: "material_received"; data: MaterialReceivedPayload }
  | { entryType: "material_return"; data: MaterialReturnPayload }
  | { entryType: "payment_request"; data: PaymentRequestPayload }
  | { entryType: "outward_freight_details"; data: OutwardFreightPayload }
  | { entryType: "reminder_purchase"; data: ReminderPurchasePayload }
  | { entryType: "reminder_email"; data: ReminderEmailPayload }
  | { entryType: "reminder_gst_return"; data: ReminderGstReturnPayload }
  | { entryType: "legacy"; data: LegacyPayload };

export interface BusinessEntry {
  id: string;
  userId: string;
  ueid: UEID;
  entryType: BusinessEntryType;
  title: string;
  entryDate: number;
  createdAt: number;
  updatedAt: number;
  source: EntrySource;
  status: EntryRecordStatus;
  notes: string | null;
  reminder: EntryReminder | null;
  location: EntryLocation | null;
  attachments: AttachmentRef[];
  payload: BusinessEntryPayload["data"];
  /** Best-effort URI of the PDF generated when this entry was saved. */
  pdfUri: string | null;
  /** Immutable generation / edit audit — not user-editable. */
  documentHistory: DocumentHistory;
  deletedAt: number | null;
  /** Multi-step save progress — coordination only, no PII. */
  completedSteps?: string[];
}

/** @deprecated Use BusinessEntry — alias kept for gradual migration. */
export type DiaryEntry = BusinessEntry;
