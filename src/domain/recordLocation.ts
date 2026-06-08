/**
 * Opt-in GPS footprint on business records (foreground capture only).
 * Manual site/place text lives in `EntryLocation.name` and payload fields.
 */

export type LocationCaptureSource = "device" | "manual";

export type LocationPermissionSnapshot = "granted" | "denied" | "limited" | "unknown";

/** User-requested GPS attachment — DPDP-sensitive; never log raw coords in production. */
export interface RecordGpsLocation {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  addressLabel?: string | null;
  capturedAt: string;
  source: LocationCaptureSource;
  permissionSnapshot?: LocationPermissionSnapshot;
}
