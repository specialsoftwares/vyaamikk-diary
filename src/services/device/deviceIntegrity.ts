/**
 * Device integrity abstraction — fail closed when detection is inconclusive.
 * Does not claim perfect root/jailbreak detection.
 *
 * Soft-audit: package.json has no Play Integrity / App Attest / jailbreak SDK.
 * Do not add random npm deps. Until a vetted SDK is wired, `probeDeviceIntegrity`
 * returns `unavailable` and login stays blocked (fail-closed). Tests may inject
 * `deviceIntegrity.testAdapter.ts` — never use that adapter in production paths.
 */

export type DeviceIntegrityVerdict =
  | "trusted"
  | "compromised"
  | "inconclusive"
  | "unavailable";

export interface DeviceIntegrityResult {
  verdict: DeviceIntegrityVerdict;
  reason: string;
  /** Honest limitation note for operators. */
  limitation: string;
}

/**
 * Placeholder probe — production should plug Play Integrity / App Attest /
 * jailbreak detectors. Until wired, returns `unavailable` so login can fail closed.
 */
export async function probeDeviceIntegrity(): Promise<DeviceIntegrityResult> {
  // Expo Go / local-mock: allow development without claiming integrity.
  if (process.env.EXPO_PUBLIC_SKIP_DEVICE_INTEGRITY === "1") {
    return {
      verdict: "trusted",
      reason: "Explicit EXPO_PUBLIC_SKIP_DEVICE_INTEGRITY=1",
      limitation: "Skip flag is development-only and must never ship enabled in production.",
    };
  }
  return {
    verdict: "unavailable",
    reason: "Integrity SDK not configured in this build",
    limitation:
      "Root/jailbreak detection is best-effort. False positives/negatives are possible. " +
      "When unavailable or inconclusive, login is blocked until detection succeeds.",
  };
}

export function isLoginAllowedByIntegrity(result: DeviceIntegrityResult): boolean {
  return result.verdict === "trusted";
}

export const DEVICE_INTEGRITY_BLOCK_MESSAGE =
  "This device does not meet Vyaamikk Diary security requirements. " +
  "Rooted or jailbroken devices cannot sign in. Tap Retry Detection or Contact Support.";
