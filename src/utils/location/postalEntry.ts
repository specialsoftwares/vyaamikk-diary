import type { IndianPostalLocation } from "@/domain/indianPostal";
import {
  formatPostalLocationLine,
  formatPostalRouteLine,
  formatPostalRoutePrefix,
} from "@/utils/location/postalDisplay";
import { parseIndianPostalFromStored } from "@/utils/location/postalForm";

export function postalFromPayload(raw: unknown): IndianPostalLocation | null {
  return parseIndianPostalFromStored(raw);
}

export function postalRouteDisplay(
  side: "from" | "to",
  postal: IndianPostalLocation | null | undefined,
  legacy: string | null | undefined,
  t: (k: string) => string
): string | null {
  const line = formatPostalRouteLine(side, postal, legacy);
  if (!line) return null;
  return formatPostalRoutePrefix(side, line, t) ?? line;
}

export function postalSearchParts(loc: IndianPostalLocation | null | undefined): string[] {
  if (!loc) return [];
  return [
    loc.pinCode,
    loc.placeName,
    loc.locality,
    loc.district,
    loc.state,
    loc.displayLabel,
    loc.pinCode ? formatPostalLocationLine(loc) : null,
  ].filter((s): s is string => typeof s === "string" && s.length > 0);
}

/** Cluster / calendar header: manual place → area label → legacy text. */
export function postalClusterLabel(
  postal: IndianPostalLocation | null | undefined,
  legacy: string | null | undefined
): string | null {
  if (postal?.placeName?.trim()) {
    const area = postal.displayLabel ?? [postal.locality, postal.district, postal.state].filter(Boolean).join(", ");
    const pin = postal.pinCode?.trim();
    if (area && pin) return `${postal.placeName.trim()}, ${area} - ${pin}`;
    return postal.placeName.trim();
  }
  if (postal?.pinCode) return formatPostalLocationLine(postal);
  return legacy?.trim() || null;
}
