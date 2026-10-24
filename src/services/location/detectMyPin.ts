export const DETECT_PIN_LOCATION_TIMEOUT_MS = 12_000;
export const DETECT_PIN_POSTAL_TIMEOUT_MS = 8_000;

/** One foreground reading. Coordinates stay inside this module's request and are not returned. */
export interface DetectPinPoint {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export interface DetectPinFence {
  ownerId: string;
  sessionGeneration: number;
  screenAlive: boolean;
  targetField: string;
  fieldRevision: number;
}

export interface DetectPinRequest {
  ownerId: string;
  sessionGeneration: number;
  targetField: string;
  fieldRevision: number;
  readFence: () => DetectPinFence;
}

export interface DetectPinResolution {
  success: boolean;
  locality: string | null;
  district: string | null;
  state: string | null;
}

export interface DetectPinDeps {
  requestPermission: () => Promise<"granted" | "denied" | "undetermined">;
  getCurrent: () => Promise<DetectPinPoint>;
  /** Postal code string from the location stack. Must not receive record text. */
  reversePostalCode: (point: { latitude: number; longitude: number }) => Promise<string | null>;
  resolvePin: (pin: string) => Promise<DetectPinResolution>;
  locationTimeoutMs?: number;
  postalTimeoutMs?: number;
}

export type DetectPinResult =
  | {
      kind: "proposal";
      targetField: string;
      pinCode: string;
      areaLabel: string | null;
      approximate: boolean;
    }
  | { kind: "denied" }
  | { kind: "unavailable"; reason: "services" | "timeout" | "no_postal" | "lookup" }
  | { kind: "stale" };

export function fenceMatches(request: DetectPinRequest, fence: DetectPinFence): boolean {
  return (
    fence.screenAlive &&
    fence.ownerId === request.ownerId &&
    fence.sessionGeneration === request.sessionGeneration &&
    fence.targetField === request.targetField &&
    fence.fieldRevision === request.fieldRevision
  );
}

export function mayApplyDetectPinResult(request: DetectPinRequest): boolean {
  return fenceMatches(request, request.readFence());
}

/** A second tap while a detect is already running is ignored. */
export function acceptDetectPinTap(inFlight: boolean): boolean {
  return !inFlight;
}

/**
 * Accept only a real 6-digit postal code. Longer digit strings are rejected
 * rather than sliced into a PIN, and coordinates are never converted into one.
 */
export function postalCodeToIndianPin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.includes(".") || trimmed.includes(",")) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (!/^[1-9]\d{5}$/.test(digits)) return null;
  return digits;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

function areaLabel(resolution: DetectPinResolution): string | null {
  const parts = [resolution.locality, resolution.district, resolution.state].filter(
    (part): part is string => Boolean(part && part.trim())
  );
  return parts.length ? parts.join(", ") : null;
}

/**
 * Suggest one PIN for one field. Call only after the user has seen the reason.
 * Does not write coordinates, watch location, or request background permission.
 */
export async function detectPinForField(
  request: DetectPinRequest,
  deps: DetectPinDeps
): Promise<DetectPinResult> {
  const fresh = () => fenceMatches(request, request.readFence());
  if (!fresh()) return { kind: "stale" };

  const locationTimeout = deps.locationTimeoutMs ?? DETECT_PIN_LOCATION_TIMEOUT_MS;
  const postalTimeout = deps.postalTimeoutMs ?? DETECT_PIN_POSTAL_TIMEOUT_MS;

  let permission: "granted" | "denied" | "undetermined";
  try {
    permission = await deps.requestPermission();
  } catch {
    return fresh() ? { kind: "unavailable", reason: "services" } : { kind: "stale" };
  }
  if (!fresh()) return { kind: "stale" };
  if (permission !== "granted") return { kind: "denied" };

  let point: DetectPinPoint;
  try {
    point = await withTimeout(deps.getCurrent(), locationTimeout);
  } catch (error) {
    if (!fresh()) return { kind: "stale" };
    return { kind: "unavailable", reason: isTimeout(error) ? "timeout" : "services" };
  }
  if (!fresh()) return { kind: "stale" };
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
    return { kind: "unavailable", reason: "services" };
  }

  let postal: string | null;
  try {
    postal = await withTimeout(
      deps.reversePostalCode({ latitude: point.latitude, longitude: point.longitude }),
      postalTimeout
    );
  } catch (error) {
    if (!fresh()) return { kind: "stale" };
    return { kind: "unavailable", reason: isTimeout(error) ? "timeout" : "no_postal" };
  }
  if (!fresh()) return { kind: "stale" };

  const pinCode = postalCodeToIndianPin(postal);
  if (!pinCode) return { kind: "unavailable", reason: "no_postal" };

  let resolved: DetectPinResolution;
  try {
    resolved = await withTimeout(deps.resolvePin(pinCode), postalTimeout);
  } catch (error) {
    if (!fresh()) return { kind: "stale" };
    return { kind: "unavailable", reason: isTimeout(error) ? "timeout" : "lookup" };
  }
  if (!fresh()) return { kind: "stale" };
  if (!resolved.success) return { kind: "unavailable", reason: "lookup" };

  const approximate = point.accuracy == null || point.accuracy > 1_000;
  return {
    kind: "proposal",
    targetField: request.targetField,
    pinCode,
    areaLabel: areaLabel(resolved),
    approximate,
  };
}
