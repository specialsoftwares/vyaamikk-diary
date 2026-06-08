import type { BusinessEntryType } from "@/domain/businessEntry";

export type GlobalSearchFilter =
  | "all"
  | "records"
  | "payments"
  | "freight"
  | "materials"
  | "staff"
  | "reminders"
  | "letterhead"
  | "pdfs";

export type SearchResultKind =
  | "diary_entry"
  | "letterhead_document"
  | "professional_pack"
  | "customer_credit"
  | "pdf_history"
  | "form_draft"
  | "business_insight";

export type SearchCategory =
  | "payment_request"
  | "freight"
  | "cash"
  | "staff"
  | "work"
  | "material_dispatch"
  | "material_receipt"
  | "reminder"
  | "letterhead"
  | "professional_pack"
  | "customer_credit"
  | "pdf_history"
  | "legacy"
  | "route_insight"
  | "party_insight"
  | "pin_insight"
  | "fy_recap"
  | "other";

export interface GlobalSearchResult {
  id: string;
  kind: SearchResultKind;
  category: SearchCategory;
  /** i18n key under globalSearch.categories.* */
  categoryLabelKey: string;
  title: string;
  snippet: string;
  dateMs: number;
  iconName: string;
  /** For routing */
  target:
    | { type: "diary_entry"; entryId: string }
    | { type: "letterhead_document"; documentId: string }
    | { type: "professional_pack"; packId: string }
    | { type: "customer_credit"; recordId: string }
    | { type: "pdf_history"; parentType: "diary_entry" | "professional_pack" | "letterhead_document"; parentId: string }
    | { type: "form_draft"; draftId: string }
    | {
        type: "business_insight";
        screen: "parties" | "pins" | "customers" | "movement" | "cash-paid" | "recap";
        fy?: number;
      };
  filterBucket: GlobalSearchFilter;
  searchableText: string;
  score: number;
}

export interface SearchDocumentIndex {
  userId: string;
  builtAt: number;
  documents: GlobalSearchResult[];
}

export const ENTRY_TYPE_FILTER: Partial<Record<BusinessEntryType, GlobalSearchFilter>> = {
  work_update_issue: "records",
  legacy: "records",
  staff_matter: "staff",
  business_cash_given: "records",
  material_dispatched: "materials",
  material_received: "materials",
  material_return: "materials",
  payment_request: "payments",
  outward_freight_details: "freight",
  reminder_purchase: "reminders",
  reminder_email: "reminders",
  reminder_gst_return: "reminders",
  letterhead_matter: "letterhead",
};
