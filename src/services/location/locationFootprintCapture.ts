import type { BusinessEntry } from "@/domain/businessEntry";

export interface ResolveEntryLocationResult {
  location: BusinessEntry["location"];
  footprintAttached: boolean;
  footprintFailed: boolean;
}

/**
 * New record saves do not read the device location.
 * `manualLocation` is returned as the caller passed it, including any
 * coordinates already stored on that object. This does not change the
 * Location Access setting.
 */
export async function resolveEntryLocationWithFootprint(
  _userId: string,
  manualLocation: BusinessEntry["location"]
): Promise<ResolveEntryLocationResult> {
  return {
    location: manualLocation,
    footprintAttached: false,
    footprintFailed: false,
  };
}

type EntryLocation = BusinessEntry["location"];

/** Keep coordinates already stored on a record when a later save does not capture a new fix. */
export function preserveAlreadySavedLocation(
  saved: EntryLocation | null | undefined,
  next: EntryLocation
): EntryLocation {
  if (!saved?.geo && !saved?.gps) return next;
  if (!next) {
    return { name: saved.name, geo: saved.geo, gps: saved.gps ?? null };
  }
  return {
    name: next.name ?? saved.name,
    geo: saved.geo,
    gps: saved.gps ?? null,
  };
}
