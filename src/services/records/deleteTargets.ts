import type { AtAGlanceItem } from "@/services/dashboard/atAGlanceTypes";
import type { CalendarMapRecord } from "@/services/calendarMaps/calendarMapsTypes";
import type { YouDashboardPdfRow } from "@/services/dashboard/youDashboardSummary";
import type { GlobalSearchResult } from "@/services/search/types";
import type { UserDeleteRequest } from "./userContentDeleteTypes";

export function userDeleteFromAtAGlance(item: AtAGlanceItem): UserDeleteRequest | null {
  switch (item.target.kind) {
    case "diary_entry":
      return {
        entityType: "diary_entry",
        recordId: item.target.entryId,
        title: item.title,
        confirmTier: "record",
      };
    case "professional_pack":
      return {
        entityType: "professional_pack",
        recordId: item.target.packId,
        title: item.title,
        confirmTier: "record",
      };
    case "letterhead_document":
      return {
        entityType: "letterhead_document",
        recordId: item.target.documentId,
        title: item.title,
        confirmTier: "record",
      };
    default:
      return null;
  }
}

export function userDeleteFromCalendarRecord(
  record: CalendarMapRecord
): UserDeleteRequest | null {
  if (record.entityType === "statutory_info") return null;
  switch (record.target.kind) {
    case "diary_entry":
      return {
        entityType: "diary_entry",
        recordId: record.target.entryId,
        title: record.title,
        confirmTier: "record",
      };
    case "professional_pack":
      return {
        entityType: "professional_pack",
        recordId: record.target.packId,
        title: record.title,
        confirmTier: "record",
      };
    case "letterhead_document":
      return {
        entityType: "letterhead_document",
        recordId: record.target.documentId,
        title: record.title,
        confirmTier: "record",
      };
    default:
      return null;
  }
}

export function userDeleteFromSearchResult(
  result: GlobalSearchResult
): UserDeleteRequest | null {
  const target = result.target;
  switch (target.type) {
    case "diary_entry":
      return {
        entityType: "diary_entry",
        recordId: target.entryId,
        title: result.title,
        confirmTier: "record",
      };
    case "form_draft":
      return {
        entityType: "form_draft",
        recordId: target.draftId,
        title: result.title,
        confirmTier: "draft",
      };
    case "letterhead_document":
      return {
        entityType: "letterhead_document",
        recordId: target.documentId,
        title: result.title,
        confirmTier: "record",
      };
    case "professional_pack":
      return {
        entityType: "professional_pack",
        recordId: target.packId,
        title: result.title,
        confirmTier: "record",
      };
    case "pdf_history":
      if (target.parentType === "diary_entry") {
        return {
          entityType: "diary_entry",
          recordId: target.parentId,
          title: result.title,
          confirmTier: "record",
        };
      }
      if (target.parentType === "professional_pack") {
        return {
          entityType: "professional_pack",
          recordId: target.parentId,
          title: result.title,
          confirmTier: "record",
        };
      }
      return {
        entityType: "letterhead_document",
        recordId: target.parentId,
        title: result.title,
        confirmTier: "record",
      };
    default:
      return null;
  }
}

export function userDeleteFromPdfPreviewRow(row: YouDashboardPdfRow): UserDeleteRequest | null {
  if (row.id.startsWith("entry-")) {
    return {
      entityType: "diary_entry",
      recordId: row.id.replace("entry-", ""),
      title: row.title,
      confirmTier: "record",
    };
  }
  if (row.id.startsWith("lh-")) {
    return {
      entityType: "letterhead_document",
      recordId: row.id.replace("lh-", ""),
      title: row.title,
      confirmTier: "record",
    };
  }
  if (row.id.startsWith("pack-")) {
    return {
      entityType: "professional_pack",
      recordId: row.id.replace("pack-", ""),
      title: row.title,
      confirmTier: "record",
    };
  }
  return null;
}
