import type { MasterFieldKey } from "./types";

const PLACEHOLDER_RE =
  /^(test|asdf|na|n\/a|none|xxx|abc|sample|dummy|temp|todo|tbd|nil|-|\.+)$/i;

/** Values we never store as master data. */
export function isJunkMasterValue(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 2) return true;
  if (PLACEHOLDER_RE.test(t)) return true;
  if (/^\d+$/.test(t) && t.length < 4) return true;
  return false;
}

export function normalizeMasterValue(
  fieldKey: MasterFieldKey,
  raw: string
): string {
  let v = raw.trim().replace(/\s+/g, " ");
  switch (fieldKey) {
    case "vehicleNumber":
    case "lrGrNumber":
    case "gstin":
      return v.toUpperCase();
    case "clarificationContactMobile":
      return v.replace(/\D/g, "").slice(-10);
    default:
      return v.toLowerCase();
  }
}

export function displayMasterValue(
  fieldKey: MasterFieldKey,
  raw: string
): string {
  const t = raw.trim().replace(/\s+/g, " ");
  switch (fieldKey) {
    case "vehicleNumber":
    case "lrGrNumber":
    case "gstin":
      return t.toUpperCase();
    default:
      return t;
  }
}

/** Mask mobile for dropdown display — never log full numbers in production. */
export function maskMobileForDisplay(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length < 4) return "••••";
  if (d.length <= 6) return `•••• ${d.slice(-2)}`;
  return `••••• ${d.slice(-4)}`;
}

export function formatSuggestionDisplay(
  fieldKey: MasterFieldKey,
  displayValue: string
): string {
  if (fieldKey === "clarificationContactMobile") {
    const digits = displayValue.replace(/\D/g, "");
    if (digits.length >= 4) return maskMobileForDisplay(digits);
  }
  return displayValue;
}
