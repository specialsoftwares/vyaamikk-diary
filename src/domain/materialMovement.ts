import type { BusinessEntry, BusinessEntryType } from "./businessEntry";

/** User-facing movement kinds — maps to existing internal entry types (Option B). */
export type MaterialMovementKind = "sent_transport" | "received" | "return";

/** Internal diary types that belong to the Material Movement family. */
export const MATERIAL_MOVEMENT_ENTRY_TYPES: readonly BusinessEntryType[] = [
  "material_dispatched",
  "material_received",
  "outward_freight_details",
  "material_return",
] as const;

export type MaterialMovementEntryType = (typeof MATERIAL_MOVEMENT_ENTRY_TYPES)[number];

export function isMaterialMovementEntryType(
  type: BusinessEntryType
): type is MaterialMovementEntryType {
  return (MATERIAL_MOVEMENT_ENTRY_TYPES as readonly string[]).includes(type);
}

export function movementKindFromEntryType(type: BusinessEntryType): MaterialMovementKind | null {
  switch (type) {
    case "material_dispatched":
    case "outward_freight_details":
      return "sent_transport";
    case "material_received":
      return "received";
    case "material_return":
      return "return";
    default:
      return null;
  }
}

export function entryTypeFromMovementKind(kind: MaterialMovementKind): MaterialMovementEntryType {
  switch (kind) {
    case "sent_transport":
      return "material_dispatched";
    case "received":
      return "material_received";
    case "return":
      return "material_return";
  }
}

export function isMaterialMovementComposerType(type: string): boolean {
  return isMaterialMovementEntryType(type as BusinessEntryType);
}

/** i18n key under materialMovement.kind.* */
export function movementKindLabelKey(kind: MaterialMovementKind): string {
  return `materialMovement.kind.${kind}`;
}

/** i18n key for composer.types override on list chips */
export function movementEntryTypeLabelKey(type: BusinessEntryType): string | null {
  const kind = movementKindFromEntryType(type);
  return kind ? movementKindLabelKey(kind) : null;
}

export interface MaterialMovementFilter {
  kind: MaterialMovementKind | "all";
}

export function entryMatchesMovementFilter(
  entry: BusinessEntry,
  filter: MaterialMovementFilter
): boolean {
  if (!isMaterialMovementEntryType(entry.entryType)) return false;
  if (filter.kind === "all") return true;
  return movementKindFromEntryType(entry.entryType) === filter.kind;
}

function postalPin(postal: unknown): string | null {
  if (!postal || typeof postal !== "object") return null;
  const p = postal as { pin?: string; displayLabel?: string };
  if (p.pin?.trim()) return p.pin.trim();
  if (p.displayLabel?.trim()) return p.displayLabel.trim();
  return null;
}

/** Compact from → to line for list rows and search snippets. */
export function movementRouteSummary(entry: BusinessEntry): string | null {
  const p = entry.payload as unknown as Record<string, unknown>;
  switch (entry.entryType) {
    case "material_dispatched": {
      const from =
        postalPin(p.dispatchFromPostal) ||
        (typeof p.dispatchLocation === "string" ? p.dispatchLocation : null);
      const to =
        postalPin(p.deliveryToPostal) ||
        (typeof p.destination === "string" ? p.destination : null);
      if (from && to) return `${from} → ${to}`;
      return from || to;
    }
    case "material_received": {
      const from =
        postalPin(p.dispatchFromPostal) ||
        postalPin(p.supplierPostal) ||
        (typeof p.receivedLocation === "string" ? p.receivedLocation : null);
      const to = postalPin(p.receivedAtPostal) || from;
      if (from && to && from !== to) return `${from} → ${to}`;
      return from || to;
    }
    case "outward_freight_details": {
      const from =
        postalPin(p.dispatchFromPostal) ||
        (typeof p.dispatchFromLocation === "string" ? p.dispatchFromLocation : null);
      const to =
        postalPin(p.deliveryToPostal) ||
        (typeof p.deliveryLocation === "string" ? p.deliveryLocation : null);
      if (from && to) return `${from} → ${to}`;
      return to || from;
    }
    case "material_return": {
      const from =
        postalPin(p.returnFromPostal) ||
        (typeof p.fromLocation === "string" ? p.fromLocation : null);
      const to =
        postalPin(p.returnToPostal) ||
        (typeof p.toLocation === "string" ? p.toLocation : null);
      if (from && to) return `${from} → ${to}`;
      return from || to;
    }
    default:
      return null;
  }
}

export function movementPartyLabel(entry: BusinessEntry): string | null {
  const p = entry.payload as unknown as Record<string, unknown>;
  switch (entry.entryType) {
    case "material_dispatched":
    case "material_return":
      return typeof p.partyName === "string" ? p.partyName : null;
    case "material_received":
      return typeof p.supplierName === "string" ? p.supplierName : null;
    case "outward_freight_details":
      return (
        (typeof p.partyName === "string" && p.partyName) ||
        (typeof p.transporterName === "string" && p.transporterName) ||
        null
      );
    default:
      return null;
  }
}
