import { Linking } from "react-native";

import {
  isSafeExternalUrl,
  normalizeOpenableHttpsUrl,
} from "@/utils/externalHttpsUrl";

export {
  EXTERNAL_OPEN_FAILED_MESSAGE,
  isSafeExternalUrl,
  normalizeOpenableHttpsUrl,
} from "@/utils/externalHttpsUrl";

/**
 * External HTTPS opener for website / legal destinations.
 *
 * Never throws. Serializes overlapping opens (repeated taps join the in-flight
 * promise) and always clears the lock in `finally`. Uses a bound
 * `Linking.openURL` call — unbound breaks RN `_validateURL`.
 */

let inFlight: Promise<boolean> | null = null;

export async function openSafeExternalUrl(url: unknown): Promise<boolean> {
  const normalized = normalizeOpenableHttpsUrl(url);
  if (!normalized) return false;

  if (inFlight) {
    return inFlight;
  }

  const task = (async () => {
    try {
      await Linking.openURL(normalized);
      return true;
    } catch {
      return false;
    }
  })();

  inFlight = task;
  try {
    return await task;
  } finally {
    if (inFlight === task) inFlight = null;
  }
}

/** Test-only: clear the in-flight lock between cases. */
export function __resetExternalOpenInFlightForTests(): void {
  inFlight = null;
}
