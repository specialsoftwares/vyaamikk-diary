import * as Location from "expo-location";

import { locationService } from "@/services/location";
import { resolveIndianPincode } from "@/services/location/pincodeResolver";

import { detectPinForField, type DetectPinRequest, type DetectPinResult } from "./detectMyPin";

/**
 * Device wiring for one explicit Detect my PIN tap.
 * Foreground permission and one position read only. No watcher, no background
 * permission, and no record text is sent to the geocoder.
 */
export async function detectMyPinOnDevice(request: DetectPinRequest): Promise<DetectPinResult> {
  return detectPinForField(request, {
    requestPermission: () => locationService.requestPermission(),
    getCurrent: async () => {
      const point = await locationService.getCurrent();
      return {
        latitude: point.latitude,
        longitude: point.longitude,
        accuracy: point.accuracy,
      };
    },
    reversePostalCode: async (point) => {
      const rows = await Location.reverseGeocodeAsync({
        latitude: point.latitude,
        longitude: point.longitude,
      });
      for (const row of rows) {
        const code = row.postalCode?.trim();
        if (code) return code;
      }
      return null;
    },
    resolvePin: async (pin) => {
      const resolution = await resolveIndianPincode(pin);
      return {
        success: resolution.success,
        locality: resolution.defaultLocality,
        district: resolution.district,
        state: resolution.state,
      };
    },
  });
}
