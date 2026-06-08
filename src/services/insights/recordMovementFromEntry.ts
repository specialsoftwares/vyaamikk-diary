import type { BusinessEntry, BusinessEntryType } from "@/domain/businessEntry";
import type { IndianPostalLocation } from "@/domain/indianPostal";
import type { MovementLinkedRecordType } from "@/domain/movementInsight";
import {
  computeApproxDistanceBetweenPins,
  type ApproxDistanceResult,
} from "@/services/insights/approxDistanceService";
import { upsertMovementDistance } from "@/services/insights/movementInsightRepository";
import { getFinancialYearForDate } from "@/utils/financialYear";

function postalFromPayload(
  payload: Record<string, unknown>,
  key: "dispatchFromPostal" | "deliveryToPostal" | "receivedAtPostal" | "supplierPostal"
): IndianPostalLocation | null {
  const raw = payload[key];
  if (!raw || typeof raw !== "object") return null;
  const p = raw as IndianPostalLocation;
  if (!p.pinCode?.trim()) return null;
  return p;
}

function extractPinPair(
  entry: BusinessEntry
): { from: IndianPostalLocation | null; to: IndianPostalLocation | null } | null {
  const p = entry.payload as unknown as Record<string, unknown>;
  switch (entry.entryType) {
    case "material_dispatched":
    case "outward_freight_details":
      return {
        from: postalFromPayload(p, "dispatchFromPostal"),
        to: postalFromPayload(p, "deliveryToPostal"),
      };
    case "material_received":
      return {
        from: postalFromPayload(p, "supplierPostal"),
        to: postalFromPayload(p, "receivedAtPostal"),
      };
    case "material_return": {
      const fromRaw = p.returnFromPostal;
      const toRaw = p.returnToPostal;
      return {
        from:
          fromRaw && typeof fromRaw === "object"
            ? (fromRaw as IndianPostalLocation)
            : null,
        to:
          toRaw && typeof toRaw === "object" ? (toRaw as IndianPostalLocation) : null,
      };
    }
    default:
      return null;
  }
}

function linkedType(entryType: BusinessEntryType): MovementLinkedRecordType {
  if (
    entryType === "material_dispatched" ||
    entryType === "material_received" ||
    entryType === "material_return" ||
    entryType === "outward_freight_details"
  ) {
    return entryType;
  }
  return "other";
}

/** Best-effort: record approximate PIN→PIN distance after a diary entry is saved. */
export async function recordMovementFromBusinessEntry(
  userId: string,
  entry: BusinessEntry,
  recordDateMs?: number,
  financialYear?: number
): Promise<ApproxDistanceResult | null> {
  const pair = extractPinPair(entry);
  if (!pair?.from?.pinCode || !pair?.to?.pinCode) return null;
  const approx = await computeApproxDistanceBetweenPins(pair.from, pair.to);
  if (!approx) return null;
  const dateMs = recordDateMs ?? entry.entryDate ?? entry.createdAt;
  const fy = financialYear ?? getFinancialYearForDate(dateMs);
  await upsertMovementDistance(userId, entry.id, linkedType(entry.entryType), approx, {
    recordDateMs: dateMs,
    financialYear: fy,
  });
  return approx;
}
