/**
 * Android MapView crashes the process when the manifest has no
 * com.google.android.geo.API_KEY. Do not mount the native view unless the
 * build recorded that the key was supplied. The key itself is not read here.
 */

export function readAndroidMapsConfigured(extra: unknown): boolean {
  if (!extra || typeof extra !== "object") return false;
  return (extra as { androidGoogleMapsConfigured?: unknown }).androidGoogleMapsConfigured === true;
}

export function mayMountNativeMapView(input: {
  platform: string;
  androidMapsConfigured: boolean;
}): boolean {
  if (input.platform !== "android") return true;
  return input.androidMapsConfigured === true;
}
