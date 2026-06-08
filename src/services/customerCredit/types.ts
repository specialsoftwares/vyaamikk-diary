import type {
  CreditClosureMetadata,
  CreditPaymentEntry,
  CreditChargesConfig,
  CustomerCreditMode,
  CustomerCreditRecord,
  CustomerCreditStatus,
  CustomerDocumentType,
  CustomerPhotoRef,
} from "@/domain/customerCredit";

/** Input for the formal fully-paid closure flow. */
export interface CloseFullyPaidInput {
  recordId: string;
  closure: CreditClosureMetadata;
  /** Optional final ledger payment (amount/mode/date from closure). */
  appendFinalPayment?: boolean;
  /** Stable id for idempotent closure ledger write. */
  clientMutationId?: string;
}

export type AddCreditPaymentInput = Omit<CreditPaymentEntry, "id" | "createdAt"> & {
  /** Stable id for idempotent payment ledger append. */
  clientPaymentId?: string;
};

/** Fields the form supplies on create — serial/recordNumber/metadata are app-managed. */
export interface CreateCustomerCreditInput {
  /** Stable id generated before first write — used for idempotent setDoc. */
  clientRecordId?: string;
  ueid: string;
  mode: CustomerCreditMode;
  saleDate: number;

  customerName: string;
  customerMobile?: string | null;
  customerAltContact?: string | null;
  customerAddress?: string | null;
  customerLocality?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
  customerPin?: string | null;
  customerEmail?: string | null;

  customerPhoto?: CustomerPhotoRef | null;
  documentType?: CustomerDocumentType | null;
  documentReference?: string | null;

  products: CustomerCreditRecord["products"];

  saleAmount: number;
  downPayment?: number | null;
  interestCharges?: number | null;
  charges?: CreditChargesConfig | null;
  upfrontCharges?: number | null;
  totalPayable?: number | null;

  emiFrequency?: CustomerCreditRecord["emiFrequency"];
  emiCount?: number | null;
  emiAmount?: number | null;
  firstDueDate?: number | null;
  customIntervalDays?: number | null;
  schedule?: CustomerCreditRecord["schedule"];

  financerName?: string | null;
  financeRefNumber?: string | null;
  financeDownPayment?: number | null;
  financeAmount?: number | null;
  shopFollowUpRequired?: boolean;

  guarantorName?: string | null;
  remarks?: string | null;

  idAttachmentConsentAt?: number | null;
  hasIdAttachment?: boolean;

  pdfUri?: string | null;
}

/**
 * Edit input — recordNumber / serial / createdAt can NEVER change. `saleDate`
 * is preserved unless explicitly changed; only the modified date advances.
 */
export interface UpdateCustomerCreditInput {
  id: string;
  mode?: CustomerCreditMode;
  saleDate?: number;

  customerName?: string;
  customerMobile?: string | null;
  customerAltContact?: string | null;
  customerAddress?: string | null;
  customerLocality?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
  customerPin?: string | null;
  customerEmail?: string | null;

  customerPhoto?: CustomerPhotoRef | null;
  documentType?: CustomerDocumentType | null;
  documentReference?: string | null;

  products?: CustomerCreditRecord["products"];

  saleAmount?: number;
  downPayment?: number | null;
  interestCharges?: number | null;
  charges?: CreditChargesConfig | null;
  upfrontCharges?: number | null;
  totalPayable?: number | null;

  emiFrequency?: CustomerCreditRecord["emiFrequency"];
  emiCount?: number | null;
  emiAmount?: number | null;
  firstDueDate?: number | null;
  customIntervalDays?: number | null;
  schedule?: CustomerCreditRecord["schedule"];

  financerName?: string | null;
  financeRefNumber?: string | null;
  financeDownPayment?: number | null;
  financeAmount?: number | null;
  shopFollowUpRequired?: boolean;

  guarantorName?: string | null;
  remarks?: string | null;

  idAttachmentConsentAt?: number | null;
  hasIdAttachment?: boolean;

  status?: CustomerCreditStatus;
  pdfUri?: string | null;

  reminderAt?: number | null;
  reminderNotificationId?: string | null;
}

export interface ListCustomerCreditOptions {
  includeDeleted?: boolean;
  search?: string;
  limit?: number;
}

export interface CustomerCreditRepository {
  /** Allocate the next monotonic serial; never reused, even after cancel/delete. */
  allocateSerial(userId: string): Promise<number>;
  create(userId: string, input: CreateCustomerCreditInput): Promise<CustomerCreditRecord>;
  update(userId: string, input: UpdateCustomerCreditInput): Promise<CustomerCreditRecord>;
  /** Append a payment to the ledger (tracked in edit history). */
  addPayment(
    userId: string,
    recordId: string,
    payment: AddCreditPaymentInput
  ): Promise<CustomerCreditRecord>;
  /** Remove a payment (requires confirmation in UI; tracked). */
  removePayment(
    userId: string,
    recordId: string,
    paymentId: string
  ): Promise<CustomerCreditRecord>;
  /** Set a close/settlement status (e.g. cancelled, written_off). Number retained. */
  setStatus(
    userId: string,
    recordId: string,
    status: CustomerCreditStatus
  ): Promise<CustomerCreditRecord>;
  /** Close as fully paid with closure metadata + optional final ledger entry. */
  closeFullyPaid(userId: string, input: CloseFullyPaidInput): Promise<CustomerCreditRecord>;
  /**
   * Persist the local reminder fields only — does NOT bump version or append
   * edit history (reminders are device-local scheduling metadata, not edits).
   */
  setReminder(
    userId: string,
    recordId: string,
    reminder: { reminderAt: number | null; reminderNotificationId: string | null }
  ): Promise<CustomerCreditRecord>;
  /** Hard delete — UI restricts this to the most-recent record; serial not reused. */
  remove(userId: string, id: string): Promise<void>;
  getById(userId: string, id: string): Promise<CustomerCreditRecord | null>;
  list(
    userId: string,
    options?: ListCustomerCreditOptions
  ): Promise<CustomerCreditRecord[]>;
}
