/**
 * Public India Post pincode API — no Firebase, no user identity, no SQLite.
 * Safe for Expo Go harness and Node live probes.
 */

import type { PincodeResolution } from "@/domain/indianPostal";
import { isValidIndianPincode, normalizeIndianPinInput } from "@/domain/indianPincodeInput";

export const DEFAULT_POSTAL_PINCODE_API = "https://api.postalpincode.in/pincode";
export const POSTAL_PINCODE_API_TIMEOUT_MS = 4_000;

export type PostalPincodeClassification =
  | "success"
  | "not-found"
  | "timeout"
  | "transport"
  | "parse"
  | "invalid-format";

export interface PostalPincodeLookupResult {
  pin: string;
  classification: PostalPincodeClassification;
  httpStatus: number | null;
  elapsedMs: number;
  resultCount: number;
  locality: string | null;
  district: string | null;
  state: string | null;
  resolution: PincodeResolution;
}

interface PostOfficeRow {
  Name?: string;
  District?: string;
  State?: string;
  Country?: string;
  Pincode?: string;
}

interface PostalPincodeApiPayload {
  Status?: string;
  Message?: string;
  PostOffice?: PostOfficeRow[] | null;
}

function formatIndianPlaceName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed !== trimmed.toUpperCase()) return trimmed;
  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function unwrapPostalPincodePayload(json: unknown): PostalPincodeApiPayload | null {
  if (Array.isArray(json)) {
    const first = json[0];
    return first && typeof first === "object" ? (first as PostalPincodeApiPayload) : null;
  }
  if (json && typeof json === "object") {
    return json as PostalPincodeApiPayload;
  }
  return null;
}

function emptyResolution(
  pinCode: string,
  errorClass: NonNullable<PincodeResolution["errorClass"]>
): PincodeResolution {
  return {
    pinCode,
    success: false,
    source: "api",
    localities: [],
    defaultLocality: null,
    district: null,
    state: null,
    country: "India",
    errorClass,
  };
}

export async function lookupPostalPincodeApi(
  pinCode: string,
  options?: { timeoutMs?: number; baseUrl?: string }
): Promise<PostalPincodeLookupResult> {
  const pin = normalizeIndianPinInput(pinCode);
  const started = Date.now();
  if (!isValidIndianPincode(pin)) {
    return {
      pin,
      classification: "invalid-format",
      httpStatus: null,
      elapsedMs: Date.now() - started,
      resultCount: 0,
      locality: null,
      district: null,
      state: null,
      resolution: emptyResolution(pin || pinCode, "parse"),
    };
  }

  const base = (options?.baseUrl ?? DEFAULT_POSTAL_PINCODE_API).replace(/\/$/, "");
  const timeoutMs = options?.timeoutMs ?? POSTAL_PINCODE_API_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}/${pin}`, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const httpStatus = res.status;
    if (!res.ok) {
      const classification: PostalPincodeClassification =
        httpStatus === 404 ? "not-found" : "transport";
      return {
        pin,
        classification,
        httpStatus,
        elapsedMs: Date.now() - started,
        resultCount: 0,
        locality: null,
        district: null,
        state: null,
        resolution: emptyResolution(pin, classification === "not-found" ? "not_found" : "transport"),
      };
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return {
        pin,
        classification: "parse",
        httpStatus,
        elapsedMs: Date.now() - started,
        resultCount: 0,
        locality: null,
        district: null,
        state: null,
        resolution: emptyResolution(pin, "parse"),
      };
    }

    const payload = unwrapPostalPincodePayload(json);
    const offices = Array.isArray(payload?.PostOffice) ? payload.PostOffice : [];
    const apiSuccess = payload?.Status === "Success" && offices.length > 0;

    if (!apiSuccess) {
      return {
        pin,
        classification: "not-found",
        httpStatus,
        elapsedMs: Date.now() - started,
        resultCount: 0,
        locality: null,
        district: null,
        state: null,
        resolution: emptyResolution(pin, "not_found"),
      };
    }

    const localities = [
      ...new Set(offices.map((o) => o.Name?.trim()).filter((n): n is string => Boolean(n))),
    ];
    const first = offices[0]!;
    const district = formatIndianPlaceName(first.District) ?? first.District?.trim() ?? null;
    const state = formatIndianPlaceName(first.State) ?? first.State?.trim() ?? null;
    const resolution: PincodeResolution = {
      pinCode: pin,
      success: Boolean(district || state || localities.length),
      source: "api",
      localities,
      defaultLocality: localities[0] ?? null,
      district,
      state,
      country: first.Country?.trim() || "India",
    };

    return {
      pin,
      classification: resolution.success ? "success" : "not-found",
      httpStatus,
      elapsedMs: Date.now() - started,
      resultCount: localities.length || offices.length,
      locality: resolution.defaultLocality,
      district: resolution.district,
      state: resolution.state,
      resolution: resolution.success
        ? resolution
        : emptyResolution(pin, "not_found"),
    };
  } catch (e) {
    const aborted =
      (e instanceof Error && e.name === "AbortError") ||
      (e instanceof Error && e.message.toLowerCase().includes("abort"));
    const classification: PostalPincodeClassification = aborted ? "timeout" : "transport";
    return {
      pin,
      classification,
      httpStatus: null,
      elapsedMs: Date.now() - started,
      resultCount: 0,
      locality: null,
      district: null,
      state: null,
      resolution: emptyResolution(pin, classification === "timeout" ? "timeout" : "transport"),
    };
  } finally {
    clearTimeout(timer);
  }
}
