import type { FormDraftKind, FormDraftRecord } from "@/repositories/formDraftsRepository";
import { composerOptionForType } from "@/domain/composerOptions";
import type { BusinessEntryType } from "@/domain/businessEntry";
import { isComposerEntryType } from "@/domain/composerOptions";

function pickSnippet(values: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = values[k];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 48);
    if (typeof v === "number" && v > 0 && (k === "amount" || k === "pendingAmount")) {
      return String(v);
    }
  }
  return null;
}

export function buildDraftTitle(
  draft: Pick<FormDraftRecord, "draftKind" | "scopeKey" | "payload" | "title">,
  t: (key: string) => string
): string {
  if (draft.title.trim()) return draft.title.trim();

  const p = draft.payload;
  if (draft.draftKind === "composer" && isComposerEntryType(draft.scopeKey)) {
    const type = draft.scopeKey as BusinessEntryType;
    const opt = composerOptionForType(type);
    const base = opt
      ? t(`composer.options.${opt.labelKey}`)
      : t(`composer.types.${type}`);

    const hint = (() => {
      switch (type) {
        case "payment_request":
          return pickSnippet(p, ["invoiceNumber", "partyName", "pendingAmount"]);
        case "outward_freight_details":
          return pickSnippet(p, ["dispatchTitle", "billNumber", "deliveryLocation"]);
        case "business_cash_given":
          return pickSnippet(p, ["givenToName", "purpose", "amount"]);
        case "work_update_issue":
          return pickSnippet(p, ["sitePlace", "workDone", "issueProblem"]);
        case "staff_matter":
          return pickSnippet(p, ["staffName", "matterDetails"]);
        case "material_dispatched":
        case "material_received":
          return pickSnippet(p, ["partyName", "supplierName", "materialName"]);
        case "reminder_gst_return":
          return pickSnippet(p, ["taxPeriod", "returnType"]);
        case "reminder_purchase":
          return pickSnippet(p, ["itemMaterial"]);
        case "reminder_email":
          return pickSnippet(p, ["purposeSubject"]);
        default:
          return null;
      }
    })();

    return hint ? `${base} · ${hint}` : `${base} ${t("drafts.titleSuffix")}`;
  }

  if (draft.draftKind === "professional_pack") {
    const matter = typeof p.matterType === "string" ? p.matterType : draft.scopeKey;
    const hint = pickSnippet(p, ["title", "professionalName", "notes"]);
    return hint
      ? `${t("drafts.proPack")} · ${hint}`
      : `${t("drafts.proPack")} ${t("drafts.titleSuffix")}`;
  }

  if (draft.draftKind === "letterhead") {
    const hint = pickSnippet(p, ["subject", "body", "recipientName"]);
    return hint
      ? `${t("drafts.letterhead")} · ${hint}`
      : `${t("drafts.letterhead")} ${t("drafts.titleSuffix")}`;
  }

  return t("drafts.generic");
}

export function buildDraftMetadataLine(
  draft: FormDraftRecord,
  t: (key: string) => string
): string {
  const title = buildDraftTitle(draft, t);
  if (draft.draftKind === "composer" && isComposerEntryType(draft.scopeKey)) {
    const opt = composerOptionForType(draft.scopeKey as BusinessEntryType);
    const typeLabel = opt
      ? t(`composer.options.${opt.labelKey}`)
      : draft.scopeKey;
    const parts = title.includes("·") ? title.split("·").map((s) => s.trim()) : [typeLabel, title];
    if (parts.length >= 2) return `${parts[0]} · ${parts.slice(1).join(" · ")}`;
    return typeLabel;
  }
  return title;
}
