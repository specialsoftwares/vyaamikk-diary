/**
 * User-scoped business intelligence rows — never shared across users.
 */

export type BusinessInsightKind =
  | "party"
  | "pin"
  | "cash_paid"
  | "movement"
  | "record_count";

export type InsightSourceRecordType =
  | "diary_entry"
  | "purchase_order"
  | "customer_credit"
  | "letterhead_document"
  | "professional_pack";

export interface PartyInsightMeta {
  partyName: string;
  pin: string | null;
  locality: string | null;
  state: string | null;
  sources: string[];
}

export interface PinInsightMeta {
  pin: string;
  locality: string | null;
  district: string | null;
  state: string | null;
  resolved: boolean;
  parties: string[];
}

export interface CashPaidInsightMeta {
  totalAmount: number;
  entryCount: number;
  monthAmount?: number;
}

export interface BusinessInsightRow {
  id: string;
  userId: string;
  ueid: string;
  kind: BusinessInsightKind;
  financialYear: number;
  normalizedKey: string;
  displayLabel: string;
  metadata: PartyInsightMeta | PinInsightMeta | CashPaidInsightMeta | Record<string, unknown>;
  recordCount: number;
  lastUsedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface BusinessInsightLink {
  id: string;
  userId: string;
  insightKind: BusinessInsightKind;
  normalizedKey: string;
  financialYear: number;
  sourceRecordType: InsightSourceRecordType;
  sourceRecordId: string;
  recordDateMs: number;
  metadataJson: string | null;
}

export type FyRecapStatus = "idle" | "preparing" | "ready" | "stale";

export interface FyRecapSnapshot {
  fyStartYear: number;
  status: FyRecapStatus;
  preparedAt: number | null;
  recordsCreated: number;
  pdfsGenerated: number;
  totalCashPaid: number;
  approxDistanceKm: number;
  topParties: Array<{ name: string; count: number }>;
  topPins: Array<{ pin: string; label: string; count: number }>;
  topRoutes: Array<{ route: string; count: number; km: number | null }>;
  creditActive: number;
  creditClosed: number;
  creditPendingBalance: number;
  purchaseOrders: number;
  letterheads: number;
  mostActiveMonth: string | null;
  mostUsedRecordType: string | null;
}

export interface CustomerInsightRow {
  id: string;
  customerName: string;
  mobileMasked: string;
  mobileLast4: string;
  status: string;
  mode: string;
  pendingBalance: number;
  lastActivityAt: number;
  saleDate: number;
}
