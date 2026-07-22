/**
 * Deterministic device-integrity adapter for unit/integration tests.
 *
 * Soft-audit (package.json): no Play Integrity / App Attest / jailbreak SDK is
 * declared. Do NOT add random npm deps. Production remains fail-closed via
 * `probeDeviceIntegrity()` in deviceIntegrity.ts until a vetted SDK is wired.
 */

import type { DeviceIntegrityResult, DeviceIntegrityVerdict } from "./deviceIntegrity";

const LIMITATION =
  "Test adapter only. Production must use a real integrity SDK and stay fail-closed when unavailable.";

export function createDeterministicIntegrityAdapter(
  verdict: DeviceIntegrityVerdict,
  reason = `deterministic:${verdict}`
): () => Promise<DeviceIntegrityResult> {
  return async () => ({
    verdict,
    reason,
    limitation: LIMITATION,
  });
}

/** Convenience map for matrix tests. */
export const DETERMINISTIC_INTEGRITY_CASES: Record<DeviceIntegrityVerdict, DeviceIntegrityVerdict> = {
  trusted: "trusted",
  compromised: "compromised",
  inconclusive: "inconclusive",
  unavailable: "unavailable",
};
