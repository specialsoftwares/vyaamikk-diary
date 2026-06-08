import type { PincodeResolution } from "@/domain/indianPostal";
import { getSharedIndiaPincodeOfflineLookup } from "@/services/location/pincodeOfflineLookup";
import { env } from "@/config/env";
import { pincodeCacheRepository } from "@/services/location/pincodeCacheRepository";
export {
  scheduleDeferredIndiaPincodeWarm,
  warmIndiaPincodeOfflineLookup,
} from "@/services/location/pincodeOfflineLookup";
import { createLogger } from "@/utils/logger";

const log = createLogger("pincode");

const DEFAULT_API = "https://api.postalpincode.in/pincode";
const inflight = new Map<string, Promise<PincodeResolution>>();

/** Indian PIN: six digits, first digit 1–9 (no leading zero). */
export const INDIAN_PIN_REGEX = /^[1-9]\d{5}$/;

/** Trim spaces; keep digits only for validation. */
export function normalizeIndianPinInput(raw: string): string {
  return raw.replace(/\s/g, "").replace(/\D/g, "").slice(0, 6);
}

/** Format check after normalizing — does not prove the PIN exists. */
export function isValidIndianPincode(pinCode: string): boolean {
  const pin = normalizeIndianPinInput(pinCode);
  return INDIAN_PIN_REGEX.test(pin);
}

function emptyResolution(pinCode: string, source: PincodeResolution["source"]): PincodeResolution {
  return {
    pinCode,
    success: false,
    source,
    localities: [],
    defaultLocality: null,
    district: null,
    state: null,
    country: "India",
  };
}

/** Title-case ALL-CAPS district/state from offline DB. */
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

function buildResolution(
  pinCode: string,
  source: PincodeResolution["source"],
  localities: string[],
  district: string | null,
  state: string | null,
  country: string
): PincodeResolution {
  const districtFmt = formatIndianPlaceName(district);
  const stateFmt = formatIndianPlaceName(state);
  return {
    pinCode,
    success: Boolean(districtFmt || stateFmt || localities.length),
    source,
    localities,
    defaultLocality: localities[0] ?? null,
    district: districtFmt,
    state: stateFmt,
    country: country.trim() || "India",
  };
}

async function getOfflineLookup() {
  return getSharedIndiaPincodeOfflineLookup();
}

async function fetchFromOfflineDb(pinCode: string): Promise<PincodeResolution | null> {
  try {
    const lookup = await getOfflineLookup();
    const response = lookup.getByPincode(pinCode, { limit: 50 });
    if (!response.success || !response.data?.data?.length) {
      return null;
    }
    const offices = response.data.data;
    const localities = [
      ...new Set(offices.map((o) => o.area?.trim()).filter((n): n is string => Boolean(n))),
    ];
    const first = offices[0];
    return buildResolution(
      pinCode,
      "offline",
      localities,
      first.district ?? null,
      first.state ?? null,
      first.country ?? "India"
    );
  } catch (e) {
    if (!env.isProduction) log.debug("offline lookup failed");
    return null;
  }
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
  PostOffice?: PostOfficeRow[];
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

async function fetchFromApi(pinCode: string): Promise<PincodeResolution | null> {
  const base = env.expoPublicPincodeApiUrl?.trim() || DEFAULT_API;
  const url = `${base.replace(/\/$/, "")}/${pinCode}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const payload = unwrapPostalPincodePayload(json);
    if (
      payload?.Status !== "Success" ||
      !Array.isArray(payload.PostOffice) ||
      !payload.PostOffice.length
    ) {
      return null;
    }
    const localities = [
      ...new Set(
        payload.PostOffice.map((o) => o.Name?.trim()).filter((n): n is string => Boolean(n))
      ),
    ];
    const first = payload.PostOffice[0];
    return buildResolution(
      pinCode,
      "api",
      localities,
      first.District?.trim() || null,
      first.State?.trim() || null,
      first.Country?.trim() || "India"
    );
  } catch (e) {
    if (!env.isProduction) log.debug("api lookup failed");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveUncached(pinCode: string): Promise<PincodeResolution> {
  const offline = await fetchFromOfflineDb(pinCode);
  if (offline?.success) {
    await pincodeCacheRepository.set(offline);
    return offline;
  }

  const api = await fetchFromApi(pinCode);
  if (api?.success) {
    await pincodeCacheRepository.set(api);
    return api;
  }

  return emptyResolution(pinCode, "manual");
}

/**
 * Resolve Indian PIN → district/state/localities.
 * Order: memory dedupe → SQLite cache → offline DB (CDN) → API → manual fallback.
 */
export async function resolveIndianPincode(pinCode: string): Promise<PincodeResolution> {
  const pin = normalizeIndianPinInput(pinCode);
  if (!isValidIndianPincode(pin)) {
    return emptyResolution(pin, "manual");
  }

  const cached = await pincodeCacheRepository.get(pin);
  if (cached) {
    return { ...cached, source: "cache" };
  }

  const pending = inflight.get(pin);
  if (pending) return pending;

  const promise = resolveUncached(pin).finally(() => inflight.delete(pin));
  inflight.set(pin, promise);
  return promise;
}
