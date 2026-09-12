/**
 * Interactive PIN lookup generation guard.
 *
 * Callers share one instance (useRef) so PIN A → PIN B cannot let A's late
 * response overwrite B. Pass resolveIndianPincode from the interactive
 * resolver — this module stays free of react-native so Node tests can run it.
 */

import type { PincodeResolution } from "@/domain/indianPostal";

export type PincodeResolveFn = (pin: string) => Promise<PincodeResolution>;

export function createStaleSafePincodeLookup(resolve: PincodeResolveFn): {
  lookup: (pin: string) => Promise<PincodeResolution | null>;
} {
  let generation = 0;
  return {
    async lookup(pin: string): Promise<PincodeResolution | null> {
      const id = ++generation;
      const result = await resolve(pin);
      if (id !== generation) return null;
      return result;
    },
  };
}
