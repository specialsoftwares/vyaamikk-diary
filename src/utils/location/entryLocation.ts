import type { BusinessEntry } from "@/domain/businessEntry";
import type { RecordGpsLocation } from "@/domain/recordLocation";
import type { GeoPoint } from "@/domain/types";
import { postalSearchParts } from "@/utils/location/postalEntry";
import { parseIndianPostalFromStored } from "@/utils/location/postalForm";

export function geoPointToRecordGps(
  geo: GeoPoint,
  opts?: {
    addressLabel?: string | null;
    source?: RecordGpsLocation["source"];
    permissionSnapshot?: RecordGpsLocation["permissionSnapshot"];
  }
): RecordGpsLocation {
  return {
    latitude: geo.latitude,
    longitude: geo.longitude,
    accuracy: geo.accuracy ?? null,
    addressLabel: opts?.addressLabel ?? null,
    capturedAt: new Date(geo.capturedAt).toISOString(),
    source: opts?.source ?? "device",
    permissionSnapshot: opts?.permissionSnapshot,
  };
}

export function recordGpsToGeoPoint(gps: RecordGpsLocation): GeoPoint {
  return {
    latitude: gps.latitude,
    longitude: gps.longitude,
    accuracy: gps.accuracy ?? null,
    capturedAt: Date.parse(gps.capturedAt) || Date.now(),
  };
}

/** Resolve map coordinates from stored location (gps preferred, then geo). */
export function entryMapCoordinates(
  location: BusinessEntry["location"]
): { latitude: number; longitude: number } | null {
  if (!location) return null;
  const gps = location.gps;
  if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
    return { latitude: gps.latitude, longitude: gps.longitude };
  }
  const geo = location.geo;
  if (geo && Number.isFinite(geo.latitude) && Number.isFinite(geo.longitude)) {
    return { latitude: geo.latitude, longitude: geo.longitude };
  }
  return null;
}

export function entryHasGpsFootprint(location: BusinessEntry["location"]): boolean {
  return entryMapCoordinates(location) != null;
}

/** Manual / payload location text for snippets and search (no GPS required). */
export function manualLocationTextFromEntry(entry: BusinessEntry): string | null {
  const parts: string[] = [];
  if (entry.location?.name?.trim()) parts.push(entry.location.name.trim());
  if (entry.location?.gps?.addressLabel?.trim()) {
    parts.push(entry.location.gps.addressLabel.trim());
  }

  const p = entry.payload as unknown as Record<string, unknown>;
  const keys = [
    "sitePlace",
    "deliveryLocation",
    "dispatchLocation",
    "dispatchFromLocation",
    "destination",
    "receivedLocation",
    "place",
    "transporterName",
    "transporter",
  ];
  for (const k of keys) {
    const v = p[k];
    if (typeof v === "string" && v.trim()) parts.push(v.trim());
  }

  for (const key of [
    "dispatchFromPostal",
    "deliveryToPostal",
    "receivedAtPostal",
    "supplierPostal",
    "partyPostal",
  ]) {
    parts.push(...postalSearchParts(parseIndianPostalFromStored(p[key])));
  }

  const unique = [...new Set(parts)];
  return unique.length ? unique.join(" · ") : null;
}

export function buildSearchableLocationText(entry: BusinessEntry): string {
  const parts: string[] = [];
  const manual = manualLocationTextFromEntry(entry);
  if (manual) parts.push(manual);
  const coords = entryMapCoordinates(entry.location);
  if (coords) {
    if (entry.location?.gps?.addressLabel?.trim()) {
      parts.push(entry.location.gps.addressLabel.trim());
    }
  }
  return parts.join(" ");
}
