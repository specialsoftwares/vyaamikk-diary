/** Common business / professional titles for profile and visiting card. */
export type ProfileDesignationId =
  | "proprietor"
  | "partner"
  | "director"
  | "managing_director"
  | "ceo"
  | "owner"
  | "manager"
  | "site_manager"
  | "factory_manager"
  | "accountant"
  | "company_secretary"
  | "advocate"
  | "contractor"
  | "supervisor"
  | "foreman"
  | "sales_manager"
  | "operations_manager"
  | "consultant"
  | "self_employed"
  | "other";

export const PROFILE_DESIGNATION_IDS: ProfileDesignationId[] = [
  "proprietor",
  "partner",
  "director",
  "managing_director",
  "ceo",
  "owner",
  "manager",
  "site_manager",
  "factory_manager",
  "accountant",
  "company_secretary",
  "advocate",
  "contractor",
  "supervisor",
  "foreman",
  "sales_manager",
  "operations_manager",
  "consultant",
  "self_employed",
  "other",
];

export function isProfileDesignationId(value: unknown): value is ProfileDesignationId {
  return (
    typeof value === "string" &&
    (PROFILE_DESIGNATION_IDS as readonly string[]).includes(value)
  );
}

/** Map a saved designation string to a preset id or custom "other" text. */
export function resolveDesignationSelection(
  stored: string,
  labelForId: (id: ProfileDesignationId) => string
): { id: ProfileDesignationId; custom: string } {
  const trimmed = stored.trim();
  if (!trimmed) {
    return { id: "other", custom: "" };
  }
  for (const id of PROFILE_DESIGNATION_IDS) {
    if (id === "other") continue;
    const label = labelForId(id).trim();
    if (label && label.localeCompare(trimmed, undefined, { sensitivity: "accent" }) === 0) {
      return { id, custom: "" };
    }
  }
  return { id: "other", custom: trimmed };
}

export function designationValueFromSelection(
  id: ProfileDesignationId,
  custom: string,
  labelForId: (id: ProfileDesignationId) => string
): string {
  if (id === "other") return custom.trim();
  return labelForId(id).trim();
}
