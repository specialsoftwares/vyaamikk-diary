import type { IndianPostalLocation } from "@/domain/indianPostal";
import type { MovementDistanceSource } from "@/domain/movementInsight";
import { resolvePinCentroid } from "@/services/location/pincodeMapCoords";
import { buildPostalDisplayLabel } from "@/utils/location/postalDisplay";
import { haversineDistanceKm } from "@/utils/geo/haversine";

export interface ApproxDistanceResult {
  fromPin: string;
  toPin: string;
  fromLabel: string | null;
  toLabel: string | null;
  approxDistanceKm: number | null;
  distanceSource: MovementDistanceSource;
  routeLabel: string | null;
}

function pinLabel(postal: IndianPostalLocation | null | undefined, pin: string): string | null {
  if (!postal) return pin || null;
  const display =
    postal.displayLabel?.trim() ||
    buildPostalDisplayLabel({
      locality: postal.locality,
      district: postal.district,
      state: postal.state,
    })?.trim();
  if (display) return `${display} - ${pin}`;
  return pin || null;
}

function routeLabelFrom(
  from: string | null,
  to: string | null,
  fromPin: string,
  toPin: string
): string | null {
  const a = from ?? fromPin;
  const b = to ?? toPin;
  if (!a || !b) return null;
  return `${a} → ${b}`;
}

/**
 * Approximate straight-line distance between two Indian PIN centroids.
 * Returns null distance (source `unknown`) when geo is unavailable — never fakes KM.
 */
export async function computeApproxDistanceBetweenPins(
  fromPostal: IndianPostalLocation | null | undefined,
  toPostal: IndianPostalLocation | null | undefined
): Promise<ApproxDistanceResult | null> {
  const fromPin = fromPostal?.pinCode?.trim() ?? "";
  const toPin = toPostal?.pinCode?.trim() ?? "";
  if (!fromPin || !toPin || fromPin === toPin) return null;

  const fromLabel = pinLabel(fromPostal, fromPin);
  const toLabel = pinLabel(toPostal, toPin);
  const routeLabel = routeLabelFrom(fromLabel, toLabel, fromPin, toPin);

  const [fromCentroid, toCentroid] = await Promise.all([
    resolvePinCentroid(fromPin),
    resolvePinCentroid(toPin),
  ]);

  if (!fromCentroid || !toCentroid) {
    return {
      fromPin,
      toPin,
      fromLabel,
      toLabel,
      approxDistanceKm: null,
      distanceSource: "unknown",
      routeLabel,
    };
  }

  const km = haversineDistanceKm(
    fromCentroid.latitude,
    fromCentroid.longitude,
    toCentroid.latitude,
    toCentroid.longitude
  );

  return {
    fromPin,
    toPin,
    fromLabel,
    toLabel,
    approxDistanceKm: km,
    distanceSource: km != null ? "pin_geo_haversine" : "unknown",
    routeLabel,
  };
}
