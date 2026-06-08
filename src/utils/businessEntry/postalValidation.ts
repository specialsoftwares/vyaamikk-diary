import { z } from "zod";

import { isValidIndianPincode, normalizeIndianPinInput } from "@/services/location/pincodeResolver";
import {
  legacyLocationFromPostalForm,
  type PostalFieldPrefix,
} from "@/utils/location/postalForm";

export const postalPinField = () => z.string().optional().default("");
export const postalTextField = () => z.string().optional().default("");

export function postalFormShape(prefix: PostalFieldPrefix): Record<string, z.ZodTypeAny> {
  return {
    [postalField(prefix, "Pin")]: postalPinField(),
    [postalField(prefix, "PlaceName")]: postalTextField(),
    [postalField(prefix, "Locality")]: postalTextField(),
    [postalField(prefix, "District")]: postalTextField(),
    [postalField(prefix, "State")]: postalTextField(),
    [postalField(prefix, "DisplayLabel")]: postalTextField(),
  };
}

function postalField(prefix: PostalFieldPrefix, suffix: string): string {
  return `${prefix}${suffix}`;
}

export function refinePostalPin(
  values: Record<string, unknown>,
  prefix: PostalFieldPrefix,
  ctx: z.RefinementCtx,
  pathKey = postalField(prefix, "Pin")
): void {
  const pin = normalizeIndianPinInput(String(values[postalField(prefix, "Pin")] ?? ""));
  if (pin.length === 0) return;
  if (pin.length < 6 || !isValidIndianPincode(pin)) {
    ctx.addIssue({
      code: "custom",
      message: "postal.invalidPin",
      path: [pathKey],
    });
  }
}

export function refineRequiredPostalLine(
  values: Record<string, unknown>,
  prefix: PostalFieldPrefix,
  legacyKey: string,
  ctx: z.RefinementCtx,
  messageKey: string
): void {
  const line =
    legacyLocationFromPostalForm(prefix, values).trim() ||
    String(values[legacyKey] ?? "").trim();
  if (!line) {
    ctx.addIssue({
      code: "custom",
      message: messageKey,
      path: [legacyKey],
    });
  }
}
