import type {
  BusinessEntry,
  FreightType,
  MaterialDispatchedPayload,
  OutwardFreightPayload,
} from "@/domain/businessEntry";
import { postalRouteDisplay, postalSearchParts } from "@/utils/location/postalEntry";

import type { CalendarMapRecord } from "./calendarMapsTypes";

type TFn = (k: string, vars?: Record<string, string | number>) => string;

/** Static dispatch / freight facts for map and calendar (no live tracking). */
export interface FreightDispatchMapIntel {
  dispatchOrigin: string | null;
  deliveryLocation: string | null;
  /** Display-ready bill or challan reference, e.g. "Bill FR-12". */
  billReference: string | null;
  lrNumber: string | null;
  transporterContact: string | null;
  vehicleNumber: string | null;
  /** e.g. "12 boxes · 450 Kg" */
  loadSummary: string | null;
  freightTypeLabel: string | null;
  clarificationContact: string | null;
}

function trimOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

function joinContact(name: string | null, mobile: string | null): string | null {
  if (name && mobile) return `${name} · ${mobile}`;
  return name ?? mobile;
}

function freightTypeLabel(t: TFn, type: FreightType | undefined): string | null {
  if (!type) return null;
  const key = `composer.freightTypes.${type}`;
  const label = t(key);
  return label === key ? null : label;
}

function buildLoadSummaryFreight(p: OutwardFreightPayload, t: TFn): string | null {
  const parts: string[] = [];
  if (Number.isFinite(p.totalBoxes) && p.totalBoxes > 0) {
    parts.push(t("calendarMaps.map.dispatchIntel.boxes", { count: p.totalBoxes }));
  }
  if (Number.isFinite(p.totalWeight) && p.totalWeight > 0) {
    const unit = trimOrNull(p.weightUnit) ?? "Kg";
    parts.push(`${p.totalWeight} ${unit}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

function buildLoadSummaryDispatch(p: MaterialDispatchedPayload, t: TFn): string | null {
  const parts: string[] = [];
  if (Number.isFinite(p.quantity) && p.quantity > 0) {
    const unit = trimOrNull(p.unit);
    parts.push(unit ? `${p.quantity} ${unit}` : String(p.quantity));
  }
  return parts.length ? parts.join(" · ") : null;
}

export function buildFreightDispatchMapIntel(
  entry: BusinessEntry,
  t: TFn
): FreightDispatchMapIntel | null {
  if (entry.entryType === "outward_freight_details") {
    const p = entry.payload as OutwardFreightPayload;
    const bill = trimOrNull(p.billNumber);
    return {
      dispatchOrigin:
        postalRouteDisplay("from", p.dispatchFromPostal, p.dispatchFromLocation, t) ??
        trimOrNull(p.dispatchFromLocation),
      deliveryLocation:
        postalRouteDisplay("to", p.deliveryToPostal, p.deliveryLocation, t) ??
        trimOrNull(p.deliveryLocation) ??
        trimOrNull(entry.location?.name),
      billReference: bill ? t("calendarMaps.map.dispatchIntel.billRef", { no: bill }) : null,
      lrNumber: trimOrNull(p.lrGrNumber),
      transporterContact: trimOrNull(p.transporterName),
      vehicleNumber: trimOrNull(p.vehicleNumber),
      loadSummary: buildLoadSummaryFreight(p, t),
      freightTypeLabel: freightTypeLabel(t, p.freightType),
      clarificationContact: joinContact(
        trimOrNull(p.clarificationContactName),
        trimOrNull(p.clarificationContactMobile)
      ),
    };
  }

  if (entry.entryType === "material_dispatched") {
    const p = entry.payload as MaterialDispatchedPayload;
    const challan = trimOrNull(p.invoiceChallan);
    return {
      dispatchOrigin:
        postalRouteDisplay("from", p.dispatchFromPostal, p.dispatchLocation, t) ??
        trimOrNull(p.dispatchLocation),
      deliveryLocation:
        postalRouteDisplay("to", p.deliveryToPostal, p.destination, t) ??
        trimOrNull(p.destination),
      billReference: challan
        ? t("calendarMaps.map.dispatchIntel.challanRef", { no: challan })
        : null,
      lrNumber: trimOrNull(p.lrGrNumber),
      transporterContact: trimOrNull(p.transporter),
      vehicleNumber: trimOrNull(p.vehicleNumber),
      loadSummary: buildLoadSummaryDispatch(p, t),
      freightTypeLabel: null,
      clarificationContact: null,
    };
  }

  return null;
}

/** Origin → delivery one-liner for headers and meta. */
export function freightDispatchLocationSummary(intel: FreightDispatchMapIntel): string | null {
  const from = intel.dispatchOrigin;
  const to = intel.deliveryLocation;
  if (from && to) return `${from} → ${to}`;
  return to ?? from ?? null;
}

/** Bill/LR transport reference line. */
export function freightDispatchReferenceLine(intel: FreightDispatchMapIntel): string | null {
  const parts: string[] = [];
  if (intel.billReference) parts.push(intel.billReference);
  if (intel.lrNumber) {
    parts.push(
      intel.billReference
        ? `LR ${intel.lrNumber}`
        : intel.lrNumber
    );
  }
  return parts.length ? parts.join(" · ") : null;
}

/** Vehicle and transporter on one line when present. */
export function freightDispatchVehicleLine(intel: FreightDispatchMapIntel): string | null {
  const parts: string[] = [];
  if (intel.vehicleNumber) parts.push(intel.vehicleNumber);
  if (intel.transporterContact) parts.push(intel.transporterContact);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Compact calendar / cluster list copy (no empty segments, no field labels).
 */
export function freightDispatchCalendarSnippet(intel: FreightDispatchMapIntel): string {
  const parts: string[] = [];
  const route = freightDispatchLocationSummary(intel);
  if (route) parts.push(route);
  const ref = freightDispatchReferenceLine(intel);
  if (ref) parts.push(ref);
  const vehicle = freightDispatchVehicleLine(intel);
  if (vehicle) parts.push(vehicle);
  if (intel.loadSummary) parts.push(intel.loadSummary);
  if (intel.freightTypeLabel) parts.push(intel.freightTypeLabel);
  return parts.join(" · ");
}

/**
 * Ordered lines for map marker card — most useful first, omit blanks.
 */
export function freightDispatchMapCardLines(intel: FreightDispatchMapIntel): string[] {
  const lines: string[] = [];
  const route = freightDispatchLocationSummary(intel);
  if (route) lines.push(route);
  const ref = freightDispatchReferenceLine(intel);
  if (ref) lines.push(ref);
  const vehicle = freightDispatchVehicleLine(intel);
  if (vehicle) lines.push(vehicle);
  if (intel.loadSummary) lines.push(intel.loadSummary);
  if (intel.freightTypeLabel) lines.push(intel.freightTypeLabel);
  if (intel.clarificationContact) lines.push(intel.clarificationContact);
  return lines;
}

/** Cluster sheet header — prefer Origin → Delivery from any freight/dispatch row. */
export function clusterDispatchLocationLabel(
  records: CalendarMapRecord[],
  t?: TFn
): string | null {
  const loc0 = records[0]?.location;
  if (loc0?.source === "pin_approximate") {
    const addr = loc0.addressLabel?.trim();
    if (addr && t) return t("calendarMaps.map.pinApproximateAt", { place: addr });
    if (addr) return addr;
  }
  for (const record of records) {
    if (!record.dispatchIntel) continue;
    const summary = freightDispatchLocationSummary(record.dispatchIntel);
    if (summary) return summary;
  }
  for (const record of records) {
    const manual = record.manualLocationLabel?.trim();
    if (manual) return manual;
    const addr = record.location?.addressLabel?.trim();
    if (addr) return addr;
  }
  return null;
}

/** One-line metadata under title in multi-record cluster lists. */
export function freightDispatchClusterEntryMeta(intel: FreightDispatchMapIntel): string {
  const parts: string[] = [];
  const ref = freightDispatchReferenceLine(intel);
  if (ref) parts.push(ref);
  const vehicle = freightDispatchVehicleLine(intel);
  if (vehicle) parts.push(vehicle);
  if (intel.loadSummary) parts.push(intel.loadSummary);
  return parts.join(" · ");
}

export function freightDispatchSearchableText(
  entry: BusinessEntry,
  intel: FreightDispatchMapIntel
): string {
  const p = entry.payload as unknown as Record<string, unknown>;
  const extra: string[] = [];
  if (entry.entryType === "outward_freight_details") {
    if (typeof p.billNumber === "string") extra.push(p.billNumber.trim());
    if (typeof p.dispatchTitle === "string") extra.push(p.dispatchTitle.trim());
  }
  if (entry.entryType === "material_dispatched" && typeof p.invoiceChallan === "string") {
    extra.push(p.invoiceChallan.trim());
  }
  const postalParts: string[] = [];
  if (entry.entryType === "outward_freight_details") {
    const p = entry.payload as OutwardFreightPayload;
    postalParts.push(...postalSearchParts(p.dispatchFromPostal));
    postalParts.push(...postalSearchParts(p.deliveryToPostal));
  }
  if (entry.entryType === "material_dispatched") {
    const p = entry.payload as MaterialDispatchedPayload;
    postalParts.push(...postalSearchParts(p.dispatchFromPostal));
    postalParts.push(...postalSearchParts(p.deliveryToPostal));
  }

  return [
    intel.dispatchOrigin,
    intel.deliveryLocation,
    intel.billReference,
    intel.lrNumber,
    intel.transporterContact,
    intel.vehicleNumber,
    intel.loadSummary,
    intel.freightTypeLabel,
    intel.clarificationContact,
    ...extra,
    ...postalParts,
  ]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join(" ");
}

export function hasFreightDispatchMapIntel(
  intel: FreightDispatchMapIntel | null | undefined
): boolean {
  if (!intel) return false;
  return freightDispatchMapCardLines(intel).length > 0;
}
