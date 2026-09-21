import AsyncStorage from "@react-native-async-storage/async-storage";

/** `'true'` or `'false'` once answered. Missing key means the modal has not been shown. */
export const TELEMETRY_CONSENT_KEY = "vyd_telemetry_consent_v1";

export async function readTelemetryConsent(): Promise<boolean | null> {
  try {
    const raw = await AsyncStorage.getItem(TELEMETRY_CONSENT_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return null;
  } catch {
    return null;
  }
}

export async function writeTelemetryConsent(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(TELEMETRY_CONSENT_KEY, enabled ? "true" : "false");
}
