/**
 * Firebase App Check client entry.
 *
 * The startup coordinator initialises this once, before Firestore or Cloud
 * Functions, via initializeAppCheckLayer:
 *   Android production → Play Integrity
 *   iOS production → App Attest with DeviceCheck fallback
 *   Development → debug provider
 * Failure is reported and does not block startup. Enforcement is a Firebase
 * Console setting, not a client or Cloud Functions code change.
 *
 * Do not call initializeAppCheck a second time from the root layout. A repeat
 * native init throws on device.
 */
export { initializeAppCheckLayer as initialiseAppCheck } from "./bootstrap";
