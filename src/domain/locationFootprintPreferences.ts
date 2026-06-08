/** App-level location footprint preference (per user, device-local). */
export type LocationFootprintPermissionStatus =
  | "granted"
  | "denied"
  | "blocked"
  | "unknown";

export interface LocationFootprintPreferences {
  locationFootprintsEnabled: boolean;
  locationPermissionStatus: LocationFootprintPermissionStatus;
  locationConsentShownAt: number | null;
  locationConsentAcceptedAt: number | null;
  locationConsentDeclinedAt: number | null;
  lastLocationCaptureAt: number | null;
}

export const DEFAULT_LOCATION_FOOTPRINT_PREFERENCES: LocationFootprintPreferences =
  {
    locationFootprintsEnabled: false,
    locationPermissionStatus: "unknown",
    locationConsentShownAt: null,
    locationConsentAcceptedAt: null,
    locationConsentDeclinedAt: null,
    lastLocationCaptureAt: null,
  };
