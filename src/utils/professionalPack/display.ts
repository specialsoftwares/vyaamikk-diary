import type {
  ProfessionalCategory,
  ProfessionalMatterType,
  ProfessionalServicePack,
} from "@/domain/professionalPack";
import { getMatterDef } from "@/domain/professionalPackMatters";
import { formatEntryDate } from "@/utils/date";

export function categoryLabelKey(cat: ProfessionalCategory): string {
  return `proPack.categories.${cat}`;
}

export function matterLabelKey(
  cat: ProfessionalCategory,
  matter: ProfessionalMatterType
): string {
  const def = getMatterDef(cat, matter);
  return def ? `proPack.matters.${def.labelKey}` : matter;
}

export function packSearchBlob(pack: ProfessionalServicePack): string {
  return [
    pack.title,
    pack.matterType,
    pack.professionalName ?? "",
    pack.notes ?? "",
    ...Object.values(pack.facts).map(String),
  ]
    .join(" ")
    .toLowerCase();
}

export function autoPackTitle(
  pack: Pick<ProfessionalServicePack, "professionalCategory" | "matterType" | "facts" | "matterDate">,
  t: (k: string, vars?: Record<string, string | number>) => string
): string {
  const def = getMatterDef(pack.professionalCategory, pack.matterType);
  const matterLabel = def ? t(`proPack.matters.${def.labelKey}`) : pack.matterType;
  const summary = String(pack.facts.matterSummary ?? "").trim().slice(0, 40);
  const dateStr = formatEntryDate(pack.matterDate);
  if (summary) {
    return t("proPack.autoTitleWithSummary", { matter: matterLabel, summary, date: dateStr });
  }
  return t("proPack.autoTitle", { matter: matterLabel, date: dateStr });
}

export function statusLabelKey(status: ProfessionalServicePack["status"]): string {
  return `proPack.status.${status}`;
}
