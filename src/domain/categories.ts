import type { DiaryCategory } from "./types";

export interface CategoryDef {
  id: DiaryCategory;
  label: string;
}

export const CATEGORIES: CategoryDef[] = [
  { id: "work", label: "Work" },
  { id: "business", label: "Business" },
  { id: "site", label: "Site" },
  { id: "shop", label: "Shop" },
  { id: "factory", label: "Factory" },
  { id: "staff", label: "Staff" },
  { id: "issue", label: "Issue / Downtime" },
  { id: "production", label: "Production" },
  { id: "followup", label: "Follow-up" },
  { id: "personal", label: "Personal" },
  { id: "other", label: "Other" },
];

export function categoryLabel(id: DiaryCategory): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? "Other";
}
