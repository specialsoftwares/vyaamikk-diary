import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";

import {
  DEFAULT_LOCATION_FOOTPRINT_PREFERENCES,
  type LocationFootprintPermissionStatus,
  type LocationFootprintPreferences,
} from "@/domain/locationFootprintPreferences";

const PREFIX = "vyd_location_footprints_v1_";

function key(userId: string): string {
  return `${PREFIX}${userId}`;
}

export async function loadLocationFootprintPreferences(
  userId: string
): Promise<LocationFootprintPreferences> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    if (!raw) return { ...DEFAULT_LOCATION_FOOTPRINT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<LocationFootprintPreferences>;
    return {
      ...DEFAULT_LOCATION_FOOTPRINT_PREFERENCES,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_LOCATION_FOOTPRINT_PREFERENCES };
  }
}

export async function saveLocationFootprintPreferences(
  userId: string,
  patch: Partial<LocationFootprintPreferences>
): Promise<LocationFootprintPreferences> {
  const current = await loadLocationFootprintPreferences(userId);
  const next = { ...current, ...patch };
  await AsyncStorage.setItem(key(userId), JSON.stringify(next));
  return next;
}

export async function clearLocationFootprintPreferences(userId: string): Promise<void> {
  await AsyncStorage.removeItem(key(userId));
}

export function mapExpoPermissionToFootprintStatus(
  status: Location.PermissionStatus,
  canAskAgain: boolean
): LocationFootprintPermissionStatus {
  if (status === "granted") return "granted";
  if (!canAskAgain) return "blocked";
  if (status === "denied") return "denied";
  return "unknown";
}

/** Refresh stored OS permission snapshot (foreground only). */
export async function syncLocationFootprintPermissionStatus(
  userId: string
): Promise<LocationFootprintPermissionStatus> {
  try {
    const r = await Location.getForegroundPermissionsAsync();
    const mapped = mapExpoPermissionToFootprintStatus(r.status, r.canAskAgain);
    await saveLocationFootprintPreferences(userId, {
      locationPermissionStatus: mapped,
    });
    return mapped;
  } catch {
    return "unknown";
  }
}

export async function shouldShowLocationFootprintConsent(
  userId: string
): Promise<boolean> {
  const prefs = await loadLocationFootprintPreferences(userId);
  const shownAt = prefs.locationConsentShownAt;
  // Defensive: only a finite timestamp counts as "already shown". Corrupt
  // upgrade leftovers (non-number) must not leave the host oscillating or
  // permanently suppressing a dismissible sheet incorrectly.
  if (typeof shownAt === "number" && Number.isFinite(shownAt) && shownAt > 0) {
    return false;
  }
  return true;
}

export async function markLocationFootprintConsentShown(
  userId: string
): Promise<void> {
  await saveLocationFootprintPreferences(userId, {
    locationConsentShownAt: Date.now(),
  });
}
