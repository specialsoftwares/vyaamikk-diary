import type { IndianPostalLocation } from "@/domain/indianPostal";
import { normalizeIndianPinInput } from "@/services/location/pincodeResolver";
import { buildPostalDisplayLabel, formatPostalLocationLine } from "@/utils/location/postalDisplay";

export type PostalFieldPrefix =
  | "deliveryTo"
  | "dispatchFrom"
  | "receivedAt"
  | "party";

export function postalFormField(prefix: PostalFieldPrefix, suffix: string): string {
  return `${prefix}${suffix}`;
}

const SUFFIX = {
  pin: "Pin",
  placeName: "PlaceName",
  locality: "Locality",
  district: "District",
  state: "State",
  displayLabel: "DisplayLabel",
} as const;

export function postalFormDefaults(prefix: PostalFieldPrefix): Record<string, string> {
  return {
    [postalFormField(prefix, SUFFIX.pin)]: "",
    [postalFormField(prefix, SUFFIX.placeName)]: "",
    [postalFormField(prefix, SUFFIX.locality)]: "",
    [postalFormField(prefix, SUFFIX.district)]: "",
    [postalFormField(prefix, SUFFIX.state)]: "",
    [postalFormField(prefix, SUFFIX.displayLabel)]: "",
  };
}

export function buildIndianPostalFromForm(
  prefix: PostalFieldPrefix,
  values: Record<string, unknown>
): IndianPostalLocation | null {
  const pin = normalizeIndianPinInput(String(values[postalFormField(prefix, SUFFIX.pin)] ?? ""));
  if (pin.length !== 6) return null;
  const placeName = String(values[postalFormField(prefix, SUFFIX.placeName)] ?? "").trim() || null;
  const locality = String(values[postalFormField(prefix, SUFFIX.locality)] ?? "").trim() || null;
  const district = String(values[postalFormField(prefix, SUFFIX.district)] ?? "").trim() || null;
  const state = String(values[postalFormField(prefix, SUFFIX.state)] ?? "").trim() || null;
  const loc: IndianPostalLocation = {
    pinCode: pin,
    placeName,
    locality,
    district,
    state,
    country: "India",
    displayLabel: null,
  };
  loc.displayLabel = buildPostalDisplayLabel(loc);
  if (!loc.displayLabel && !placeName && !locality && !district && !state) return null;
  return loc;
}

export function indianPostalToFormDefaults(
  prefix: PostalFieldPrefix,
  loc: IndianPostalLocation | null | undefined
): Record<string, string> {
  if (!loc) return postalFormDefaults(prefix);
  return {
    [postalFormField(prefix, SUFFIX.pin)]: loc.pinCode ?? "",
    [postalFormField(prefix, SUFFIX.placeName)]: loc.placeName ?? "",
    [postalFormField(prefix, SUFFIX.locality)]: loc.locality ?? "",
    [postalFormField(prefix, SUFFIX.district)]: loc.district ?? "",
    [postalFormField(prefix, SUFFIX.state)]: loc.state ?? "",
    [postalFormField(prefix, SUFFIX.displayLabel)]: loc.displayLabel ?? buildPostalDisplayLabel(loc) ?? "",
  };
}

/** Sync legacy single-line location fields from postal form values. */
export function legacyLocationFromPostalForm(
  prefix: PostalFieldPrefix,
  values: Record<string, unknown>
): string {
  const loc = buildIndianPostalFromForm(prefix, values);
  if (loc) return formatPostalLocationLine(loc);
  const place = String(values[postalFormField(prefix, SUFFIX.placeName)] ?? "").trim();
  const district = String(values[postalFormField(prefix, SUFFIX.district)] ?? "").trim();
  const state = String(values[postalFormField(prefix, SUFFIX.state)] ?? "").trim();
  const pin = normalizeIndianPinInput(String(values[postalFormField(prefix, SUFFIX.pin)] ?? ""));
  const parts = [place, district && state ? `${district}, ${state}` : district || state, pin]
    .filter(Boolean)
    .join(", ");
  return parts;
}

export function parseIndianPostalFromStored(raw: unknown): IndianPostalLocation | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const pin = typeof o.pinCode === "string" ? normalizeIndianPinInput(o.pinCode) : "";
  if (pin.length !== 6) return null;
  const loc: IndianPostalLocation = {
    pinCode: pin,
    placeName: typeof o.placeName === "string" ? o.placeName.trim() || null : null,
    locality: typeof o.locality === "string" ? o.locality.trim() || null : null,
    district: typeof o.district === "string" ? o.district.trim() || null : null,
    state: typeof o.state === "string" ? o.state.trim() || null : null,
    country: typeof o.country === "string" && o.country.trim() ? o.country.trim() : "India",
    displayLabel: typeof o.displayLabel === "string" ? o.displayLabel.trim() || null : null,
  };
  loc.displayLabel = loc.displayLabel ?? buildPostalDisplayLabel(loc);
  return loc;
}
