/**
 * Android ActivityResultLauncher readiness for expo-image-picker.
 *
 * Play vc14: launchImageLibraryAsync was rejected with
 * IllegalStateException: Attempting to launch an unregistered ActivityResultLauncher.
 * That happens when launch runs before the current Activity has re-registered
 * the picker contract (permission dialog, navigation replace, or overlapping
 * launches) — not because Expo Go lacked the module.
 */

export type PickerHostAppState = "active" | "background" | "inactive" | "unknown" | string;

/** Android Photo Picker does not need READ_MEDIA / storage permission. */
export function shouldRequestMediaLibraryPermissionBeforeLaunch(
  platform: "ios" | "android" | "web" | string
): boolean {
  return platform === "ios";
}

/**
 * Launcher is registered while the host Activity is resumed.
 * Launching during inactive/background (permission sheet, transition) is the
 * unregistered-launcher failure class.
 */
export function pickerHostIsReady(appState: PickerHostAppState): boolean {
  return appState === "active";
}

export function shouldDeferPickerLaunch(appState: PickerHostAppState): boolean {
  return !pickerHostIsReady(appState);
}

/** Single-flight: a second Choose logo must not launch another contract. */
export function canStartPickerInvocation(inFlight: boolean): boolean {
  return !inFlight;
}

export function isPickerCancelError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const reason = "reason" in error ? String((error as { reason?: unknown }).reason) : "";
  const message = error instanceof Error ? error.message : String(error);
  return reason === "cancelled" || /cancel/i.test(message);
}
