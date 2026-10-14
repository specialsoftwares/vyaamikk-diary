/**
 * Map markers: user-attached GPS + PIN-resolved approximate postal centroids.
 * Never synthesizes GPS from PIN data.
 */

import type { BusinessEntry, BusinessEntryType } from "@/domain/businessEntry";
import type { IndianPostalLocation } from "@/domain/indianPostal";
import { INDIAN_PIN_REGEX, normalizeIndianPinInput } from "@/domain/indianPincodeInput";
import { buildEntrySnippet, resolveEntryTitle } from "@/services/dashboard/atAGlanceItemBuilder";
import { resolvePinCentroid } from "@/services/location/pincodeMapCoords";
import {
  isIndiaPincodeOfflineLookupReady,
  scheduleDeferredIndiaPincodeWarm,
} from "@/services/location/pincodeOfflineLookup";
import { buildPostalDisplayLabel } from "@/utils/location/postalDisplay";
import { dayKey } from "@/utils/date";
import { entryHasGpsFootprint, entryMapCoordinates } from "@/utils/location/entryLocation";
import { entryTypeLabelKey } from "@/utils/businessEntry/display";
import {
  applyPinCentroids,
  groupFreightPinRows,
  lookupPinCentroidsBounded,
  PIN_LOOKUP_CONCURRENCY,
  type BusinessPinGroup,
  type FreightPinRow,
} from "./businessPinGroups";

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

function postalAreaLabel(postal: IndianPostalLocation): string {
  const area = buildPostalDisplayLabel(postal);
  const pin = normalizeIndianPinInput(postal.pinCode) || postal.pinCode.trim();
  return [area, pin].filter(Boolean).join(" · ");
}

export type BusinessPinGroupView = BusinessPinGroup<CalendarMapRecord>;

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

function pinRecordFor(
  base: CalendarMapRecord,
  side: "from" | "to",
  pinCode: string,
  areaLabel: string,
  centroid: { latitude: number; longitude: number } | null
): CalendarMapRecord {
  if (!centroid) {
    return {
      ...base,
      id: `${base.id}-pin-${side}`,
      location: null,
      mapFootprintSource: null,
    };
  }
  const location: CalendarMapMapPoint = {
    latitude: centroid.latitude,
    longitude: centroid.longitude,
    source: "pin_approximate",
    pinCode,
    postalSide: side,
    addressLabel: areaLabel,
  };
  return {
    ...base,
    id: `${base.id}-pin-${side}`,
    location,
    mapFootprintSource: "pin_approximate",
  };
}

/** Freight and dispatch From/To rows, including PINs that cannot be plotted. */
export function buildBusinessPinGroupsSync(
  data: CalendarMapsSourceData,
  t: TFn
): BusinessPinGroupView[] {
  const packed: { row: FreightPinRow; record: CalendarMapRecord }[] = [];
  for (const entry of data.entries) {
    if (entry.deletedAt) continue;
    const pairs = freightDispatchPostalPairs(entry).filter((pair) => pair.postal?.pinCode?.trim());
    if (!pairs.length) continue;
    const base = entryToBaseMapRecord(entry, t, dayKey(entry.entryDate), entry.entryDate);
    for (const { side, postal } of pairs) {
      if (!postal?.pinCode?.trim()) continue;
      const digits = postal.pinCode.replace(/\D/g, "");
      const valid = INDIAN_PIN_REGEX.test(digits);
      const pinCode = valid ? digits : postal.pinCode.trim();
      const areaLabel = postalAreaLabel(postal);
      const record = pinRecordFor(base, side, pinCode, areaLabel, null);
      packed.push({
        row: {
          entryId: entry.id,
          recordKey: record.id,
          pinCode,
          side,
          valid,
          areaLabel,
        },
        record,
      });
    }
  }
  return groupFreightPinRows(packed);
}

export async function plotBusinessPinGroups(
  groups: readonly BusinessPinGroupView[],
  options?: {
    resolveCentroid?: (pin: string) => Promise<{ latitude: number; longitude: number } | null>;
    whenDbReady?: () => Promise<void>;
    isDbReady?: () => boolean;
    concurrency?: number;
  }
): Promise<{ groups: BusinessPinGroupView[]; markers: CalendarMapRecord[] }> {
  const whenDbReady = options?.whenDbReady ?? (() => scheduleDeferredIndiaPincodeWarm(500));
  const isDbReady = options?.isDbReady ?? isIndiaPincodeOfflineLookupReady;
  const resolveCentroid = options?.resolveCentroid ?? resolvePinCentroid;
  if (groups.some((group) => group.valid)) {
    await whenDbReady();
  }
  if (!isDbReady()) {
    return { groups: groups.map((group) => ({ ...group, records: [...group.records] })), markers: [] };
  }
  const centroids = await lookupPinCentroidsBounded(
    groups.filter((group) => group.valid).map((group) => group.pinCode),
    resolveCentroid,
    options?.concurrency ?? PIN_LOOKUP_CONCURRENCY
  );
  const plotted = applyPinCentroids(groups, centroids).map((group) => {
    if (group.latitude == null || group.longitude == null) return group;
    return {
      ...group,
      records: group.records.map((record) => ({
        ...record,
        location: {
          latitude: group.latitude as number,
          longitude: group.longitude as number,
          source: "pin_approximate" as const,
          pinCode: group.pinCode,
          postalSide: group.side,
          addressLabel: group.areaLabel,
        },
        mapFootprintSource: "pin_approximate" as const,
      })),
    };
  });
  const markers = plotted.flatMap((group) => group.records.filter((record) => record.location));
  return { groups: plotted, markers };
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

/** PIN markers when the offline DB is already ready. Does not cold-start it. */
export async function buildPinMapMarkersAsync(
  data: CalendarMapsSourceData,
  t: TFn
): Promise<{ markers: CalendarMapRecord[]; groups: BusinessPinGroupView[]; stats: MapMarkerBuildStats }> {
  const groups = buildBusinessPinGroupsSync(data, t);
  const plotted = await plotBusinessPinGroups(groups, {
    whenDbReady: async () => undefined,
    isDbReady: isIndiaPincodeOfflineLookupReady,
  });
  return { markers: plotted.markers, groups: plotted.groups, stats: markerStats(plotted.markers) };
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
