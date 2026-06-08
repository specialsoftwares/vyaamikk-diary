import type { Router } from "expo-router";

import type { AtAGlanceItem } from "./atAGlanceTypes";

export function navigateToAtAGlanceItem(router: Router, item: AtAGlanceItem): void {
  switch (item.target.kind) {
    case "diary_entry":
      router.push({
        pathname: "/(app)/diary/[id]",
        params: { id: item.target.entryId, from: "you" },
      });
      break;
    case "professional_pack":
      router.push({
        pathname: "/(app)/professional-pack/[id]",
        params: { id: item.target.packId },
      });
      break;
    case "letterhead_document":
      router.push("/(app)/letterhead/history");
      break;
    case "customer_credit":
      router.push({
        pathname: "/(app)/customer-credit/[id]",
        params: { id: item.target.recordId },
      });
      break;
    default:
      break;
  }
}
