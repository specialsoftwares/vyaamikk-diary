/**
 * Lightweight coordinate bucketing for map markers (no native clustering SDK).
 * Future: react-native-map-clustering or supercluster when scale requires it.
 */

import type { CalendarMapRecord } from "./calendarMapsTypes";

/** ~11 m precision at equator — groups same-building footprints. */
const CLUSTER_DECIMALS = 4;

export interface MapLocationCluster {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  records: CalendarMapRecord[];
  /** Dominant footprint at this bucket (GPS vs PIN kept separate). */
  footprintSource: import("./calendarMapsTypes").MapFootprintSource;
}

function bucketKey(record: CalendarMapRecord): string {
  const loc = record.location!;
  return `${loc.source}:${loc.latitude.toFixed(CLUSTER_DECIMALS)},${loc.longitude.toFixed(CLUSTER_DECIMALS)}`;
}

export function buildMapLocationClusters(markers: CalendarMapRecord[]): MapLocationCluster[] {
  const buckets = new Map<string, CalendarMapRecord[]>();

  for (const record of markers) {
    if (!record.location) continue;
    const key = bucketKey(record);
    const list = buckets.get(key) ?? [];
    list.push(record);
    buckets.set(key, list);
  }

  const clusters: MapLocationCluster[] = [];
  for (const [id, records] of buckets) {
    let latSum = 0;
    let lngSum = 0;
    for (const r of records) {
      latSum += r.location!.latitude;
      lngSum += r.location!.longitude;
    }
    const n = records.length;
    clusters.push({
      id,
      latitude: latSum / n,
      longitude: lngSum / n,
      count: n,
      records,
      footprintSource: records[0].location!.source,
    });
  }

  return clusters;
}
