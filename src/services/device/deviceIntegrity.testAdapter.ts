/**
 * Deterministic device-integrity adapter for unit/integration tests.
 *
 * Soft-audit (package.json): no Play Integrity / App Attest / jailbreak SDK is
 * declared. Do NOT add random npm deps. Production probe remains dormant until
 * a vetted SDK is wired — do not claim fail-closed login today.
 */

import type { DeviceIntegrityResult, DeviceIntegrityVerdict } from "./deviceIntegrity";

const LIMITATION =
  "Test adapter only. Production probe is dormant until a real integrity SDK is wired.";

export function createDeterministicIntegrityAdapter(
  verdict: DeviceIntegrityVerdict,
  reason = `deterministic:${verdict}`
): () => Promise<DeviceIntegrityResult> {
  return async () => ({
    verdict,
    reason,
    limitation: LIMITATION,
    // Test adapters simulate an active (non-dormant) enforcement path.
    dormant: false,
  });
}

/** Convenience map for matrix tests. */
export const DETERMINISTIC_INTEGRITY_CASES: Record<DeviceIntegrityVerdict, DeviceIntegrityVerdict> = {
  trusted: "trusted",
  compromised: "compromised",
  inconclusive: "inconclusive",
  unavailable: "unavailable",
};
