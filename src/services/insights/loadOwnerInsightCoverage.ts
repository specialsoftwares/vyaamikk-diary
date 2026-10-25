/**
 * Loads one account's saved records and builds explainable insights.
 * Runs when Business Insights opens, when that screen is revisited, and when sync state changes.
 * Not used at startup or on save.
 * Failures omit that source instead of pretending the total is zero.
 */

import { isGoodsEvidenceBlockedByStoreRuntime } from "@/goodsEvidence/featureFlag";
import { formDraftsRepository } from "@/repositories/formDraftsRepository";
import { localEntriesRepository } from "@/repositories/localEntriesRepository";
import type { BusinessEntry } from "@/domain/businessEntry";
import type { CustomerCreditRecord } from "@/domain/customerCredit";
import type { ProfessionalServicePack } from "@/domain/professionalPack";
import type { PurchaseOrder } from "@/domain/purchaseOrder";
import { listUserDiaryEntries } from "@/services/dashboard/diaryRecordCounts";
import { mergeRemoteWithLocalUnsynced } from "@/services/diary/mergeLocalUnsynced";
import { getCustomerCreditRepository } from "@/services/customerCredit";
import { getLetterheadDocumentRepository } from "@/services/letterhead";
import { getProfessionalPackRepository } from "@/services/professionalPack";
import { getPurchaseOrderRepository } from "@/services/purchaseOrder";
import type { LetterheadDocument } from "@/services/letterhead";

import { grinSessionMatchesAccount } from "./insightAccountGuard";
import {
  INSIGHT_DIARY_SCAN_CAP,
  INSIGHT_DRAFT_SCAN_CAP,
  INSIGHT_GRIN_DETAIL_CAP,
  INSIGHT_LIST_SCAN_CAP,
  buildOwnerInsightCoverage,
  readyInsightReads,
  toCreditCoverageFact,
  toDiaryCoverageFact,
  toDraftCoverageFact,
  toGrinCoverageFact,
  toLetterheadCoverageFact,
  toProfessionalPackCoverageFact,
  toPurchaseOrderCoverageFact,
  type GrinCoverageFact,
  type InsightReadState,
  type OwnerInsightCoverage,
} from "./insightCoverage";

export async function loadOwnerInsightCoverage(
  userId: string,
  fy: number,
  now = Date.now(),
  options?: { offline?: boolean }
): Promise<OwnerInsightCoverage> {
  const reads = readyInsightReads();
  const [diary, purchaseOrders, credits, letterheads, packs, drafts, grin] = await Promise.all([
    readDiary(userId),
    readPurchaseOrders(userId),
    readCredits(userId),
    readLetterheads(userId),
    readPacks(userId),
    readDrafts(userId),
    readGrin(userId),
  ]);

  reads.diary = diary.availability;
  reads.diaryHitCap = diary.hitCap;
  reads.purchaseOrders = purchaseOrders.availability;
  reads.purchaseOrdersHitCap = purchaseOrders.hitCap;
  reads.credits = credits.availability;
  reads.creditsHitCap = credits.hitCap;
  reads.letterheads = letterheads.availability;
  reads.packs = packs.availability;
  reads.packsHitCap = packs.hitCap;
  reads.drafts = drafts.availability;
  reads.draftsHitCap = drafts.hitCap;
  reads.grin = grin.availability;
  reads.grinDetailHitCap = grin.hitCap;

  return buildOwnerInsightCoverage({
    fy,
    now,
    reads,
    diary: diary.rows,
    purchaseOrders: purchaseOrders.rows,
    credits: credits.rows,
    letterheads: letterheads.rows,
    packs: packs.rows,
    drafts: drafts.rows,
    grin: grin.rows,
    pendingDiaryCount: diary.pendingDiaryCount,
    offline: options?.offline === true,
    diaryServerUnread: diary.serverUnread,
  });
}

function unavailable<T>(): { rows: T[]; availability: InsightReadState["diary"]; hitCap: boolean } {
  return { rows: [], availability: "unavailable", hitCap: false };
}

async function readDiary(userId: string) {
  let remote: BusinessEntry[] = [];
  let remoteFailed = false;
  try {
    remote = await listUserDiaryEntries(userId, { limit: INSIGHT_DIARY_SCAN_CAP });
  } catch {
    remoteFailed = true;
  }

  let entries = remote;
  let pendingDiaryCount = 0;
  try {
    const localUnsynced = await localEntriesRepository.listUnsyncedRecords(userId);
    const merged = mergeRemoteWithLocalUnsynced(remote, localUnsynced);
    entries = merged.entries;
    pendingDiaryCount = Object.values(merged.badgeById).filter((badge) => badge !== "synced").length;
  } catch {
    entries = remote;
    pendingDiaryCount = 0;
  }

  if (remoteFailed && entries.length === 0) {
    return { ...unavailable<ReturnType<typeof toDiaryCoverageFact>>(), pendingDiaryCount: 0, serverUnread: false };
  }

  return {
    rows: entries.map((entry) => toDiaryCoverageFact(entry)),
    availability: "ready" as const,
    hitCap: remote.length >= INSIGHT_DIARY_SCAN_CAP,
    pendingDiaryCount,
    serverUnread: remoteFailed,
  };
}

async function readPurchaseOrders(userId: string) {
  try {
    const orders = await getPurchaseOrderRepository().list(userId, { limit: INSIGHT_LIST_SCAN_CAP });
    return {
      rows: orders.map((order) => toPurchaseOrderCoverageFact(order as PurchaseOrder)),
      availability: "ready" as const,
      hitCap: orders.length >= INSIGHT_LIST_SCAN_CAP,
    };
  } catch {
    return unavailable<ReturnType<typeof toPurchaseOrderCoverageFact>>();
  }
}

async function readCredits(userId: string) {
  try {
    const records = await getCustomerCreditRepository().list(userId, { limit: INSIGHT_LIST_SCAN_CAP });
    return {
      rows: records.map((record) => toCreditCoverageFact(record as CustomerCreditRecord)),
      availability: "ready" as const,
      hitCap: records.length >= INSIGHT_LIST_SCAN_CAP,
    };
  } catch {
    return unavailable<ReturnType<typeof toCreditCoverageFact>>();
  }
}

async function readLetterheads(userId: string) {
  try {
    const docs = await getLetterheadDocumentRepository().list(userId);
    return {
      rows: docs.map((doc) => toLetterheadCoverageFact(doc as LetterheadDocument)),
      availability: "ready" as const,
      hitCap: false,
    };
  } catch {
    return unavailable<ReturnType<typeof toLetterheadCoverageFact>>();
  }
}

async function readPacks(userId: string) {
  try {
    const packs = await getProfessionalPackRepository().list(userId, { limit: INSIGHT_LIST_SCAN_CAP });
    return {
      rows: packs.map((pack) => toProfessionalPackCoverageFact(pack as ProfessionalServicePack)),
      availability: "ready" as const,
      hitCap: packs.length >= INSIGHT_LIST_SCAN_CAP,
    };
  } catch {
    return unavailable<ReturnType<typeof toProfessionalPackCoverageFact>>();
  }
}

async function readDrafts(userId: string) {
  try {
    const drafts = await formDraftsRepository.listActiveUserDrafts(userId, {
      limit: INSIGHT_DRAFT_SCAN_CAP,
    });
    return {
      rows: drafts.map((draft) => toDraftCoverageFact({ id: draft.id })),
      availability: "ready" as const,
      hitCap: drafts.length >= INSIGHT_DRAFT_SCAN_CAP,
    };
  } catch {
    return unavailable<ReturnType<typeof toDraftCoverageFact>>();
  }
}

async function readGrin(userId: string): Promise<{
  rows: GrinCoverageFact[];
  availability: InsightReadState["grin"];
  hitCap: boolean;
}> {
  try {
    if (isGoodsEvidenceBlockedByStoreRuntime()) return unavailable();
    const binding = await import("@/services/grin/repository/appBinding");
    const session = binding.getLiveGrinDispatchSession();
    if (!session || !grinSessionMatchesAccount(session.ownerUid, userId)) {
      return unavailable();
    }
    const repo = binding.getGrinApplicationRepository(session.ownerUid, session.dispatchGeneration);
    const list = repo.list();
    const rows: GrinCoverageFact[] = [];
    let detailed = 0;
    let hitCap = false;
    for (const item of list) {
      const canDetail =
        item.projection === "readable" &&
        (item.localState === "issued" || item.localState === "attachment_pending");
      if (!canDetail) {
        rows.push(
          toGrinCoverageFact({
            receiptId: item.receiptId,
            localState: item.localState,
            projection: item.projection,
            confirmed: null,
          })
        );
        continue;
      }
      if (detailed >= INSIGHT_GRIN_DETAIL_CAP) {
        hitCap = true;
        rows.push(
          toGrinCoverageFact({
            receiptId: item.receiptId,
            localState: item.localState,
            projection: "readable",
            detailSkipped: true,
            confirmed: null,
          })
        );
        continue;
      }
      detailed += 1;
      const confirmed = repo.confirmedProjection(item.receiptId);
      rows.push(
        toGrinCoverageFact({
          receiptId: item.receiptId,
          localState: item.localState,
          projection: "readable",
          confirmed: confirmed
            ? {
                eventVersion: confirmed.eventVersion,
                effective: confirmed.effective,
                events: confirmed.events,
              }
            : null,
        })
      );
    }
    return { rows, availability: "ready", hitCap };
  } catch {
    return unavailable();
  }
}
