/** India receiver mobile for Cash Paid records — normalize, validate, PDF format. */

export type ReceiverMobileError = "required" | "invalid";

const E164_INDIA = /^\+91[6-9]\d{9}$/;

export function normalizeReceiverMobile(input: string | null | undefined): string | null {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, "");
  let local: string;
  if (digits.length === 10) {
    local = digits;
  } else if (digits.length === 12 && digits.startsWith("91")) {
    local = digits.slice(2);
  } else if (digits.length === 13 && digits.startsWith("091")) {
    local = digits.slice(3);
  } else {
    return null;
  }

  if (!/^[6-9]\d{9}$/.test(local)) return null;
  return `+91${local}`;
}

export function validateReceiverMobile(
  input: string | null | undefined
): ReceiverMobileError | null {
  if (!String(input ?? "").trim()) return "required";
  return normalizeReceiverMobile(input) ? null : "invalid";
}

/** Full Legal PDF layout: +91 XX XXXX XXXX */
export function formatReceiverMobileForPdf(e164: string): string {
  const normalized = normalizeReceiverMobile(e164) ?? e164.trim();
  const m = normalized.match(/^\+91(\d{2})(\d{4})(\d{4})$/);
  if (m) return `+91 ${m[1]} ${m[2]} ${m[3]}`;
  return normalized;
}

export function isValidReceiverMobileE164(e164: string): boolean {
  return E164_INDIA.test(e164);
}
