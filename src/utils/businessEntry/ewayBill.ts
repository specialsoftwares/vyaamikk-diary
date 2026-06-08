/** Normalize pasted E-way Bill input — digits only, max 12. */
export function normalizeEwayBillInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 12);
}

/** True when value is blank or exactly 12 numeric digits (GST EBN format). */
export function isValidEwayBillNumber(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  if (!v) return true;
  return /^\d{12}$/.test(v);
}

export function ewayBillValidationMessage(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (/^\d{12}$/.test(v)) return null;
  return "materialMovement.ewayBillInvalid";
}
