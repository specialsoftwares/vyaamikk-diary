/**
 * Saved Records hub data loader.
 *
 * Single, capped pass over the user's existing records to produce per-category
 * counts + a latest-item preview for the Saved Records tab. Reuses the existing
 * diary / letterhead / professional-pack repositories — no new persistence.
 */

import type { BusinessEntry, BusinessEntryType } from "@/domain/businessEntry";
import type { LetterheadDocument } from "@/services/letterhead";
import type { ProfessionalServicePack } from "@/domain/professionalPack";

import { getDiaryRepository } from "@/services/diary";
import { getLetterheadDocumentRepository } from "@/services/letterhead";
import { getProfessionalPackRepository } from "@/services/professionalPack";
import { getPurchaseOrderRepository } from "@/services/purchaseOrder";
import type { PurchaseOrder } from "@/domain/purchaseOrder";
import { getCustomerCreditRepository, recordTitle } from "@/services/customerCredit";
import {
  computeCreditSummary,
  isReceivable,
  type CustomerCreditRecord,
} from "@/domain/customerCredit";
import { formDraftsRepository } from "@/repositories/formDraftsRepository";
import { dedupeDiaryEntries } from "@/services/dashboard/diaryRecordCounts";
import { dedupeProfessionalPacks } from "@/services/professionalPack/dedupe";

const HUB_ENTRY_SCAN_LIMIT = 1000;
const HUB_PACK_SCAN_LIMIT = 300;

export interface SavedRecordsTypeBucket {
  count: number;
  /** Most recent entry of this type, if any. */
  latestTitle: string | null;
  latestAt: number | null;
}

export interface SavedRecordsData {
  totalRecords: number;
  /** Per-entry-type counts + latest preview. */
  byType: Partial<Record<BusinessEntryType, SavedRecordsTypeBucket>>;
  letterheadCount: number;
  letterheadLatestTitle: string | null;
  proPackCount: number;
  proPackLatestTitle: string | null;
  purchaseOrderCount: number;
  purchaseOrderLatestTitle: string | null;
  customerCreditCount: number;
  customerCreditLatestTitle: string | null;
  /** Records with an outstanding balance the shop tracks (receivables). */
  customerCreditDueCount: number;
  draftCount: number;
  /** Records with a generated/shared PDF (entries + letterheads + packs). */
  pdfTotal: number;
  /** Entries (or packs) with a future reminder. */
  upcomingCount: number;
}

function emptyBucket(): SavedRecordsTypeBucket {
  return { count: 0, latestTitle: null, latestAt: null };
}

function entryHasPdf(entry: BusinessEntry): boolean {
  if (entry.entryType === "legacy" || entry.entryType === "letterhead_matter") return false;
  return Boolean(entry.pdfUri || entry.documentHistory?.lastGeneratedAt);
}

export async function loadSavedRecordsData(userId: string): Promise<SavedRecordsData> {
  if (!userId) {
    return {
      totalRecords: 0,
      byType: {},
      letterheadCount: 0,
      letterheadLatestTitle: null,
      proPackCount: 0,
      proPackLatestTitle: null,
      purchaseOrderCount: 0,
      purchaseOrderLatestTitle: null,
      customerCreditCount: 0,
      customerCreditLatestTitle: null,
      customerCreditDueCount: 0,
      draftCount: 0,
      pdfTotal: 0,
      upcomingCount: 0,
    };
  }

  const [entries, letterheadDocs, proPacks, purchaseOrders, creditRecords, draftCount] =
    await Promise.all([
    getDiaryRepository()
      .list(userId, { limit: HUB_ENTRY_SCAN_LIMIT })
      .catch(() => [] as BusinessEntry[]),
    getLetterheadDocumentRepository()
      .list(userId)
      .catch(() => [] as LetterheadDocument[]),
    getProfessionalPackRepository()
      .list(userId, { limit: HUB_PACK_SCAN_LIMIT })
      .then(dedupeProfessionalPacks)
      .catch(() => [] as ProfessionalServicePack[]),
    getPurchaseOrderRepository()
      .list(userId, { limit: HUB_PACK_SCAN_LIMIT })
      .catch(() => [] as PurchaseOrder[]),
    getCustomerCreditRepository()
      .list(userId, { limit: HUB_PACK_SCAN_LIMIT })
      .catch(() => [] as CustomerCreditRecord[]),
    formDraftsRepository.countActiveUserDrafts(userId).catch(() => 0),
  ]);

  const now = Date.now();
  const byType: Partial<Record<BusinessEntryType, SavedRecordsTypeBucket>> = {};
  let pdfTotal = 0;
  let upcomingCount = 0;

  for (const e of entries) {
    const bucket = (byType[e.entryType] ??= emptyBucket());
    bucket.count += 1;
    if (bucket.latestAt == null || e.entryDate > bucket.latestAt) {
      bucket.latestAt = e.entryDate;
      bucket.latestTitle = e.title;
    }
    if (entryHasPdf(e)) pdfTotal += 1;
    if (e.reminder && e.reminder.at > now) upcomingCount += 1;
  }

  const savedLetterheads = letterheadDocs.filter((d) => d.pdfUri || d.saved);
  pdfTotal += savedLetterheads.length;
  const letterheadLatest = [...savedLetterheads].sort(
    (a, b) => b.updatedAt - a.updatedAt
  )[0];

  for (const p of proPacks) {
    if (p.pdfUri) pdfTotal += 1;
    const at = p.reminder?.at ?? p.dueDate;
    if (at && at > now) upcomingCount += 1;
  }
  const proPackLatest = [...proPacks].sort((a, b) => b.updatedAt - a.updatedAt)[0];

  for (const po of purchaseOrders) {
    if (po.pdfUri) pdfTotal += 1;
  }
  const poLatest = [...purchaseOrders].sort((a, b) => b.serial - a.serial)[0];

  let customerCreditDueCount = 0;
  for (const cr of creditRecords) {
    if (cr.pdfUri) pdfTotal += 1;
    if (isReceivable(cr) && computeCreditSummary(cr, now).balance > 0) {
      customerCreditDueCount += 1;
    }
  }
  const creditLatest = [...creditRecords].sort((a, b) => b.serial - a.serial)[0];

  return {
    totalRecords: entries.length,
    byType,
    letterheadCount: savedLetterheads.length,
    letterheadLatestTitle: letterheadLatest?.title ?? null,
    proPackCount: proPacks.length,
    proPackLatestTitle: proPackLatest?.title ?? null,
    purchaseOrderCount: purchaseOrders.length,
    purchaseOrderLatestTitle: poLatest
      ? `${poLatest.poNumber} · ${poLatest.vendorName}`
      : null,
    customerCreditCount: creditRecords.length,
    customerCreditLatestTitle: creditLatest ? recordTitle(creditLatest) : null,
    customerCreditDueCount,
    draftCount,
    pdfTotal,
    upcomingCount,
  };
}
