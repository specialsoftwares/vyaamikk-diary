/**
 * Single shared instance of the india-pincode offline DB loader.
 * Loading is expensive (~tens of seconds on device); never start on app boot.
 */

import { InteractionManager } from "react-native";
import { getIndiaPincode } from "india-pincode/browser";

let lookupPromise: ReturnType<typeof getIndiaPincode> | null = null;
let deferredWarmScheduled = false;

/** Start loading the offline PIN DB without blocking UI (idempotent). */
export function warmIndiaPincodeOfflineLookup(): void {
  void getSharedIndiaPincodeOfflineLookup();
}

/**
 * Warm the PIN DB after interactions + idle delay — safe for tab/dashboard mount.
 * Does not block taps on You tab or the bottom bar.
 */
export function scheduleDeferredIndiaPincodeWarm(delayMs = 4000): void {
  if (deferredWarmScheduled || lookupPromise) return;
  deferredWarmScheduled = true;
  InteractionManager.runAfterInteractions(() => {
    setTimeout(() => {
      warmIndiaPincodeOfflineLookup();
    }, delayMs);
  });
}

/** Await the shared offline lookup (deduped across resolver + map coords). */
export function getSharedIndiaPincodeOfflineLookup() {
  if (!lookupPromise) {
    lookupPromise = getIndiaPincode();
  }
  return lookupPromise;
}
