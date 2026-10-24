import type { CalendarMapRecord, CalendarMapSection } from "@/services/calendarMaps";

export type VyaaflowAgendaFilter = "all" | "business" | "statutory";

/**
 * Legacy `?mode=map` stays on the calendar. VyaaFlow does not open a map.
 */
export function vyaaflowVisibleMode(
  _requested: string | string[] | undefined
): "calendar" {
  return "calendar";
}

/** Same statutory reference on the same day, even if reminder rows repeat it. */
export function statutoryAgendaKey(record: CalendarMapRecord): string | null {
  if (record.entityType !== "statutory_info") return null;
  if (record.target.kind !== "statutory_info") return null;
  return `${record.target.templateId}:${record.date}`;
}

/**
 * Filter the day's existing sections. A statutory event already present is not
 * added again from a later section.
 */
export function filterVyaaflowAgendaSections(
  sections: readonly CalendarMapSection[],
  filter: VyaaflowAgendaFilter
): CalendarMapSection[] {
  const seenStatutory = new Set<string>();
  const result: CalendarMapSection[] = [];

  for (const section of sections) {
    const statutorySection = section.categoryKey === "statutory";
    if (filter === "business" && statutorySection) continue;
    if (filter === "statutory" && !statutorySection) continue;

    const data: CalendarMapRecord[] = [];
    for (const record of section.data) {
      const key = statutoryAgendaKey(record);
      if (key) {
        if (seenStatutory.has(key)) continue;
        seenStatutory.add(key);
      }
      data.push(record);
    }
    if (data.length === 0) continue;
    result.push({ categoryKey: section.categoryKey, data });
  }

  return result;
}
