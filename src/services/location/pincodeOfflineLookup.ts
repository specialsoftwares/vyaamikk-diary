/**
 * Single shared instance of the india-pincode offline DB loader.
 *
 * Loading decompresses + parses ~165k post-office records on the JS thread
 * (typically multi-second on device, previously measured ~50s on Expo Go).
 * That work must NEVER start from post-login tab mount — NativeTabs renders
 * all tab screens with freezeContents={false}, so Calendar mount used to
 * schedule this warm and freeze every JS Pressable while the native tab bar
 * stayed responsive.
 *
 * Warm only when Map mode is opened or a form explicitly resolves a PIN.
 */

import { InteractionManager } from "react-native";
import { getIndiaPincode } from "india-pincode/browser";

export { shouldWarmIndiaPincodeOnCalendarTabMount } from "./pincodeWarmPolicy";

let lookupPromise: ReturnType<typeof getIndiaPincode> | null = null;
let lookupReady = false;
let deferredWarmScheduled = false;

/** True once a load has been started (in flight or complete). */
export function isIndiaPincodeLookupStarted(): boolean {
  return lookupPromise != null;
}

/**
 * True only after the offline DB has finished decompressing/parsing.
 * Interactive PIN lookup must NOT cold-start the DB — that work blocks the JS
 * thread for seconds/minutes and freezes Camera/Gallery/Pressables.
 */
export function isIndiaPincodeOfflineLookupReady(): boolean {
  return lookupReady;
}

/** Test-only reset. */
export function resetIndiaPincodeOfflineLookupForTests(): void {
  lookupPromise = null;
  lookupReady = false;
  deferredWarmScheduled = false;
}

/** Start loading the offline PIN DB (idempotent). Call only on demand. */
export function warmIndiaPincodeOfflineLookup(): void {
  void getSharedIndiaPincodeOfflineLookup();
}

/**
 * Warm after interactions + idle delay — for Map mode / post-response only.
 * Never call from Calendar-only / post-login tab mount.
 * Never await this from the interactive PIN path.
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
    lookupPromise = getIndiaPincode()
      .then((db) => {
        lookupReady = true;
        return db;
      })
      .catch((err) => {
        lookupPromise = null;
        lookupReady = false;
        throw err;
      });
  }
  return lookupPromise;
}
