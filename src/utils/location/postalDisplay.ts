import type { IndianPostalLocation } from "@/domain/indianPostal";

function part(...values: (string | null | undefined)[]): string[] {
  return values.map((v) => v?.trim()).filter((v): v is string => Boolean(v));
}

/** Short label: locality → district, state. */
export function buildPostalDisplayLabel(loc: Partial<IndianPostalLocation>): string | null {
  if (loc.displayLabel?.trim()) return loc.displayLabel.trim();
  const locality = loc.locality?.trim();
  const district = loc.district?.trim();
  const state = loc.state?.trim();
  if (locality && district && state) return `${locality}, ${district}, ${state}`;
  if (district && state) return `${district}, ${state}`;
  if (locality && state) return `${locality}, ${state}`;
  if (district) return district;
  if (state) return state;
  return null;
}

/** Full saved location string for legacy `deliveryLocation` / `destination` fields. */
export function formatPostalLocationLine(loc: IndianPostalLocation): string {
  const pin = loc.pinCode.trim();
  const place = loc.placeName?.trim();
  const area = buildPostalDisplayLabel(loc);
  const segments = part(place, area);
  const head = segments.length ? segments.join(", ") : area ?? "";
  if (head && pin) return `${head} - ${pin}`;
  if (head) return head;
  return pin;
}

/** Map / calendar route line: `KOTA Godown, Kota, Rajasthan - 324001` */
export function formatPostalRouteLine(
  _side: "from" | "to",
  loc: IndianPostalLocation | null | undefined,
  legacyFallback: string | null | undefined
): string | null {
  if (loc?.pinCode) return formatPostalLocationLine(loc);
  return legacyFallback?.trim() || null;
}

export function formatPostalRoutePrefix(
  side: "from" | "to",
  line: string | null,
  t: (k: string) => string
): string | null {
  if (!line) return null;
  const prefix = side === "from" ? t("postal.routeFrom") : t("postal.routeTo");
  return `${prefix}: ${line}`;
}

/** Compact PDF line: `KOTA Godown, Kota, Rajasthan - 324001` */
export function formatPostalPdfLine(
  label: string,
  loc: IndianPostalLocation | null | undefined,
  legacyFallback: string | null | undefined
): string | null {
  const line = loc?.pinCode ? formatPostalLocationLine(loc) : legacyFallback?.trim();
  if (!line) return null;
  return `${label}: ${line}`;
}

export function postalLocationHasContent(
  loc: IndianPostalLocation | null | undefined
): boolean {
  if (!loc) return false;
  return Boolean(
    loc.pinCode?.trim() ||
      loc.placeName?.trim() ||
      loc.locality?.trim() ||
      loc.district?.trim() ||
      loc.state?.trim()
  );
}
