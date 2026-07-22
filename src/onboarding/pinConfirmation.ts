/**
 * PIN confirmation with stale-response protection.
 */

import type { PincodeResolution } from "@/domain/indianPostal";
import { isValidIndianPincode } from "@/domain/indianPincodeInput";
import type { ConfirmedPinLocation } from "@/onboarding/profileIdentityModel";

/** Accept only pure ASCII digits — reject spaces/Hindi/signs (no auto-clean). */
export function acceptPinInput(raw: string): string | null {
  if (raw.length === 0) return "";
  if (!/^[0-9]*$/.test(raw)) return null;
  if (raw.length > 6) return null;
  return raw;
}

export type PinLookupUiState =
  | { status: "idle" }
  | { status: "invalid_format" }
  | { status: "looking_up"; requestId: number; pinCode: string }
  | {
      status: "choices";
      requestId: number;
      pinCode: string;
      localities: string[];
      district: string;
      state: string;
      source: ConfirmedPinLocation["source"];
    }
  | {
      status: "ready_to_confirm";
      requestId: number;
      pinCode: string;
      locality: string | null;
      district: string;
      state: string;
      source: ConfirmedPinLocation["source"];
    }
  | { status: "not_found"; requestId: number; pinCode: string }
  | { status: "unavailable"; requestId: number; pinCode: string }
  | { status: "confirmed"; location: ConfirmedPinLocation };

let nextRequestId = 1;

export function nextPinLookupRequestId(): number {
  nextRequestId += 1;
  return nextRequestId;
}

/** Ignore resolutions that do not match the latest request + PIN. */
export function applyPinLookupResult(input: {
  requestId: number;
  latestRequestId: number;
  pinCode: string;
  currentPinCode: string;
  resolution: PincodeResolution;
}): PinLookupUiState | null {
  if (input.requestId !== input.latestRequestId) return null;
  if (input.pinCode !== input.currentPinCode) return null;
  if (!isValidIndianPincode(input.pinCode)) {
    return { status: "invalid_format" };
  }
  if (!input.resolution.success) {
    return input.resolution.source === "manual"
      ? { status: "unavailable", requestId: input.requestId, pinCode: input.pinCode }
      : { status: "not_found", requestId: input.requestId, pinCode: input.pinCode };
  }
  const district = input.resolution.district?.trim() ?? "";
  const state = input.resolution.state?.trim() ?? "";
  if (!district || !state) {
    return { status: "not_found", requestId: input.requestId, pinCode: input.pinCode };
  }
  const source =
    input.resolution.source === "offline" ||
    input.resolution.source === "api" ||
    input.resolution.source === "cache"
      ? input.resolution.source
      : "manual";
  if (input.resolution.localities.length > 1) {
    return {
      status: "choices",
      requestId: input.requestId,
      pinCode: input.pinCode,
      localities: input.resolution.localities,
      district,
      state,
      source,
    };
  }
  return {
    status: "ready_to_confirm",
    requestId: input.requestId,
    pinCode: input.pinCode,
    locality: input.resolution.defaultLocality,
    district,
    state,
    source,
  };
}

export function confirmPinLocation(input: {
  pinCode: string;
  locality: string | null;
  district: string;
  state: string;
  source: ConfirmedPinLocation["source"];
  now?: number;
}): ConfirmedPinLocation {
  return {
    pinCode: input.pinCode,
    locality: input.locality,
    district: input.district,
    state: input.state,
    country: "India",
    confirmedAt: input.now ?? Date.now(),
    source: input.source,
  };
}
