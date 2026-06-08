import type { Router } from "expo-router";

import type { GlobalSearchResult } from "./types";
import { hrefForDraft } from "@/services/drafts/draftRoutes";
import { formDraftsRepository } from "@/repositories/formDraftsRepository";

export function navigateToSearchResult(
  router: Router,
  result: GlobalSearchResult,
  userId?: string
): void {
  const target = result.target;
  switch (target.type) {
    case "form_draft":
      void (async () => {
        if (userId) {
          const draft = await formDraftsRepository.getById(userId, target.draftId);
          if (draft && draft.status === "active") {
            router.push(hrefForDraft(draft));
            return;
          }
        }
        router.push("/(app)/drafts");
      })();
      break;
    case "diary_entry":
      router.push({ pathname: "/(app)/diary/[id]", params: { id: target.entryId, from: "search" } });
      break;
    case "letterhead_document":
      router.push("/(app)/letterhead/history");
      break;
    case "professional_pack":
      router.push({
        pathname: "/(app)/professional-pack/[id]",
        params: { id: target.packId },
      });
      break;
    case "customer_credit":
      router.push({
        pathname: "/(app)/customer-credit/[id]",
        params: { id: target.recordId },
      });
      break;
    case "business_insight": {
      const path =
        target.screen === "recap" && target.fy
          ? `/(app)/settings/business-insights/recap/${target.fy}`
          : `/(app)/settings/business-insights/${target.screen}`;
      router.push({
        pathname: path as never,
        params: target.fy ? { fy: String(target.fy) } : undefined,
      });
      break;
    }
    case "pdf_history":
      if (target.parentType === "diary_entry") {
        router.push({
          pathname: "/(app)/diary/[id]",
          params: { id: target.parentId, from: "search" },
        });
      } else if (target.parentType === "professional_pack") {
        router.push({
          pathname: "/(app)/professional-pack/[id]",
          params: { id: target.parentId },
        });
      } else {
        router.push("/(app)/letterhead/history");
      }
      break;
    default:
      break;
  }
}
