import type { BusinessEntryType } from "@/domain/businessEntry";
import type { CalendarMapCategoryKey } from "@/services/calendarMaps/calendarMapsTypes";
import type { SearchCategory } from "@/services/search/types";
import type { CategoryAccentKey } from "./categoryAccents";

/** Maps composer / diary entry types to accent tokens. */
export function accentKeyForEntryType(type: BusinessEntryType): CategoryAccentKey {
  switch (type) {
    case "payment_request":
      return "payment";
    case "business_cash_given":
      return "cash";
    case "outward_freight_details":
      return "freight";
    case "material_dispatched":
    case "material_received":
    case "material_return":
      return "material";
    case "staff_matter":
      return "staff";
    case "work_update_issue":
    case "legacy":
      return "work";
    case "reminder_purchase":
    case "reminder_email":
    case "reminder_gst_return":
      return "reminder";
    case "letterhead_matter":
      return "letterhead";
    default:
      return "work";
  }
}

/** + New record picker row keys (includes non-entry rows). */
export function accentKeyForComposerPickerKey(key: string): CategoryAccentKey {
  switch (key) {
    case "professional_pack":
      return "proPack";
    case "purchase_order":
      return "payment";
    case "customer_credit":
      return "cash";
    case "work_team":
    case "work_update_issue":
      return "work";
    case "staff_matter":
      return "staff";
    case "payment_request":
      return "payment";
    case "business_cash_given":
      return "cash";
    case "outward_freight_details":
      return "freight";
    case "material_dispatched":
    case "material_received":
    case "material_return":
    case "material_movement":
      return "material";
    case "letterhead_matter":
      return "letterhead";
    default:
      return "work";
  }
}

export function accentKeyForCalendarCategory(
  key: CalendarMapCategoryKey
): CategoryAccentKey {
  switch (key) {
    case "payments":
      return "payment";
    case "freight":
      return "freight";
    case "materials":
      return "material";
    case "staff":
      return "staff";
    case "work":
      return "work";
    case "reminders":
      return "reminder";
    case "letterhead":
      return "letterhead";
    case "proPacks":
      return "proPack";
    case "statutory":
      return "statutory";
    default:
      return "map";
  }
}

export function accentKeyForSearchCategory(category: SearchCategory): CategoryAccentKey {
  switch (category) {
    case "payment_request":
      return "payment";
    case "cash":
      return "cash";
    case "freight":
      return "freight";
    case "material_dispatch":
    case "material_receipt":
      return "material";
    case "staff":
      return "staff";
    case "work":
    case "legacy":
    case "other":
      return "work";
    case "reminder":
      return "reminder";
    case "letterhead":
      return "letterhead";
    case "professional_pack":
      return "proPack";
    case "customer_credit":
      return "cash";
    case "pdf_history":
      return "work";
    default:
      return "work";
  }
}

/** Map i18n type label keys (At-a-Glance, calendar) to accents. */
export function accentKeyFromTypeLabelKey(labelKey: string): CategoryAccentKey {
  if (labelKey.startsWith("composer.types.")) {
    const entryType = labelKey.replace("composer.types.", "") as BusinessEntryType;
    return accentKeyForEntryType(entryType);
  }
  if (labelKey.includes("proPack") || labelKey.includes("professional")) return "proPack";
  if (labelKey.includes("letterhead")) return "letterhead";
  if (labelKey.includes("statutory")) return "statutory";
  return "work";
}

export function calendarMarkerDotColors(mode: "light" | "dark"): {
  entry: string;
  followUp: string;
  pack: string;
  statutory: string;
} {
  if (mode === "dark") {
    return {
      entry: "#8B91FF",
      followUp: "#FBBF24",
      pack: "#A78BFA",
      statutory: "#F59E0B",
    };
  }
  return {
    entry: "#3B41C5",
    followUp: "#B45309",
    pack: "#4C1D95",
    statutory: "#D97706",
  };
}

/** Map GPS pin colour by entry type. */
export function mapMarkerColorForEntryType(type: BusinessEntryType): string {
  const key = accentKeyForEntryType(type);
  const table: Record<CategoryAccentKey, string> = {
    payment: "#0D6E5F",
    cash: "#047857",
    freight: "#C2410C",
    material: "#9A3412",
    staff: "#1D4ED8",
    work: "#3B41C5",
    statutory: "#1E3A5F",
    letterhead: "#6B21A8",
    proPack: "#4C1D95",
    reminder: "#B45309",
    map: "#0F766E",
  };
  return table[key];
}
