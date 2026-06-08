import type { PurchaseOrder } from "@/domain/purchaseOrder";

/** Fields the form supplies on create — serial/poNumber/metadata are app-managed. */
export interface CreatePurchaseOrderInput {
  /** Stable id generated before first write — used for idempotent setDoc. */
  clientRecordId?: string;
  ueid: string;
  poDate: number;
  vendorName: string;
  vendorGstin?: string | null;
  vendorAddress?: string | null;
  vendorPin?: string | null;
  vendorState?: string | null;
  vendorContactName?: string | null;
  vendorContactPhone?: string | null;
  vendorContactEmail?: string | null;
  buyerName: string;
  buyerAddress?: string | null;
  buyerGstin?: string | null;
  buyerPin?: string | null;
  buyerState?: string | null;
  authorizedBy?: string | null;
  authorizedDesignation?: string | null;
  shipSameAsBuyer?: boolean;
  shipName?: string | null;
  shipAddress?: string | null;
  shipPin?: string | null;
  shipState?: string | null;
  shipContact?: string | null;
  deliveryLocation?: string | null;
  billingLocation?: string | null;
  expectedDeliveryDate?: number | null;
  taxApplicable?: PurchaseOrder["taxApplicable"];
  gstRate?: number | null;
  useLogo?: boolean;
  items: PurchaseOrder["items"];
  total: number;
  deliveryTerms?: string | null;
  paymentTerms?: string | null;
  freightTerms?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
  terms?: string | null;
  pdfUri?: string | null;
}

/**
 * Edit input — the PO number / serial / created date can NEVER change.
 * `poDate` is preserved on edit (original PO date stays); only the modified
 * date advances.
 */
export interface UpdatePurchaseOrderInput {
  id: string;
  vendorName?: string;
  vendorGstin?: string | null;
  vendorAddress?: string | null;
  vendorPin?: string | null;
  vendorState?: string | null;
  vendorContactName?: string | null;
  vendorContactPhone?: string | null;
  vendorContactEmail?: string | null;
  buyerName?: string;
  buyerAddress?: string | null;
  buyerGstin?: string | null;
  buyerPin?: string | null;
  buyerState?: string | null;
  authorizedBy?: string | null;
  authorizedDesignation?: string | null;
  shipSameAsBuyer?: boolean;
  shipName?: string | null;
  shipAddress?: string | null;
  shipPin?: string | null;
  shipState?: string | null;
  shipContact?: string | null;
  deliveryLocation?: string | null;
  billingLocation?: string | null;
  expectedDeliveryDate?: number | null;
  taxApplicable?: PurchaseOrder["taxApplicable"];
  gstRate?: number | null;
  useLogo?: boolean;
  items?: PurchaseOrder["items"];
  total?: number;
  deliveryTerms?: string | null;
  paymentTerms?: string | null;
  freightTerms?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
  terms?: string | null;
  pdfUri?: string | null;
}

export interface ListPurchaseOrdersOptions {
  includeDeleted?: boolean;
  search?: string;
  limit?: number;
}

export interface PurchaseOrderRepository {
  /**
   * Allocate the next monotonic serial for this user. Serial numbers are
   * never reused, even after cancel/delete.
   */
  allocateSerial(userId: string): Promise<number>;
  create(userId: string, input: CreatePurchaseOrderInput): Promise<PurchaseOrder>;
  update(userId: string, input: UpdatePurchaseOrderInput): Promise<PurchaseOrder>;
  /** Mark cancelled (number retained). Allowed for any PO. */
  cancel(userId: string, id: string): Promise<PurchaseOrder>;
  /** Hard delete — UI restricts this to the most-recent PO; serial is not reused. */
  remove(userId: string, id: string): Promise<void>;
  getById(userId: string, id: string): Promise<PurchaseOrder | null>;
  list(userId: string, options?: ListPurchaseOrdersOptions): Promise<PurchaseOrder[]>;
}
