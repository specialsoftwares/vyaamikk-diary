/**
 * English VyaaFlow copy. Existing catalog keys stay aligned with
 * `calendarMaps.vyaaflow`. Pending keys below are the compact screen copy
 * the coordinator still needs to add. The screen reads `introCompact`, not
 * the legacy freight `intro` sentence.
 */
export const vyaaflowPendingLocaleKeys = {
  introCompact: "calendarMaps.vyaaflow.introCompact",
  filterAll: "calendarMaps.vyaaflow.filters.all",
  filterMyBusiness: "calendarMaps.vyaaflow.filters.myBusiness",
  filterStatutory: "calendarMaps.vyaaflow.filters.statutory",
  statutoryReferenceTitle: "calendarMaps.vyaaflow.statutoryReference.title",
} as const;

export const vyaaflowCopy = {
  screenTitle: "VyaaFlow",
  intro: "Business records, dues, follow-ups and reminders.",
  introCompact: "Business records, dues, follow-ups and reminders.",
  showDetails: "Show details",
  hideDetails: "Hide details",
  calendarSection: "Important Business Dates",
  filters: {
    all: "All",
    myBusiness: "My business",
    statutory: "Statutory",
  },
  statutoryReference: {
    title: "Statutory reference",
  },
  paragraphs: {
    businessDates:
      "Vyaamikk Diary keeps your business dates in one place. Records, dues, follow-ups and reminders appear in Important Business Dates, helping you review what happened and what is coming up.",
    statutory:
      "Statutory reminders show standard GST, income-tax, TDS/TCS and LLP due dates. Check applicability and the final date on the official portal or with your CA, CS or tax professional.",
  },
  detectMyPin: {
    action: "Detect my PIN",
    reason:
      "This uses your location once to suggest a PIN for this field. You can correct it. Coordinates are not saved.",
    continue: "Continue",
    notNow: "Not now",
    working: "Checking this device's location…",
    confirmLead: "Use this PIN for this field only?",
    approximateNote: "The location reading is approximate. Check the PIN before you use it.",
    usePin: "Use this PIN",
    typeInstead: "I'll type it",
    denied: "Location permission was not granted. You can type the PIN.",
    unavailable: "Couldn't suggest a PIN from this location. You can type it.",
    keptManual: "Kept the PIN you typed.",
  },
} as const;

export function vyaaflowCopyKeyPaths(value: unknown = vyaaflowCopy, prefix = ""): string[] {
  if (!value || typeof value !== "object") return prefix ? [prefix] : [];
  const paths: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object") paths.push(...vyaaflowCopyKeyPaths(child, next));
    else paths.push(next);
  }
  return paths;
}
