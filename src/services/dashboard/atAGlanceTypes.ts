export type AtAGlanceViewKind = "today" | "this_week" | "upcoming";

export type AtAGlanceUrgency = "overdue" | "today" | "tomorrow" | "this_week" | "later";

export type AtAGlanceItemTarget =
  | { kind: "diary_entry"; entryId: string }
  | { kind: "professional_pack"; packId: string }
  | { kind: "letterhead_document"; documentId: string }
  | { kind: "customer_credit"; recordId: string };

export interface AtAGlanceItem {
  id: string;
  target: AtAGlanceItemTarget;
  /** i18n path */
  typeLabelKey: string;
  title: string;
  snippet: string;
  /** Primary sort/display timestamp */
  dateMs: number;
  /** Optional secondary line (e.g. week day label) */
  dateCaptionKey?: string;
  dateCaptionVars?: Record<string, string | number>;
  iconName: string;
  urgency?: AtAGlanceUrgency;
  /** i18n chip label when useful */
  statusChipKey?: string;
}

export interface AtAGlanceSection {
  /** i18n: atAGlance.sections.{view}.{sectionKey} */
  sectionKey: string;
  data: AtAGlanceItem[];
  /** Items in section before preview cap (for “View all (N)”). */
  totalCount: number;
}

export interface AtAGlanceViewModel {
  view: AtAGlanceViewKind;
  sections: AtAGlanceSection[];
  totalItems: number;
  isEmpty: boolean;
}

export interface AtAGlanceSourceData {
  entries: import("@/domain/businessEntry").BusinessEntry[];
  letterheadDocs: import("@/services/letterhead").LetterheadDocument[];
  packs: import("@/domain/professionalPack").ProfessionalServicePack[];
  creditRecords: import("@/domain/customerCredit").CustomerCreditRecord[];
}
