import type { BusinessEntry, BusinessEntryType } from "@/domain/businessEntry";
import type { ProfessionalServicePack } from "@/domain/professionalPack";
import type { CustomerCreditRecord } from "@/domain/customerCredit";
import { computeCreditSummary } from "@/domain/customerCredit";
import type { LetterheadDocument } from "@/services/letterhead";
import { recordTitle } from "@/services/customerCredit";
import { entryListSummary } from "@/utils/businessEntry/display";

import {
  buildCustomerCreditSearchableText,
  buildEntrySearchableText,
  buildLetterheadSearchableText,
  buildProfessionalPackSearchableText,
} from "./buildSearchableText";
import { buildMatchedSnippet } from "./snippet";
import type {
  GlobalSearchFilter,
  GlobalSearchResult,
  SearchCategory,
  SearchResultKind,
} from "./types";
import { ENTRY_TYPE_FILTER } from "./types";

export interface IndexedSearchItem {
  result: GlobalSearchResult;
  searchableText: string;
}

function entryCategory(type: BusinessEntryType): SearchCategory {
  switch (type) {
    case "payment_request":
      return "payment_request";
    case "outward_freight_details":
      return "freight";
    case "business_cash_given":
      return "cash";
    case "staff_matter":
      return "staff";
    case "work_update_issue":
      return "work";
    case "material_dispatched":
      return "material_dispatch";
    case "material_received":
      return "material_receipt";
    case "material_return":
      return "material_dispatch";
    case "reminder_purchase":
    case "reminder_email":
    case "reminder_gst_return":
      return "reminder";
    case "letterhead_matter":
      return "letterhead";
    case "legacy":
      return "legacy";
    default:
      return "other";
  }
}

export function categoryLabelKey(category: SearchCategory): string {
  return `globalSearch.categories.${category}`;
}

export function iconForCategory(category: SearchCategory): string {
  switch (category) {
    case "payment_request":
      return "cash-multiple";
    case "freight":
      return "truck-outline";
    case "cash":
      return "wallet-outline";
    case "staff":
      return "account-tie-outline";
    case "work":
      return "clipboard-text-outline";
    case "material_dispatch":
      return "package-variant";
    case "material_receipt":
      return "package-down";
    case "reminder":
      return "bell-outline";
    case "letterhead":
      return "file-document-outline";
    case "professional_pack":
      return "briefcase-outline";
    case "customer_credit":
      return "account-cash-outline";
    case "route_insight":
      return "map-marker-path";
    case "party_insight":
      return "account-group-outline";
    case "pin_insight":
      return "map-marker-outline";
    case "fy_recap":
      return "file-chart-outline";
    case "pdf_history":
      return "file-pdf-box";
    case "legacy":
      return "book-outline";
    default:
      return "file-outline";
  }
}

function filterForEntry(type: BusinessEntryType): GlobalSearchFilter {
  return ENTRY_TYPE_FILTER[type] ?? "records";
}

export function passesFilter(filter: GlobalSearchFilter, bucket: GlobalSearchFilter): boolean {
  if (filter === "all") return true;
  return bucket === filter;
}

export function indexDiaryEntry(
  entry: BusinessEntry,
  t: (k: string, vars?: Record<string, string | number>) => string
): IndexedSearchItem[] {
  if (entry.deletedAt) return [];

  const category = entryCategory(entry.entryType);
  const searchableText = buildEntrySearchableText(entry);
  const snippetRaw = entryListSummary(entry, t) || entry.notes || entry.title;
  const filterBucket = filterForEntry(entry.entryType);

  const main: GlobalSearchResult = {
    id: `entry-${entry.id}`,
    kind: "diary_entry",
    category,
    categoryLabelKey: categoryLabelKey(category),
    title: entry.title,
    snippet: snippetRaw,
    dateMs: entry.entryDate,
    iconName: iconForCategory(category),
    target: { type: "diary_entry", entryId: entry.id },
    filterBucket,
    searchableText,
    score: 0,
  };

  const items: IndexedSearchItem[] = [{ result: main, searchableText }];

  const dh = entry.documentHistory;
  if (dh?.pdfGenerationHistory?.length) {
    for (const gen of dh.pdfGenerationHistory) {
      const pdfSearch = `${searchableText} pdf v${gen.versionNumber}`;
      items.push({
        searchableText: pdfSearch,
        result: {
          id: `pdf-entry-${entry.id}-${gen.versionNumber}`,
          kind: "pdf_history",
          category: "pdf_history",
          categoryLabelKey: categoryLabelKey("pdf_history"),
          title: entry.title,
          snippet: `PDF v${gen.versionNumber}`,
          dateMs: gen.generatedAt,
          iconName: iconForCategory("pdf_history"),
          target: {
            type: "pdf_history",
            parentType: "diary_entry",
            parentId: entry.id,
          },
          filterBucket: "pdfs",
          searchableText: pdfSearch,
          score: 0,
        },
      });
    }
  }

  return items;
}

export function indexLetterheadDocument(doc: LetterheadDocument): IndexedSearchItem {
  const searchableText = buildLetterheadSearchableText(doc);
  const snippet =
    doc.input.subject?.trim() || doc.input.body.trim().slice(0, 80) || doc.title;
  return {
    searchableText,
    result: {
      id: `lh-${doc.id}`,
      kind: "letterhead_document",
      category: "letterhead",
      categoryLabelKey: categoryLabelKey("letterhead"),
      title: doc.title,
      snippet,
      dateMs: doc.input.date,
      iconName: iconForCategory("letterhead"),
      target: { type: "letterhead_document", documentId: doc.id },
      filterBucket: "letterhead",
      searchableText,
      score: 0,
    },
  };
}

export function indexProfessionalPack(pack: ProfessionalServicePack): IndexedSearchItem[] {
  if (pack.deletedAt) return [];
  const searchableText = buildProfessionalPackSearchableText(pack);
  const summary = String(pack.facts.matterSummary ?? pack.notes ?? "").slice(0, 96);
  const main: GlobalSearchResult = {
    id: `pack-${pack.id}`,
    kind: "professional_pack",
    category: "professional_pack",
    categoryLabelKey: categoryLabelKey("professional_pack"),
    title: pack.title,
    snippet: summary,
    dateMs: pack.matterDate,
    iconName: iconForCategory("professional_pack"),
    target: { type: "professional_pack", packId: pack.id },
    filterBucket: "records",
    searchableText,
    score: 0,
  };
  return [{ result: main, searchableText }];
}

export function indexCustomerCredit(record: CustomerCreditRecord): IndexedSearchItem {
  const searchableText = buildCustomerCreditSearchableText(record);
  const summary = computeCreditSummary(record);
  const product = record.products[0]?.productName?.trim();
  const snippet = product
    ? `${product} · ${record.recordNumber}`
    : record.recordNumber;
  return {
    searchableText,
    result: {
      id: `credit-${record.id}`,
      kind: "customer_credit",
      category: "customer_credit",
      categoryLabelKey: categoryLabelKey("customer_credit"),
      title: recordTitle(record),
      snippet,
      dateMs: summary.nextDueDate ?? record.saleDate,
      iconName: iconForCategory("customer_credit"),
      target: { type: "customer_credit", recordId: record.id },
      filterBucket: "records",
      searchableText,
      score: 0,
    },
  };
}

export function applySnippetQuery(
  items: GlobalSearchResult[],
  query: string
): GlobalSearchResult[] {
  return items.map((r) => ({
    ...r,
    snippet: buildMatchedSnippet(r.snippet, query) || r.snippet,
  }));
}
