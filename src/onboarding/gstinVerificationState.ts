/**
 * GSTIN verification state — never claim "Verified" from format alone.
 */

import { isValidGstin, normalizeGstin } from "@/utils/gst/gstin";
import type { GstinVerificationState } from "@/onboarding/profileIdentityModel";

/** Basic checksum digit check used by GSTIN (mod-36). */
export function gstinChecksumValid(raw: string): boolean {
  const g = normalizeGstin(raw);
  if (g.length !== 15) return false;
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let factor = 1;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const code = chars.indexOf(g[i]!);
    if (code < 0) return false;
    let product = code * factor;
    factor = factor === 1 ? 2 : 1;
    product = Math.floor(product / 36) + (product % 36);
    sum += product;
  }
  const check = (36 - (sum % 36)) % 36;
  return chars[check] === g[14];
}

export function evaluateGstinInput(raw: string): {
  normalized: string;
  state: GstinVerificationState;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { normalized: "", state: "notProvided" };
  }
  // Do not strip internal spaces silently for validation — normalize only after clean entry.
  if (/\s/.test(raw) || raw !== raw.trim()) {
    return { normalized: normalizeGstin(raw), state: "formatInvalid" };
  }
  const normalized = normalizeGstin(raw);
  if (normalized.length !== 15 || !isValidGstin(normalized) || !gstinChecksumValid(normalized)) {
    return { normalized, state: "formatInvalid" };
  }
  // No official provider configured in-repo — format valid but unavailable.
  return { normalized, state: "verificationUnavailable" };
}

export function gstinUserFacingLabel(state: GstinVerificationState): string {
  switch (state) {
    case "notProvided":
      return "Not provided";
    case "formatInvalid":
      return "Invalid GSTIN format";
    case "formatValid":
      return "Format valid";
    case "verificationPending":
      return "Official verification pending";
    case "officiallyVerified":
      return "Officially verified";
    case "verificationUnavailable":
      return "Format valid — official verification unavailable";
    case "verificationFailed":
      return "Official verification failed";
    case "identityMismatch":
      return "GSTIN details do not match this profile";
    default:
      return "Unknown";
  }
}
