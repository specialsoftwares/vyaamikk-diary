import type { BusinessEntry } from "@/domain/businessEntry";
import type { PurchaseOrder } from "@/domain/purchaseOrder";
import type { CustomerCreditRecord } from "@/domain/customerCredit";
import { getDiaryRepository } from "@/services/diary";
import { getPurchaseOrderRepository } from "@/services/purchaseOrder";
import { getCustomerCreditRepository } from "@/services/customerCredit";
import { createLogger } from "@/utils/logger";
import { getFinancialYearForDate } from "@/utils/financialYear";

import {
  normalizePartyKey,
  normalizePinKey,
  purgeBusinessInsightsForUser,
  removeInsightLinksForSource,
  upsertInsightLink,
} from "./businessInsightRepository";
import {
  extractCashPaidFromEntry,
  extractPartiesFromEntry,
  extractPartiesFromPurchaseOrder,
  extractPinsFromEntry,
  extractPinsFromPurchaseOrder,
  entryRecordDate,
  fyForEntry,
  fyForMs,
} from "./insightExtractors";
import { invalidateMasterInsightsCache } from "./masterInsightsSummary";
import { removeMovementsForLinkedRecord } from "./movementInsightRepository";
import { recordMovementFromBusinessEntry } from "./recordMovementFromEntry";

const log = createLogger("insights/sync");

let rebuildRunning: string | null = null;

/** Best-effort incremental sync after a diary entry is saved. */
export async function syncInsightsFromBusinessEntry(
  userId: string,
  ueid: string,
  entry: BusinessEntry
): Promise<void> {
  if (entry.deletedAt) {
    await removeInsightLinksForSource(userId, "diary_entry", entry.id);
    invalidateMasterInsightsCache();
    return;
  }
  const fy = fyForEntry(entry);
  const dateMs = entryRecordDate(entry);
  const sourceId = entry.id;

  for (const party of extractPartiesFromEntry(entry)) {
    const key = normalizePartyKey(party.partyName);
    await upsertInsightLink({
      userId,
      ueid,
      kind: "party",
      normalizedKey: key,
      financialYear: fy,
      displayLabel: party.partyName,
      metadata: {
        partyName: party.partyName,
        pin: party.pin,
        locality: party.locality,
        state: party.state,
        sources: [party.source],
      },
      sourceRecordType: "diary_entry",
      sourceRecordId: sourceId,
      recordDateMs: dateMs,
    });
  }

  for (const pin of extractPinsFromEntry(entry)) {
    const key = normalizePinKey(pin.pin);
    await upsertInsightLink({
      userId,
      ueid,
      kind: "pin",
      normalizedKey: key,
      financialYear: fy,
      displayLabel: pin.pin,
      metadata: {
        pin: pin.pin,
        locality: pin.locality,
        district: pin.district,
        state: pin.state,
        resolved: pin.resolved,
        parties: pin.partyName ? [pin.partyName] : [],
      },
      sourceRecordType: "diary_entry",
      sourceRecordId: sourceId,
      recordDateMs: dateMs,
    });
  }

  const cash = extractCashPaidFromEntry(entry);
  if (cash) {
    const key = `cash_${sourceId}`;
    await upsertInsightLink({
      userId,
      ueid,
      kind: "cash_paid",
      normalizedKey: key,
      financialYear: fy,
      displayLabel: cash.givenToName || "Cash paid",
      metadata: { amount: cash.amount, givenToName: cash.givenToName },
      sourceRecordType: "diary_entry",
      sourceRecordId: sourceId,
      recordDateMs: cash.recordDateMs,
    });
  }

  void recordMovementFromBusinessEntry(userId, entry, dateMs, fy).catch(() => undefined);
  invalidateMasterInsightsCache();
}

export async function syncInsightsFromPurchaseOrder(
  userId: string,
  ueid: string,
  po: PurchaseOrder
): Promise<void> {
  if (po.deletedAt) {
    await removeInsightLinksForSource(userId, "purchase_order", po.id);
    invalidateMasterInsightsCache();
    return;
  }
  const fy = fyForMs(po.poDate);
  const dateMs = po.poDate;

  for (const party of extractPartiesFromPurchaseOrder(po)) {
    await upsertInsightLink({
      userId,
      ueid,
      kind: "party",
      normalizedKey: normalizePartyKey(party.partyName),
      financialYear: fy,
      displayLabel: party.partyName,
      metadata: {
        partyName: party.partyName,
        pin: party.pin,
        locality: party.locality,
        state: party.state,
        sources: [party.source],
      },
      sourceRecordType: "purchase_order",
      sourceRecordId: po.id,
      recordDateMs: dateMs,
    });
  }

  for (const pin of extractPinsFromPurchaseOrder(po)) {
    await upsertInsightLink({
      userId,
      ueid,
      kind: "pin",
      normalizedKey: normalizePinKey(pin.pin),
      financialYear: fy,
      displayLabel: pin.pin,
      metadata: {
        pin: pin.pin,
        locality: pin.locality,
        district: pin.district,
        state: pin.state,
        resolved: pin.resolved,
        parties: pin.partyName ? [pin.partyName] : [],
      },
      sourceRecordType: "purchase_order",
      sourceRecordId: po.id,
      recordDateMs: dateMs,
    });
  }
  invalidateMasterInsightsCache();
}

/** Shop Credit customers stay in the CC list — never merged into party/PIN insights. */
export async function syncInsightsFromCustomerCredit(
  userId: string,
  _ueid: string,
  rec: CustomerCreditRecord
): Promise<void> {
  if (rec.deletedAt) {
    await removeInsightLinksForSource(userId, "customer_credit", rec.id);
    invalidateMasterInsightsCache();
  }
}

export async function removeInsightsForDiaryEntry(
  userId: string,
  entryId: string
): Promise<void> {
  await removeInsightLinksForSource(userId, "diary_entry", entryId);
  await removeMovementsForLinkedRecord(userId, entryId).catch(() => undefined);
  invalidateMasterInsightsCache();
}

export async function removeInsightsForPurchaseOrder(
  userId: string,
  poId: string
): Promise<void> {
  await removeInsightLinksForSource(userId, "purchase_order", poId);
  invalidateMasterInsightsCache();
}

export async function removeInsightsForCustomerCredit(
  userId: string,
  recordId: string
): Promise<void> {
  await removeInsightLinksForSource(userId, "customer_credit", recordId);
  invalidateMasterInsightsCache();
}

/** Full rebuild from repositories — run in background, not on first paint. */
export async function rebuildInsightsForUser(userId: string, ueid: string): Promise<void> {
  if (rebuildRunning === userId) return;
  rebuildRunning = userId;
  try {
    purgeBusinessInsightsForUser(userId);
    const [entries, pos, credits] = await Promise.all([
      getDiaryRepository().list(userId, { includeDeleted: false, limit: 5000 }),
      getPurchaseOrderRepository().list(userId, { limit: 2000 }).catch(() => []),
      getCustomerCreditRepository().list(userId, { limit: 2000 }).catch(() => []),
    ]);
    for (const entry of entries) {
      await syncInsightsFromBusinessEntry(userId, ueid, entry);
    }
    for (const po of pos) {
      if (!po.deletedAt) await syncInsightsFromPurchaseOrder(userId, ueid, po);
    }
    for (const rec of credits) {
      if (!rec.deletedAt) await syncInsightsFromCustomerCredit(userId, ueid, rec);
    }
    log.info("rebuild complete", { userId });
  } catch (e) {
    log.warn("rebuild failed", e);
  } finally {
    rebuildRunning = null;
    invalidateMasterInsightsCache();
  }
}

export function scheduleInsightRebuild(userId: string, ueid: string): void {
  setTimeout(() => {
    void rebuildInsightsForUser(userId, ueid);
  }, 1200);
}
