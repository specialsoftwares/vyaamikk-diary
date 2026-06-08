/**
 * Map markers: user-attached GPS + PIN-resolved approximate postal centroids.
 * Never synthesizes GPS from PIN data.
 */

import type { BusinessEntry, BusinessEntryType } from "@/domain/businessEntry";
import type { IndianPostalLocation } from "@/domain/indianPostal";
import { buildEntrySnippet, resolveEntryTitle } from "@/services/dashboard/atAGlanceItemBuilder";
import { resolvePinCentroid } from "@/services/location/pincodeMapCoords";
import { buildPostalDisplayLabel } from "@/utils/location/postalDisplay";
import { dayKey } from "@/utils/date";
import { entryHasGpsFootprint, entryMapCoordinates } from "@/utils/location/entryLocation";
import { entryTypeLabelKey } from "@/utils/businessEntry/display";

import {
  buildFreightDispatchMapIntel,
  freightDispatchLocationSummary,
  freightDispatchSearchableText,
  hasFreightDispatchMapIntel,
} from "./freightDispatchMapIntel";
import type {
  CalendarMapCategoryKey,
  CalendarMapRecord,
  CalendarMapsSourceData,
  CalendarMapMapPoint,
} from "./calendarMapsTypes";
import { buildSearchableLocationText, manualLocationTextFromEntry } from "@/utils/location/entryLocation";

type TFn = (k: string, vars?: Record<string, string | number>) => string;

function iconForType(type: BusinessEntryType): string {
  switch (type) {
    case "payment_request":
      return "cash-multiple";
    case "outward_freight_details":
      return "truck-outline";
    case "business_cash_given":
      return "wallet-outline";
    case "staff_matter":
      return "account-tie-outline";
    case "work_update_issue":
      return "clipboard-text-outline";
    case "material_dispatched":
      return "package-variant";
    case "material_received":
      return "package-down";
    case "material_return":
      return "swap-horizontal";
    default:
      return "book-outline";
  }
}

function categoryForEntry(type: BusinessEntryType): CalendarMapCategoryKey {
  switch (type) {
    case "payment_request":
      return "payments";
    case "outward_freight_details":
    case "material_dispatched":
      return "freight";
    case "material_received":
    case "material_return":
      return "materials";
    case "staff_matter":
      return "staff";
    case "work_update_issue":
    case "business_cash_given":
      return "work";
    case "reminder_purchase":
    case "reminder_email":
    case "reminder_gst_return":
      return "reminders";
    case "letterhead_matter":
      return "letterhead";
    default:
      return "work";
  }
}

function entryToBaseMapRecord(
  entry: BusinessEntry,
  t: TFn,
  dateKey: string,
  sortMs: number
): CalendarMapRecord {
  const cat = categoryForEntry(entry.entryType);
  const dispatchIntel = buildFreightDispatchMapIntel(entry, t);
  const dispatchPlace =
    dispatchIntel && hasFreightDispatchMapIntel(dispatchIntel)
      ? freightDispatchLocationSummary(dispatchIntel)
      : null;
  const baseSearch = buildSearchableLocationText(entry);
  const intelSearch =
    dispatchIntel && hasFreightDispatchMapIntel(dispatchIntel)
      ? freightDispatchSearchableText(entry, dispatchIntel)
      : "";

  return {
    id: `entry-${entry.id}`,
    entityType: "diary_entry",
    title: resolveEntryTitle(entry, t),
    subtitle: buildEntrySnippet(entry, t),
    date: dateKey,
    sortMs,
    categoryKey: cat,
    categoryLabelKey: entryTypeLabelKey(entry.entryType),
    iconName: iconForType(entry.entryType),
    target: { kind: "diary_entry", entryId: entry.id },
    location: null,
    mapFootprintSource: null,
    manualLocationLabel: dispatchPlace ?? manualLocationTextFromEntry(entry),
    searchableLocationText: [baseSearch, intelSearch].filter(Boolean).join(" ").trim() || null,
    entryType: entry.entryType,
    dispatchIntel: hasFreightDispatchMapIntel(dispatchIntel) ? dispatchIntel : null,
  };
}

function postalAddressLabel(
  postal: IndianPostalLocation,
  side: "from" | "to",
  t: TFn
): string {
  const area = buildPostalDisplayLabel(postal);
  const place = postal.placeName?.trim();
  const pin = postal.pinCode;
  const parts = [place, area, pin].filter(Boolean);
  const line = parts.join(", ");
  const prefix = side === "from" ? t("postal.routeFrom") : t("postal.routeTo");
  return `${prefix} ${line}`;
}

function pinMapPoint(
  centroid: { latitude: number; longitude: number; pinCode: string },
  postal: IndianPostalLocation,
  side: "from" | "to",
  t: TFn
): CalendarMapMapPoint {
  return {
    latitude: centroid.latitude,
    longitude: centroid.longitude,
    source: "pin_approximate",
    pinCode: centroid.pinCode,
    postalSide: side,
    addressLabel: postalAddressLabel(postal, side, t),
  };
}

function freightDispatchPostalPairs(
  entry: BusinessEntry
): { side: "from" | "to"; postal: IndianPostalLocation | null | undefined }[] {
  if (
    entry.entryType !== "outward_freight_details" &&
    entry.entryType !== "material_dispatched"
  ) {
    return [];
  }
  const p = entry.payload as unknown as Record<string, unknown>;
  return [
    { side: "from", postal: p.dispatchFromPostal as IndianPostalLocation | null },
    { side: "to", postal: p.deliveryToPostal as IndianPostalLocation | null },
  ];
}

function pinMarkersForEntry(
  entry: BusinessEntry,
  base: CalendarMapRecord,
  t: TFn,
  centroidByPin: Map<string, Awaited<ReturnType<typeof resolvePinCentroid>>>
): CalendarMapRecord[] {
  const out: CalendarMapRecord[] = [];
  for (const { side, postal } of freightDispatchPostalPairs(entry)) {
    if (!postal?.pinCode) continue;
    const centroid = centroidByPin.get(postal.pinCode);
    if (!centroid) continue;
    out.push({
      ...base,
      id: `${base.id}-pin-${side}`,
      location: pinMapPoint(centroid, postal, side, t),
      mapFootprintSource: "pin_approximate",
    });
  }
  return out;
}

async function preloadPinCentroids(entries: BusinessEntry[]): Promise<Map<string, Awaited<ReturnType<typeof resolvePinCentroid>>>> {
  const pins = new Set<string>();
  for (const entry of entries) {
    if (entry.deletedAt) continue;
    for (const { postal } of freightDispatchPostalPairs(entry)) {
      const pin = postal?.pinCode?.trim();
      if (pin) pins.add(pin);
    }
  }
  const centroidByPin = new Map<string, Awaited<ReturnType<typeof resolvePinCentroid>>>();
  if (!pins.size) return centroidByPin;
  await Promise.all(
    [...pins].map(async (pin) => {
      centroidByPin.set(pin, await resolvePinCentroid(pin));
    })
  );
  return centroidByPin;
}

export interface MapMarkerBuildStats {
  hasGps: boolean;
  hasPin: boolean;
  total: number;
}

function markerStats(markers: CalendarMapRecord[]): MapMarkerBuildStats {
  return {
    hasGps: markers.some((m) => m.location?.source === "gps"),
    hasPin: markers.some((m) => m.location?.source === "pin_approximate"),
    total: markers.length,
  };
}

function mergeMarkerStats(a: MapMarkerBuildStats, b: MapMarkerBuildStats): MapMarkerBuildStats {
  return {
    hasGps: a.hasGps || b.hasGps,
    hasPin: a.hasPin || b.hasPin,
    total: a.total + b.total,
  };
}

/** Fast path — GPS footprints only (no india-pincode DB). */
export function buildGpsMapMarkersSync(
  data: CalendarMapsSourceData,
  t: TFn
): { markers: CalendarMapRecord[]; stats: MapMarkerBuildStats } {
  const out: CalendarMapRecord[] = [];
  for (const entry of data.entries) {
    if (entry.deletedAt) continue;
    const dk = dayKey(entry.entryDate);
    const base = entryToBaseMapRecord(entry, t, dk, entry.entryDate);
    if (!entryHasGpsFootprint(entry.location)) continue;
    const coords = entryMapCoordinates(entry.location);
    const gps = entry.location?.gps;
    if (!coords) continue;
    out.push({
      ...base,
      id: `${base.id}-gps`,
      location: {
        latitude: coords.latitude,
        longitude: coords.longitude,
        source: "gps",
        accuracy: gps?.accuracy ?? entry.location?.geo?.accuracy ?? null,
        addressLabel: gps?.addressLabel ?? entry.location?.name ?? null,
        capturedAt:
          gps?.capturedAt ?? new Date(entry.location!.geo!.capturedAt).toISOString(),
      },
      mapFootprintSource: "gps",
    });
  }
  return { markers: out, stats: markerStats(out) };
}

/** PIN approximate markers — awaits offline pincode DB; run only when Map mode is active. */
export async function buildPinMapMarkersAsync(
  data: CalendarMapsSourceData,
  t: TFn
): Promise<{ markers: CalendarMapRecord[]; stats: MapMarkerBuildStats }> {
  const centroidByPin = await preloadPinCentroids(data.entries);
  const out: CalendarMapRecord[] = [];
  for (const entry of data.entries) {
    if (entry.deletedAt) continue;
    const dk = dayKey(entry.entryDate);
    const base = entryToBaseMapRecord(entry, t, dk, entry.entryDate);
    out.push(...pinMarkersForEntry(entry, base, t, centroidByPin));
  }
  return { markers: out, stats: markerStats(out) };
}

/** Build GPS + PIN approximate markers (deleted entries excluded). */
export async function buildMapMarkerRecordsAsync(
  data: CalendarMapsSourceData,
  t: TFn
): Promise<{ markers: CalendarMapRecord[]; stats: MapMarkerBuildStats }> {
  const gps = buildGpsMapMarkersSync(data, t);
  const pin = await buildPinMapMarkersAsync(data, t);
  return {
    markers: [...gps.markers, ...pin.markers],
    stats: mergeMarkerStats(gps.stats, pin.stats),
  };
}
