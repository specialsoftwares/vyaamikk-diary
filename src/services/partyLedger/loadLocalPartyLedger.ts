/**
 * Reads saved records already on this device and passes them to the local explorer.
 * Does not use Insights totals or the server projector.
 */

import type { BusinessEntry } from "@/domain/businessEntry";
import type { CustomerCreditRecord } from "@/domain/customerCredit";
import type { ProfessionalServicePack } from "@/domain/professionalPack";
import type { PurchaseOrder } from "@/domain/purchaseOrder";
import { formDraftsRepository } from "@/repositories/formDraftsRepository";
import { localEntriesRepository } from "@/repositories/localEntriesRepository";
import { getCustomerCreditRepository } from "@/services/customerCredit";
import { listUserDiaryEntries } from "@/services/dashboard/diaryRecordCounts";
import { mergeRemoteWithLocalUnsynced } from "@/services/diary/mergeLocalUnsynced";
import {
  getGrinApplicationRepository,
  getLiveGrinDispatchSession,
} from "@/services/grin/repository/appBinding";
import { getLetterheadDocumentRepository } from "@/services/letterhead";
import type { LetterheadDocument } from "@/services/letterhead";
import {
  exploreLocalPartyLedger,
  type LocalLedgerRecord,
  type LocalPartyLedger,
} from "@/services/partyLedger/localExplorer";
import { getProfessionalPackRepository } from "@/services/professionalPack";
import { getPurchaseOrderRepository } from "@/services/purchaseOrder";

const LIST_LIMIT = 5000;

export class PartyLedgerLoadError extends Error {
  constructor() {
    super("party_ledger_load_failed");
    this.name = "PartyLedgerLoadError";
  }
}

export async function loadLocalPartyLedger(ownerUid: string): Promise<LocalPartyLedger> {
  const records = await collectLocalLedgerRecords(ownerUid);
  return exploreLocalPartyLedger(records);
}

async function collectLocalLedgerRecords(ownerUid: string): Promise<LocalLedgerRecord[]> {
  const uid = ownerUid.trim();
  if (!uid) return [];
  const diary = await readDiary(uid);
  const records = diary.flatMap((entry) => diaryRecords(uid, entry));
  const extras = await Promise.all([
    optional(() => readPurchaseOrders(uid)),
    optional(() => readCredits(uid)),
    optional(() => readLetterheads(uid)),
    optional(() => readPacks(uid)),
    optional(() => readDrafts(uid)),
    optional(() => readGoodsReceipts(uid)),
  ]);
  for (const batch of extras) records.push(...batch);
  return records;
}

async function readDiary(ownerUid: string): Promise<BusinessEntry[]> {
  let remoteFailed = false;
  let remote: BusinessEntry[] = [];
  try {
    remote = await listUserDiaryEntries(ownerUid, { limit: LIST_LIMIT });
  } catch {
    remoteFailed = true;
  }
  try {
    const localUnsynced = await localEntriesRepository.listUnsyncedRecords(ownerUid);
    const merged = mergeRemoteWithLocalUnsynced(remote, localUnsynced);
    if (remoteFailed && merged.entries.length === 0) throw new PartyLedgerLoadError();
    return merged.entries;
  } catch (error) {
    if (error instanceof PartyLedgerLoadError) throw error;
    if (remoteFailed) throw new PartyLedgerLoadError();
    return remote;
  }
}

async function optional(read: () => Promise<LocalLedgerRecord[]>): Promise<LocalLedgerRecord[]> {
  try {
    return await read();
  } catch {
    return [];
  }
}

function diaryRecords(ownerUid: string, entry: BusinessEntry): LocalLedgerRecord[] {
  if (entry.userId && entry.userId !== ownerUid) return [];
  const payload = payloadRecord(entry.payload);
  const recordType = entry.entryType;
  return [
    {
      id: entry.id,
      ownerUid,
      recordType,
      partyName: diaryPartyName(recordType, payload),
      partyId: explicitPartyId(payload),
      amount: diaryAmount(recordType, payload),
      freightType: recordType === "outward_freight_details" ? textField(payload, "freightType") : null,
      occurredAtMs:
        recordType === "business_cash_given"
          ? positiveMs(payload.paymentDate) ?? positiveMs(entry.entryDate)
          : positiveMs(entry.entryDate),
      deleted: entry.deletedAt != null,
      sourceFamily: "diary",
    },
  ];
}

function diaryPartyName(recordType: string, payload: Record<string, unknown>): string | null {
  switch (recordType) {
    case "business_cash_given":
      return textField(payload, "givenToName");
    case "payment_request":
    case "material_dispatched":
    case "material_return":
      return textField(payload, "partyName");
    case "material_received":
      return textField(payload, "supplierName");
    case "outward_freight_details":
      return textField(payload, "partyName") ?? textField(payload, "transporterName");
    case "staff_matter":
      return textField(payload, "staffName");
    case "work_update_issue":
      return textField(payload, "responsiblePerson");
    case "reminder_purchase":
      return textField(payload, "vendor");
    case "reminder_email":
      return textField(payload, "recipientName");
    default:
      return null;
  }
}

function diaryAmount(recordType: string, payload: Record<string, unknown>): unknown {
  if (recordType === "business_cash_given") return payload.amount;
  if (recordType === "outward_freight_details") return payload.freightAmount;
  if (recordType === "payment_request") return payload.pendingAmount;
  return undefined;
}

async function readPurchaseOrders(ownerUid: string): Promise<LocalLedgerRecord[]> {
  const orders = await getPurchaseOrderRepository().list(ownerUid, { limit: LIST_LIMIT });
  return orders.flatMap((order) => purchaseOrderRecord(ownerUid, order as PurchaseOrder));
}

function purchaseOrderRecord(ownerUid: string, order: PurchaseOrder): LocalLedgerRecord[] {
  if (order.userId && order.userId !== ownerUid) return [];
  return [
    {
      id: order.id,
      ownerUid,
      recordType: "purchase_order",
      partyName: order.vendorName,
      amount: order.total,
      occurredAtMs: positiveMs(order.poDate),
      deleted: order.deletedAt != null,
      voided: order.status === "cancelled",
      sourceFamily: "purchase_order",
    },
  ];
}

async function readCredits(ownerUid: string): Promise<LocalLedgerRecord[]> {
  const credits = await getCustomerCreditRepository().list(ownerUid, { limit: LIST_LIMIT });
  return credits.flatMap((credit) => creditRecords(ownerUid, credit as CustomerCreditRecord));
}

function creditRecords(ownerUid: string, credit: CustomerCreditRecord): LocalLedgerRecord[] {
  if (credit.userId && credit.userId !== ownerUid) return [];
  const voided =
    credit.deletedAt != null || credit.status === "cancelled" || credit.status === "written_off";
  const shared = {
    ownerUid,
    partyName: credit.customerName,
    voided,
    sourceFamily: "customer_credit" as const,
    sourceRecordId: credit.id,
  };
  const rows: LocalLedgerRecord[] = [
    {
      ...shared,
      id: credit.id,
      recordType: "customer_credit_charge",
      amount: credit.saleAmount,
      occurredAtMs: positiveMs(credit.saleDate),
    },
  ];
  for (const payment of credit.payments ?? []) {
    if (!payment.id) continue;
    rows.push({
      ...shared,
      id: `${credit.id}:payment:${payment.id}`,
      recordType: "customer_credit_payment",
      amount: payment.amount,
      occurredAtMs: positiveMs(payment.paidDate),
    });
  }
  return rows;
}

async function readLetterheads(ownerUid: string): Promise<LocalLedgerRecord[]> {
  const docs = await getLetterheadDocumentRepository().list(ownerUid);
  return docs.flatMap((doc) => letterheadRecord(ownerUid, doc as LetterheadDocument));
}

function letterheadRecord(ownerUid: string, doc: LetterheadDocument): LocalLedgerRecord[] {
  if (doc.userId && doc.userId !== ownerUid) return [];
  return [
    {
      id: doc.id,
      ownerUid,
      recordType: "letterhead_document",
      partyName: doc.input?.recipientName || doc.input?.recipientCompany || null,
      occurredAtMs: positiveMs(doc.input?.date),
      draft: doc.saved !== true,
      sourceFamily: "letterhead_document",
    },
  ];
}

async function readPacks(ownerUid: string): Promise<LocalLedgerRecord[]> {
  const packs = await getProfessionalPackRepository().list(ownerUid, { limit: LIST_LIMIT });
  return packs.flatMap((pack) => packRecord(ownerUid, pack as ProfessionalServicePack));
}

function packRecord(ownerUid: string, pack: ProfessionalServicePack): LocalLedgerRecord[] {
  if (pack.userId && pack.userId !== ownerUid) return [];
  return [
    {
      id: pack.id,
      ownerUid,
      recordType: "professional_pack",
      partyName: pack.professionalName,
      occurredAtMs: positiveMs(pack.matterDate),
      deleted: pack.deletedAt != null,
      sourceFamily: "professional_pack",
    },
  ];
}

async function readDrafts(ownerUid: string): Promise<LocalLedgerRecord[]> {
  const drafts = await formDraftsRepository.listActiveUserDrafts(ownerUid, { limit: 500 });
  return drafts.map((draft) => ({
    id: draft.id,
    ownerUid,
    recordType: "draft",
    draft: true,
    occurredAtMs: positiveMs(draft.updatedAt),
    sourceFamily: "draft" as const,
  }));
}

async function readGoodsReceipts(ownerUid: string): Promise<LocalLedgerRecord[]> {
  const session = getLiveGrinDispatchSession();
  if (!session || session.ownerUid !== ownerUid) return [];
  const repo = getGrinApplicationRepository(session.ownerUid, session.dispatchGeneration);
  return repo.list().flatMap((item) => {
    if (!item.receiptId) return [];
    return [
      {
        id: item.receiptId,
        ownerUid,
        recordType: "goods_receipt",
        partyName: item.supplierName,
        occurredAtMs: epochFromText(item.reportedArrivalAt),
        draft: item.localState === "draft",
        voided:
          item.gateRefusal === "refused_at_gate" || item.gateRefusal === "received_then_rejected",
        sourceFamily: "goods_receipt" as const,
      },
    ];
  });
}

function payloadRecord(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return payload as Record<string, unknown>;
}

function textField(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function explicitPartyId(payload: Record<string, unknown>): string | null {
  return textField(payload, "partyId");
}

function positiveMs(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function epochFromText(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
