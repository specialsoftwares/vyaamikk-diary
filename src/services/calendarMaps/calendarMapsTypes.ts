import type { BusinessEntryType } from "@/domain/businessEntry";
import type { FreightDispatchMapIntel } from "./freightDispatchMapIntel";

export type CalendarMapEntityType =
  | "diary_entry"
  | "professional_pack"
  | "letterhead_document"
  | "statutory_info";

/** Device GPS attached by user vs PIN-derived postal centroid (approximate). */
export type MapFootprintSource = "gps" | "pin_approximate";

export interface CalendarMapMapPoint {
  latitude: number;
  longitude: number;
  source: MapFootprintSource;
  accuracy?: number | null;
  addressLabel?: string | null;
  capturedAt?: string;
  pinCode?: string | null;
  postalSide?: "from" | "to" | null;
}

export type CalendarMapCategoryKey =
  | "payments"
  | "freight"
  | "materials"
  | "staff"
  | "work"
  | "reminders"
  | "letterhead"
  | "proPacks"
  | "statutory";

export interface CalendarMapRecord {
  id: string;
  entityType: CalendarMapEntityType;
  title: string;
  subtitle: string | null;
  /** ISO date (yyyy-MM-dd) this row is shown under on the calendar */
  date: string;
  sortMs: number;
  categoryKey: CalendarMapCategoryKey;
  categoryLabelKey: string;
  iconName: string;
  target:
    | { kind: "diary_entry"; entryId: string }
    | { kind: "professional_pack"; packId: string }
    | { kind: "letterhead_document"; documentId: string }
    | { kind: "statutory_info"; occurrenceId: string; templateId: string };
  location: CalendarMapMapPoint | null;
  mapFootprintSource?: MapFootprintSource | null;
  manualLocationLabel: string | null;
  searchableLocationText: string | null;
  entryType?: BusinessEntryType;
  /** Freight / material dispatch facts for map and calendar location rows. */
  dispatchIntel?: FreightDispatchMapIntel | null;
}

export interface CalendarMapSection {
  categoryKey: CalendarMapCategoryKey;
  data: CalendarMapRecord[];
}

export interface CalendarMapsSourceData {
  entries: import("@/domain/businessEntry").BusinessEntry[];
  packs: import("@/domain/professionalPack").ProfessionalServicePack[];
  letterheadDocs: import("@/services/letterhead").LetterheadDocument[];
}

export interface CalendarDayViewModel {
  dateKey: string;
  sections: CalendarMapSection[];
  totalCount: number;
  isEmpty: boolean;
}

export interface CalendarMarkedDots {
  entry: boolean;
  followUp: boolean;
  pack: boolean;
  statutory: boolean;
}
