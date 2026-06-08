/**
 * App-wide search — local-first via repositories. Firebase/server FTS later.
 * Never logs queries (may contain sensitive business data).
 */

import { getDiaryRepository } from "@/services/diary";
import { formDraftsRepository } from "@/repositories/formDraftsRepository";
import { indexFormDraft } from "@/services/drafts/draftSearch";
import { getLetterheadDocumentRepository } from "@/services/letterhead";
import { getProfessionalPackRepository } from "@/services/professionalPack";
import { dedupeDiaryEntries } from "@/services/dashboard/diaryRecordCounts";
import { dedupeProfessionalPacks } from "@/services/professionalPack/dedupe";
import { getCustomerCreditRepository } from "@/services/customerCredit";

import { listMovementDistances } from "@/services/insights/movementInsightRepository";
import {
  applySnippetQuery,
  indexCustomerCredit,
  indexDiaryEntry,
  indexLetterheadDocument,
  indexProfessionalPack,
  passesFilter,
  type IndexedSearchItem,
} from "./indexDocuments";
import { indexMovementRecord } from "./indexMovementInsights";
import { indexFyRecapSnapshot, indexPartyInsight, indexPinInsight } from "./indexBusinessInsights";
import {
  listDistinctFinancialYears,
  listInsightsByKind,
} from "@/services/insights/businessInsightRepository";
import { loadFyRecapSnapshot } from "@/services/insights/fyRecapService";
import { getCurrentFinancialYear } from "@/utils/financialYear";

export type { IndexedSearchItem } from "./indexDocuments";
import { isQuerySearchable, scoreSearchMatch } from "./match";
import type { GlobalSearchFilter, GlobalSearchResult } from "./types";

const INDEX_LIMIT = 1200;

let cachedUserId: string | null = null;
let cachedItems: IndexedSearchItem[] | null = null;

export function invalidateGlobalSearchIndex(): void {
  cachedUserId = null;
  cachedItems = null;
}

export async function loadGlobalSearchIndex(
  userId: string,
  t: (k: string, vars?: Record<string, string | number>) => string
): Promise<IndexedSearchItem[]> {
  if (cachedUserId === userId && cachedItems) return cachedItems;

  const [entries, letterheadDocs, packs, creditRecords, movements, drafts] = await Promise.all([
    getDiaryRepository().list(userId, { includeDeleted: false, limit: INDEX_LIMIT }),
    getLetterheadDocumentRepository().list(userId),
    getProfessionalPackRepository().list(userId, { includeDeleted: false, limit: 500 }),
    getCustomerCreditRepository()
      .list(userId, { limit: 500 })
      .catch(() => []),
    listMovementDistances(userId, 400).catch(() => []),
    formDraftsRepository.listActiveUserDrafts(userId, { limit: 200 }),
  ]);

  const items: IndexedSearchItem[] = [];
  const canonicalEntries = dedupeDiaryEntries(entries);
  const canonicalPacks = dedupeProfessionalPacks(packs);
  for (const entry of canonicalEntries) {
    items.push(...indexDiaryEntry(entry, t));
  }
  for (const doc of letterheadDocs) {
    items.push(indexLetterheadDocument(doc));
  }
  for (const pack of canonicalPacks) {
    items.push(...indexProfessionalPack(pack));
  }
  for (const record of creditRecords) {
    items.push(indexCustomerCredit(record));
  }
  for (const movement of movements) {
    items.push(indexMovementRecord(movement, t));
  }
  for (const draft of drafts) {
    if (draft.source === "user" && draft.status === "active") {
      items.push(indexFormDraft(draft, t));
    }
  }

  const currentFy = getCurrentFinancialYear();
  const partyRows = listInsightsByKind(userId, "party", currentFy, 120);
  const pinRows = listInsightsByKind(userId, "pin", currentFy, 120);
  for (const row of partyRows) items.push(indexPartyInsight(row));
  for (const row of pinRows) items.push(indexPinInsight(row));

  const closedFys = listDistinctFinancialYears(userId).filter(
    (y) => y < getCurrentFinancialYear()
  );
  for (const fy of closedFys) {
    const recap = await loadFyRecapSnapshot(userId, fy);
    if (recap) items.push(indexFyRecapSnapshot(recap));
  }

  cachedUserId = userId;
  cachedItems = items;
  return items;
}

export function queryGlobalSearch(
  index: IndexedSearchItem[],
  query: string,
  filter: GlobalSearchFilter
): GlobalSearchResult[] {
  const trimmed = query.trim();
  if (!isQuerySearchable(trimmed)) return [];

  const map = new Map<string, GlobalSearchResult>();

  for (const item of index) {
    if (!passesFilter(filter, item.result.filterBucket)) continue;
    const score = scoreSearchMatch(item.searchableText, trimmed);
    if (score <= 0) continue;
    const id = item.result.id;
    const prev = map.get(id);
    if (!prev || prev.score < score) {
      map.set(id, { ...item.result, score });
    }
  }

  const scored = [...map.values()].sort(
    (a, b) => b.score - a.score || b.dateMs - a.dateMs
  );
  return applySnippetQuery(scored, trimmed);
}

export function getRecentRecordsFromIndex(
  index: IndexedSearchItem[],
  limit = 10
): GlobalSearchResult[] {
  const byId = new Map<string, GlobalSearchResult>();
  for (const item of index) {
    if (item.result.kind === "pdf_history") continue;
    const existing = byId.get(item.result.id);
    if (!existing || item.result.dateMs > existing.dateMs) {
      byId.set(item.result.id, item.result);
    }
  }
  return [...byId.values()].sort((a, b) => b.dateMs - a.dateMs).slice(0, limit);
}

/**
 * Future: hook after create/update/delete to patch index or rebuild FTS row.
 * V1 relies on invalidateGlobalSearchIndex() + reload on search screen focus.
 */
export function notifySearchIndexChanged(): void {
  invalidateGlobalSearchIndex();
}
