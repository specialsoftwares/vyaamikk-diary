/**
 * Foreground-only location service.
 *
 * Rules (per product spec):
 *   - Never request location on first launch.
 *   - Always show a rationale modal BEFORE calling the native permission popup.
 *   - Never request background location in V1.
 *   - Never call this "tracking" or attach location silently.
 */

import * as Location from "expo-location";

import { AppError } from "@/domain/errors";
import type { GeoPoint } from "@/domain/types";
import { createLogger } from "@/utils/logger";

const log = createLogger("location");

export type LocationPermissionStatus = "granted" | "denied" | "undetermined";

export const locationService = {
  async getPermissionStatus(): Promise<LocationPermissionStatus> {
    try {
      const r = await Location.getForegroundPermissionsAsync();
      if (r.status === "granted") return "granted";
      if (r.canAskAgain === false) return "denied";
      return r.status === "denied" ? "denied" : "undetermined";
    } catch (e) {
      log.warn("getPermissionStatus failed", e);
      return "undetermined";
    }
  },

  /**
   * Triggers the native permission popup. Callers MUST present a rationale
   * UI first (see PermissionRationaleModal) so this isn't a surprise.
   */
  async requestPermission(): Promise<LocationPermissionStatus> {
    try {
      const r = await Location.requestForegroundPermissionsAsync();
      if (r.status === "granted") return "granted";
      return r.canAskAgain === false ? "denied" : "denied";
    } catch (e) {
      log.warn("requestPermission failed", e);
      return "denied";
    }
  },

  /**
   * Get a single foreground location reading. Throws AppError on failure
   * so callers can surface a clean user message.
   */
  async getCurrent(): Promise<GeoPoint> {
    let status: LocationPermissionStatus;
    try {
      status = await this.getPermissionStatus();
    } catch {
      status = "undetermined";
    }
    if (status !== "granted") {
      throw new AppError("permission_denied", "Location permission not granted.");
    }
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy:
          typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : null,
        capturedAt: pos.timestamp ?? Date.now(),
      };
    } catch (e) {
      log.warn("getCurrent failed", e);
      throw new AppError("unknown", "Could not get your current location.");
    }
  },
};
