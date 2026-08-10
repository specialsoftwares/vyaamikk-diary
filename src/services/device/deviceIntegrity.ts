/**
 * Device integrity policy abstraction — DORMANT until a vetted SDK is wired.
 *
 * Soft-audit: package.json has no Play Integrity / App Attest / jailbreak SDK.
 * `probeDeviceIntegrity` is NOT called from AuthFlowGate / login today.
 * Do not document or claim that login is fail-closed on integrity.
 *
 * When an approved SDK is configured externally, wire probe results through
 * `isLoginAllowedByIntegrity` deliberately — never enable fail-closed while
 * the probe always returns `unavailable`.
 *
 * Tests may inject `deviceIntegrity.testAdapter.ts` — never use that adapter
 * in production paths.
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
  /** True until an SDK is registered and login is intentionally gated. Defaults treated as dormant when omitted in older call sites. */
  dormant?: boolean;
}

/**
 * Placeholder probe. Returns `unavailable` + dormant=true until an SDK exists.
 * Login must NOT treat this as a hard block while dormant.
 */
export async function probeDeviceIntegrity(): Promise<DeviceIntegrityResult> {
  if (process.env.EXPO_PUBLIC_SKIP_DEVICE_INTEGRITY === "1") {
    return {
      verdict: "trusted",
      reason: "Explicit EXPO_PUBLIC_SKIP_DEVICE_INTEGRITY=1",
      limitation: "Skip flag is development-only and must never ship enabled in production.",
      dormant: true,
    };
  }
  return {
    verdict: "unavailable",
    reason: "Integrity SDK not configured; probe is dormant and not wired into login",
    limitation:
      "Root/jailbreak detection is best-effort and not installed. " +
      "Do not fail-closed login on unavailable until Play Integrity / App Attest " +
      "(or an approved equivalent) is registered and this probe is intentionally enforced.",
    dormant: true,
  };
}

/**
 * Enforcement helper for a future wired check.
 * While probes are dormant/unavailable, callers must not block login.
 */
export function isLoginAllowedByIntegrity(result: DeviceIntegrityResult): boolean {
  if (result.dormant || result.verdict === "unavailable") {
    // Dormant / unconfigured: do not block authentication.
    return true;
  }
  return result.verdict === "trusted";
}

export const DEVICE_INTEGRITY_BLOCK_MESSAGE =
  "This device does not meet Vyaamikk Diary security requirements. " +
  "Rooted or jailbroken devices cannot sign in. Tap Retry Detection or Contact Support.";
