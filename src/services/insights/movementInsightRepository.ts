import AsyncStorage from "@react-native-async-storage/async-storage";

import type {
  MovementDistanceRecord,
  MovementLinkedRecordType,
} from "@/domain/movementInsight";
import type { ApproxDistanceResult } from "@/services/insights/approxDistanceService";
import { getFinancialYearForDate } from "@/utils/financialYear";
import { createLogger } from "@/utils/logger";

const log = createLogger("insights/movement");
const STORAGE_PREFIX = "vyd_movement_insights_v1_";
const MAX_RECORDS = 2000;

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

async function loadAll(userId: string): Promise<MovementDistanceRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MovementDistanceRecord[]) : [];
  } catch (e) {
    log.warn("load movement insights", e);
    return [];
  }
}

async function persist(userId: string, records: MovementDistanceRecord[]): Promise<void> {
  const trimmed = records.slice(0, MAX_RECORDS);
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(trimmed));
}

export async function upsertMovementDistance(
  userId: string,
  linkedRecordId: string,
  linkedRecordType: MovementLinkedRecordType,
  approx: ApproxDistanceResult,
  meta?: { recordDateMs: number; financialYear: number }
): Promise<MovementDistanceRecord> {
  const all = await loadAll(userId);
  const now = Date.now();
  const existingIdx = all.findIndex(
    (r) => r.linkedRecordId === linkedRecordId && r.linkedRecordType === linkedRecordType
  );
  const prev = existingIdx >= 0 ? all[existingIdx] : null;
  const next: MovementDistanceRecord = {
    id: prev?.id ?? `mv_${linkedRecordType}_${linkedRecordId}`,
    userId,
    fromPin: approx.fromPin,
    toPin: approx.toPin,
    fromLabel: approx.fromLabel,
    toLabel: approx.toLabel,
    approxDistanceKm: approx.approxDistanceKm,
    distanceSource: approx.distanceSource,
    calculatedAt: now,
    recordDateMs: meta?.recordDateMs ?? prev?.recordDateMs ?? now,
    financialYear:
      meta?.financialYear ??
      prev?.financialYear ??
      getFinancialYearForDate(meta?.recordDateMs ?? prev?.recordDateMs ?? now),
    linkedRecordId,
    linkedRecordType,
    routeLabel: approx.routeLabel,
  };
  if (existingIdx >= 0) {
    all[existingIdx] = next;
  } else {
    all.unshift(next);
  }
  await persist(userId, all);
  return next;
}

export async function listMovementDistances(
  userId: string,
  limit = 500
): Promise<MovementDistanceRecord[]> {
  const all = await loadAll(userId);
  return all.slice(0, limit);
}

function sumKm(records: MovementDistanceRecord[]): number {
  let sum = 0;
  for (const r of records) {
    if (r.approxDistanceKm != null && Number.isFinite(r.approxDistanceKm)) {
      sum += r.approxDistanceKm;
    }
  }
  return Math.round(sum);
}

export async function totalApproxDistanceKm(
  userId: string,
  options?: { financialYear?: number; sinceMs?: number }
): Promise<number> {
  const all = await loadAll(userId);
  let filtered = all;
  if (options?.financialYear != null) {
    filtered = filtered.filter((r) => r.financialYear === options.financialYear);
  }
  if (options?.sinceMs != null) {
    filtered = filtered.filter((r) => (r.recordDateMs ?? r.calculatedAt) >= options.sinceMs!);
  }
  return sumKm(filtered);
}

export async function listMovementDistancesForFy(
  userId: string,
  financialYear: number,
  limit = 500
): Promise<MovementDistanceRecord[]> {
  const all = await loadAll(userId);
  return all.filter((r) => r.financialYear === financialYear).slice(0, limit);
}

export async function removeMovementForRecord(
  userId: string,
  linkedRecordId: string,
  linkedRecordType: MovementLinkedRecordType
): Promise<void> {
  const all = await loadAll(userId);
  const next = all.filter(
    (r) => !(r.linkedRecordId === linkedRecordId && r.linkedRecordType === linkedRecordType)
  );
  if (next.length !== all.length) await persist(userId, next);
}

/** Remove all movement rows linked to a record id (e.g. diary entry delete). */
export async function removeMovementsForLinkedRecord(
  userId: string,
  linkedRecordId: string
): Promise<void> {
  const all = await loadAll(userId);
  const next = all.filter((r) => r.linkedRecordId !== linkedRecordId);
  if (next.length !== all.length) await persist(userId, next);
}

export async function removeMovementInsightsForUser(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey(userId));
  } catch (e) {
    log.warn("purge movement insights", e);
  }
}
