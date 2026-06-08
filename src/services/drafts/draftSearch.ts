import type { FormDraftRecord } from "@/repositories/formDraftsRepository";
import { buildDraftTitle } from "@/services/drafts/draftTitle";
import type { GlobalSearchResult, SearchCategory } from "@/services/search/types";
import { composerOptionForType } from "@/domain/composerOptions";
import type { BusinessEntryType } from "@/domain/businessEntry";
import { isComposerEntryType } from "@/domain/composerOptions";
import { ENTRY_TYPE_FILTER } from "@/services/search/types";

function categoryForDraft(draft: FormDraftRecord): SearchCategory {
  if (draft.draftKind === "composer" && isComposerEntryType(draft.scopeKey)) {
    const type = draft.scopeKey as BusinessEntryType;
    switch (type) {
      case "payment_request":
        return "payment_request";
      case "business_cash_given":
        return "cash";
      case "staff_matter":
        return "staff";
      case "work_update_issue":
        return "work";
      case "material_dispatched":
      case "outward_freight_details":
        return "material_dispatch";
      case "material_received":
        return "material_receipt";
      case "material_return":
        return "material_dispatch";
      case "reminder_purchase":
      case "reminder_email":
      case "reminder_gst_return":
        return "reminder";
      default:
        return "other";
    }
  }
  if (draft.draftKind === "letterhead") return "letterhead";
  if (draft.draftKind === "professional_pack") return "professional_pack";
  return "other";
}

function filterBucketForDraft(draft: FormDraftRecord): GlobalSearchResult["filterBucket"] {
  if (draft.draftKind === "composer" && isComposerEntryType(draft.scopeKey)) {
    return ENTRY_TYPE_FILTER[draft.scopeKey as BusinessEntryType] ?? "records";
  }
  if (draft.draftKind === "letterhead") return "letterhead";
  return "records";
}

/** Plain-text index for draft search — no logging of body in production callers. */
export function buildDraftSearchableText(draft: FormDraftRecord): string {
  const parts: string[] = [
    draft.title,
    draft.scopeKey,
    draft.draftKind,
    "draft",
  ];
  const p = draft.payload;
  for (const v of Object.values(p)) {
    if (typeof v === "string" && v.trim()) parts.push(v.trim());
    else if (typeof v === "number" && Number.isFinite(v)) parts.push(String(v));
  }
  return parts.join(" ").toLowerCase();
}

export function indexFormDraft(
  draft: FormDraftRecord,
  t: (key: string) => string
): { result: GlobalSearchResult; searchableText: string } {
  const category = categoryForDraft(draft);
  const title = buildDraftTitle(draft, t);
  const typeLabel =
    draft.draftKind === "composer" && isComposerEntryType(draft.scopeKey)
      ? (composerOptionForType(draft.scopeKey as BusinessEntryType)
          ? t(
              `composer.options.${composerOptionForType(draft.scopeKey as BusinessEntryType)!.labelKey}`
            )
          : draft.scopeKey)
      : draft.draftKind === "letterhead"
        ? t("drafts.letterhead")
        : t("drafts.proPack");

  const searchableText = buildDraftSearchableText(draft);
  const result: GlobalSearchResult = {
    id: `draft-${draft.id}`,
    kind: "form_draft",
    category,
    categoryLabelKey: `globalSearch.categories.${category}`,
    title,
    snippet: `${typeLabel} · ${t("drafts.chip")}`,
    dateMs: draft.updatedAt,
    iconName: "file-edit-outline",
    target: { type: "form_draft", draftId: draft.id },
    filterBucket: filterBucketForDraft(draft),
    searchableText,
    score: 0,
  };
  return { result, searchableText };
}
