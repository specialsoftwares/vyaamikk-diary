import type { Href } from "expo-router";

import type { FormDraftRecord } from "@/repositories/formDraftsRepository";
import { isComposerEntryType } from "@/domain/composerOptions";

export function hrefForDraft(draft: FormDraftRecord): Href {
  switch (draft.draftKind) {
    case "composer":
      if (isComposerEntryType(draft.scopeKey)) {
        const params: Record<string, string> = { type: draft.scopeKey };
        if (draft.entryId) params.entryId = draft.entryId;
        if (draft.source === "user") params.draftId = draft.id;
        return { pathname: "/(app)/composer/[type]", params } as Href;
      }
      return "/(app)/(tabs)/you" as Href;
    case "professional_pack": {
      const [category, matter] = draft.scopeKey.split("/");
      const params: Record<string, string> = {
        category: category ?? "",
        matter: matter ?? "",
        draftId: draft.id,
      };
      return { pathname: "/(app)/professional-pack/form", params } as Href;
    }
    case "letterhead":
      return {
        pathname: "/(app)/letterhead/create",
        params: draft.id ? { draftId: draft.id } : {},
      } as Href;
    default:
      return "/(app)/(tabs)/you" as Href;
  }
}
