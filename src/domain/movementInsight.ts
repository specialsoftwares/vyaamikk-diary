/**
 * User-scoped movement / route metadata derived from PIN pairs on business records.
 * Distances are approximate (PIN centroid haversine) — never certified route lengths.
 */

export type MovementDistanceSource = "pin_geo_haversine" | "manual" | "unknown";

export type MovementLinkedRecordType =
  | "material_dispatched"
  | "material_received"
  | "material_return"
  | "outward_freight_details"
  | "customer_credit"
  | "other";

export interface MovementDistanceRecord {
  id: string;
  userId: string;
  fromPin: string;
  toPin: string;
  fromLabel: string | null;
  toLabel: string | null;
  /** Null when coordinates unavailable — do not invent distance. */
  approxDistanceKm: number | null;
  distanceSource: MovementDistanceSource;
  calculatedAt: number;
  /** Business date of the linked record (for FY / period filters). */
  recordDateMs: number;
  /** Indian FY start year (April–March). */
  financialYear: number;
  linkedRecordId: string;
  linkedRecordType: MovementLinkedRecordType;
  /** Human route label e.g. "Kota → Mathura". */
  routeLabel: string | null;
}
