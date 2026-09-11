import type { PincodeResolution } from "@/domain/indianPostal";
import {
  getSharedIndiaPincodeOfflineLookup,
  isIndiaPincodeOfflineLookupReady,
} from "@/services/location/pincodeOfflineLookup";
import { shouldQueryOfflinePincodeOnInteractivePath } from "@/services/location/pincodeWarmPolicy";
import { env } from "@/config/env";
import { pincodeCacheRepository } from "@/services/location/pincodeCacheRepository";
import { lookupPostalPincodeApi } from "@/services/location/postalPincodeApi";
import { createLogger } from "@/utils/logger";

const log = createLogger("pincode");

const OFFLINE_LOOKUP_TIMEOUT_MS = 2_500;

const inflight = new Map<string, Promise<PincodeResolution>>();
const sessionCache = new Map<string, PincodeResolution>();

import {
  isValidIndianPincode,
  normalizeIndianPinInput,
} from "@/domain/indianPincodeInput";
export {
  INDIAN_PIN_REGEX,
  isValidIndianPincode,
  normalizeIndianPinInput,
} from "@/domain/indianPincodeInput";

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

function logLookupDiagnostic(input: {
  pin: string;
  cacheHit: boolean;
  source: PincodeResolution["source"];
  durationMs: number;
  success: boolean;
  timedOut?: boolean;
}): void {
  if (env.isProduction) return;
  log.debug("pin_lookup", {
    pin: input.pin.slice(0, 2) + "****",
    cache_hit: input.cacheHit,
    source: input.source,
    durationMs: input.durationMs,
    success: input.success,
    timeout: input.timedOut ?? false,
  });
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("pin_lookup_timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchFromOfflineDb(pinCode: string): Promise<PincodeResolution | null> {
  // Critical: do not cold-start india-pincode here. First decompress/parse blocks
  // the JS thread long enough that Camera/Gallery taps appear dead and
  // "Looking up PIN…" freezes until the event loop can run again.
  if (!shouldQueryOfflinePincodeOnInteractivePath(isIndiaPincodeOfflineLookupReady())) {
    return null;
  }
  try {
    const lookup = await withTimeout(getSharedIndiaPincodeOfflineLookup(), OFFLINE_LOOKUP_TIMEOUT_MS);
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
  } catch {
    if (!env.isProduction) log.debug("offline lookup skipped or timed out");
    return null;
  }
}

async function fetchFromApi(pinCode: string): Promise<PincodeResolution> {
  const lookup = await lookupPostalPincodeApi(pinCode, {
    baseUrl: env.expoPublicPincodeApiUrl?.trim() || undefined,
  });
  return lookup.resolution;
}

async function resolveUncached(pinCode: string): Promise<PincodeResolution> {
  const started = Date.now();
  let timedOut = false;

  let offline: PincodeResolution | null = null;
  try {
    offline = await fetchFromOfflineDb(pinCode);
  } catch {
    timedOut = true;
  }
  if (offline?.success) {
    await pincodeCacheRepository.set(offline);
    sessionCache.set(pinCode, offline);
    logLookupDiagnostic({
      pin: pinCode,
      cacheHit: false,
      source: "offline",
      durationMs: Date.now() - started,
      success: true,
    });
    return offline;
  }

  const api = await fetchFromApi(pinCode);
  if (api.success) {
    await pincodeCacheRepository.set(api);
    sessionCache.set(pinCode, api);
    // Do not scheduleDeferredIndiaPincodeWarm here. That decompresses ~165k
    // post offices on the JS thread and freezes Continue/Back after Confirmed.
    logLookupDiagnostic({
      pin: pinCode,
      cacheHit: false,
      source: "api",
      durationMs: Date.now() - started,
      success: true,
    });
    return api;
  }

  // Cache durable not-found; never cache transport/timeout (retry next tap).
  if (api.errorClass === "not_found") {
    sessionCache.set(pinCode, api);
  }

  logLookupDiagnostic({
    pin: pinCode,
    cacheHit: false,
    source: "api",
    durationMs: Date.now() - started,
    success: false,
    timedOut: timedOut || api.errorClass === "timeout",
  });
  return api;
}

/**
 * Resolve Indian PIN → district/state/localities.
 * Order: session cache → in-flight dedupe → SQLite cache → offline DB (CDN) → API → manual fallback.
 */
export async function resolveIndianPincode(pinCode: string): Promise<PincodeResolution> {
  const pin = normalizeIndianPinInput(pinCode);
  if (!isValidIndianPincode(pin)) {
    return emptyResolution(pin, "manual");
  }

  const sessionHit = sessionCache.get(pin);
  if (sessionHit) {
    logLookupDiagnostic({
      pin,
      cacheHit: true,
      source: sessionHit.source,
      durationMs: 0,
      success: sessionHit.success,
    });
    return { ...sessionHit, source: sessionHit.success ? "cache" : sessionHit.source };
  }

  const cached = await pincodeCacheRepository.get(pin);
  if (cached) {
    sessionCache.set(pin, cached);
    logLookupDiagnostic({
      pin,
      cacheHit: true,
      source: "cache",
      durationMs: 0,
      success: cached.success,
    });
    return { ...cached, source: "cache" };
  }

  const pending = inflight.get(pin);
  if (pending) return pending;

  const promise = resolveUncached(pin).finally(() => inflight.delete(pin));
  inflight.set(pin, promise);
  return promise;
}

/** Resolve multiple PINs in parallel (e.g. route forms). */
export async function resolveIndianPincodesParallel(
  pinCodes: string[]
): Promise<Map<string, PincodeResolution>> {
  const unique = [...new Set(pinCodes.map(normalizeIndianPinInput).filter(isValidIndianPincode))];
  const entries = await Promise.all(
    unique.map(async (pin) => [pin, await resolveIndianPincode(pin)] as const)
  );
  return new Map(entries);
}
