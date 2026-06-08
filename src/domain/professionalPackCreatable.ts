import type { ProfessionalMatterType } from "./professionalPack";
import { PROFESSIONAL_MATTER_TYPES } from "./professionalPackMatters";

/** Retired from new creation — legacy records remain readable. */
export const RETIRED_MATTER_TYPES = new Set<ProfessionalMatterType>(["expense_cash_review"]);

export function isCreatableMatterType(type: ProfessionalMatterType): boolean {
  return !RETIRED_MATTER_TYPES.has(type);
}

export function creatableMattersForCategory(
  category: "ca_tax" | "cs_compliance" | "legal"
) {
  return PROFESSIONAL_MATTER_TYPES.filter(
    (m) => m.category === category && isCreatableMatterType(m.type)
  );
}
