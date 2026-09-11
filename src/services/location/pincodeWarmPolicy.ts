/**
 * Policy for when the offline india-pincode DB may be warmed / queried.
 * Kept free of react-native imports so unit tests run under tsx/Node.
 */

/**
 * Calendar / You / Settings tab mount must never start the offline DB.
 * NativeTabs keeps all tab screens alive (freezeContents=false); warming on
 * Calendar mount previously froze every JS Pressable after login.
 */
export function shouldWarmIndiaPincodeOnCalendarTabMount(): boolean {
  return false;
}

/**
 * Interactive Identity PIN lookup may use the offline DB only after it is
 * already fully ready. Cold-starting decompress/parse on the JS thread freezes
 * Camera, Gallery, and the PIN confirmation UI for seconds to minutes.
 */
export function shouldQueryOfflinePincodeOnInteractivePath(offlineReady: boolean): boolean {
  return offlineReady === true;
}

/**
 * Interactive PIN lookup (Identity / review-edit) must not start the offline DB
 * after a successful API hit. Decompressing ~165k post offices on the JS thread
 * freezes Pressables for seconds to minutes — Continue, Back, and keyboard
 * dismissal all look dead while the Confirmed card is already on screen.
 * Map mode still warms via `scheduleDeferredIndiaPincodeWarm` directly.
 */
export function shouldScheduleOfflinePincodeWarmAfterInteractiveLookup(): boolean {
  return false;
}
