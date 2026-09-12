/**
 * Interactive PIN lookup generation guard + autofill provenance.
 *
 * Callers share one lookup instance (useRef) so PIN A → PIN B cannot let A's
 * late response overwrite B. Pass resolveIndianPincode from the interactive
 * resolver — this module stays free of react-native so Node tests can run it.
 *
 * Autofill: latest PIN is authoritative for empty / previously auto-filled
 * values. A genuine manual edit for the current PIN is preserved. A leftover
 * manual/saved value from a different PIN is replaced.
 */

import type { PincodeResolution } from "@/domain/indianPostal";

export type PincodeResolveFn = (pin: string) => Promise<PincodeResolution>;

export type PinAutofillProvenance = "empty" | "auto" | "manual";

export interface PinAutofillFieldState {
  provenance: PinAutofillProvenance;
  /** PIN associated with the current field value, if any. */
  pinWhenSet: string | null;
}

export const EMPTY_PIN_AUTOFILL: PinAutofillFieldState = {
  provenance: "empty",
  pinWhenSet: null,
};

export function pinAutofillStateFromLoaded(
  value: string,
  pin: string
): PinAutofillFieldState {
  const v = value.trim();
  const p = pin.trim();
  if (!v) return { ...EMPTY_PIN_AUTOFILL };
  return { provenance: "manual", pinWhenSet: p || null };
}

export function pinAutofillStateAfterUserEdit(
  value: string,
  pin: string
): PinAutofillFieldState {
  if (!value.trim()) return { ...EMPTY_PIN_AUTOFILL };
  return { provenance: "manual", pinWhenSet: pin.trim() || null };
}

/**
 * Apply a current (non-stale) PIN lookup to one editable city/state field.
 * Does not implement first-fill-wins: a new PIN replaces auto-fill and
 * values left over from a previous PIN.
 */
export function applyLatestPinAutofill(input: {
  current: string;
  resolved: string | null | undefined;
  pin: string;
  field: PinAutofillFieldState;
}): { value: string; field: PinAutofillFieldState } {
  const resolved = (input.resolved ?? "").trim();
  const pin = input.pin.trim();
  if (!resolved) {
    return { value: input.current, field: input.field };
  }
  const preserveManualForThisPin =
    input.field.provenance === "manual" &&
    Boolean(input.current.trim()) &&
    input.field.pinWhenSet === pin;
  if (preserveManualForThisPin) {
    return { value: input.current, field: input.field };
  }
  return {
    value: resolved,
    field: { provenance: "auto", pinWhenSet: pin },
  };
}

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
