import type { Router } from "expo-router";

import type { CalendarMapRecord } from "./calendarMapsTypes";

export function navigateToCalendarMapRecord(router: Router, record: CalendarMapRecord): void {
  switch (record.target.kind) {
    case "diary_entry":
      router.push({
        pathname: "/(app)/diary/[id]",
        params: { id: record.target.entryId, from: "calendar" },
      });
      break;
    case "professional_pack":
      router.push({
        pathname: "/(app)/professional-pack/[id]",
        params: { id: record.target.packId },
      });
      break;
    case "letterhead_document":
      router.push("/(app)/letterhead/history");
      break;
    case "statutory_info":
      router.push({
        pathname: "/statutory/detail",
        params: {
          occurrenceId: record.target.occurrenceId,
          templateId: record.target.templateId,
        },
      });
      break;
    default:
      break;
  }
}
