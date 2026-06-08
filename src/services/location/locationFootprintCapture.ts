import type { BusinessEntry } from "@/domain/businessEntry";
import { geoPointToRecordGps } from "@/utils/location/entryLocation";
import { locationService } from "@/services/location";

import {
  loadLocationFootprintPreferences,
  saveLocationFootprintPreferences,
  syncLocationFootprintPermissionStatus,
} from "./locationFootprintPreferences";
import { permissionSnapshotFromStatus } from "./locationRecordService";

export interface ResolveEntryLocationResult {
  location: BusinessEntry["location"];
  footprintAttached: boolean;
  footprintFailed: boolean;
}

/**
 * Foreground-only GPS footprint at save time when user has enabled footprints
 * and OS permission is granted. Never blocks save on failure.
 */
export async function resolveEntryLocationWithFootprint(
  userId: string,
  manualLocation: BusinessEntry["location"]
): Promise<ResolveEntryLocationResult> {
  const prefs = await loadLocationFootprintPreferences(userId);
  if (!prefs.locationFootprintsEnabled) {
    return { location: manualLocation, footprintAttached: false, footprintFailed: false };
  }

  const osStatus = await syncLocationFootprintPermissionStatus(userId);
  if (osStatus !== "granted") {
    return { location: manualLocation, footprintAttached: false, footprintFailed: false };
  }

  try {
    const point = await locationService.getCurrent();
    const label = manualLocation?.name?.trim() || null;
    const gps = geoPointToRecordGps(point, {
      addressLabel: label,
      source: "device",
      permissionSnapshot: permissionSnapshotFromStatus("granted"),
    });
    await saveLocationFootprintPreferences(userId, {
      lastLocationCaptureAt: Date.now(),
    });
    return {
      location: {
        name: label,
        geo: point,
        gps,
      },
      footprintAttached: true,
      footprintFailed: false,
    };
  } catch {
    return {
      location: manualLocation,
      footprintAttached: false,
      footprintFailed: true,
    };
  }
}
