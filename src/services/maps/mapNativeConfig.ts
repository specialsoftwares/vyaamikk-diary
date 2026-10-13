/**
 * Android MapView crashes the process when the manifest has no
 * com.google.android.geo.API_KEY. Do not mount the native view in that case.
 * The key value is never logged.
 */

export function androidGoogleMapsApiKeyConfigured(apiKey: string | null | undefined): boolean {
  return typeof apiKey === "string" && apiKey.trim().length > 0;
}

export function mayMountNativeMapView(input: {
  platform: string;
  androidApiKey: string | null | undefined;
}): boolean {
  if (input.platform !== "android") return true;
  return androidGoogleMapsApiKeyConfigured(input.androidApiKey);
}
