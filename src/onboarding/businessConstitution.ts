/**
 * Canonical business / practice types for Vyaamikk onboarding.
 * Persisted value is the human-readable label (workType / draft.constitution).
 * Internal ids are for logic only — not a schema migration.
 */

export const BUSINESS_PRACTICE_TYPES = [
  { id: "proprietorship", label: "Proprietorship" },
  { id: "individual_professional", label: "Individual Professional / Sole Practice" },
  { id: "partnership_firm", label: "Partnership Firm" },
  { id: "llp", label: "Limited Liability Partnership (LLP)" },
  { id: "opc", label: "One Person Company (OPC)" },
  { id: "private_limited", label: "Private Limited Company" },
  { id: "public_limited", label: "Public Limited Company" },
  { id: "huf", label: "Hindu Undivided Family (HUF)" },
  { id: "trust", label: "Trust" },
  { id: "society", label: "Society" },
  { id: "co_operative_society", label: "Co-operative Society" },
  { id: "other", label: "Other" },
] as const;

export type BusinessPracticeTypeId = (typeof BUSINESS_PRACTICE_TYPES)[number]["id"];
export type BusinessConstitution = (typeof BUSINESS_PRACTICE_TYPES)[number]["label"];

/** Visible labels — what the selector stores on the profile. */
export const BUSINESS_CONSTITUTIONS: readonly BusinessConstitution[] = BUSINESS_PRACTICE_TYPES.map(
  (t) => t.label
);

export const NEW_REGISTRATION_ACCOUNT_KIND = "business" as const;

export function isIndividualOnboardingPathEnabled(): false {
  return false;
}

export function practiceTypeIdFromValue(value: string): BusinessPracticeTypeId | null {
  const trimmed = value.trim();
  const byId = BUSINESS_PRACTICE_TYPES.find((t) => t.id === trimmed);
  if (byId) return byId.id;
  const byLabel = BUSINESS_PRACTICE_TYPES.find((t) => t.label === trimmed);
  return byLabel?.id ?? null;
}

export function practiceTypeLabelFromValue(value: string): string {
  const id = practiceTypeIdFromValue(value);
  if (!id) return value.trim();
  return BUSINESS_PRACTICE_TYPES.find((t) => t.id === id)!.label;
}

export function isIndividualProfessionalPractice(value: string): boolean {
  return practiceTypeIdFromValue(value) === "individual_professional";
}

export function isRecognizedBusinessConstitution(value: string): boolean {
  return practiceTypeIdFromValue(value) != null;
}
