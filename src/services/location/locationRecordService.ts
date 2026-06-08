import type { BusinessEntry } from "@/domain/businessEntry";
import type { RecordGpsLocation } from "@/domain/recordLocation";
import type { LocationPermissionStatus } from "@/services/location";

export function permissionSnapshotFromStatus(
  status: LocationPermissionStatus
): RecordGpsLocation["permissionSnapshot"] {
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  return "unknown";
}

/** Manual / business location label from form values (no device GPS). */
export function manualLocationLabelFromComposerValues(
  values: Record<string, unknown>
): string | null {
  const sitePlace =
    typeof values.sitePlace === "string" && values.sitePlace.trim()
      ? values.sitePlace.trim()
      : typeof values.dispatchLocation === "string" && values.dispatchLocation.trim()
        ? values.dispatchLocation.trim()
        : typeof values.receivedLocation === "string" && values.receivedLocation.trim()
          ? values.receivedLocation.trim()
          : typeof values.deliveryLocation === "string" && values.deliveryLocation.trim()
            ? String(values.deliveryLocation).trim()
            : typeof values.destination === "string" && values.destination.trim()
              ? String(values.destination).trim()
              : null;
  return sitePlace;
}

/**
 * Business location text for storage — GPS footprints are attached on save via
 * `resolveEntryLocationWithFootprint`, not from form fields.
 */
export function mergeComposerLocationWithLabel(
  values: Record<string, unknown>,
  label: string | null
): BusinessEntry["location"] {
  const name = label?.trim() || manualLocationLabelFromComposerValues(values);
  if (!name) return null;
  return { name, geo: null, gps: null };
}

export function stripGpsFromLocation(
  location: BusinessEntry["location"]
): BusinessEntry["location"] {
  if (!location) return null;
  return { name: location.name, geo: null, gps: null };
}
