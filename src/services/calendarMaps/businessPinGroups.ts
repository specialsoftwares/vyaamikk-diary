export const PIN_LOOKUP_CONCURRENCY = 4;

export interface FreightPinRow {
  entryId: string;
  recordKey: string;
  pinCode: string;
  side: "from" | "to";
  valid: boolean;
  areaLabel: string;
}

export interface BusinessPinGroup<TRecord> {
  id: string;
  pinCode: string;
  side: "from" | "to";
  areaLabel: string;
  valid: boolean;
  latitude: number | null;
  longitude: number | null;
  records: TRecord[];
}

export interface PinCentroidPoint {
  latitude: number;
  longitude: number;
}

/**
 * Group confirmed freight/dispatch PINs by PIN and side.
 * The same entry and side is listed once. Invalid PINs stay in the list and
 * are not merged into a real PIN group.
 */
export function groupFreightPinRows<TRecord>(
  rows: readonly { row: FreightPinRow; record: TRecord }[]
): BusinessPinGroup<TRecord>[] {
  const seen = new Set<string>();
  const groups = new Map<string, BusinessPinGroup<TRecord>>();

  for (const item of rows) {
    const dedupe = `${item.row.entryId}:${item.row.side}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const id = item.row.valid
      ? `${item.row.side}:${item.row.pinCode}`
      : `invalid:${item.row.entryId}:${item.row.side}`;
    const existing = groups.get(id);
    if (existing) {
      existing.records.push(item.record);
      if (!existing.areaLabel && item.row.areaLabel) existing.areaLabel = item.row.areaLabel;
      continue;
    }
    groups.set(id, {
      id,
      pinCode: item.row.pinCode,
      side: item.row.side,
      areaLabel: item.row.areaLabel,
      valid: item.row.valid,
      latitude: null,
      longitude: null,
      records: [item.record],
    });
  }

  return [...groups.values()];
}

export function applyPinCentroids<TRecord>(
  groups: readonly BusinessPinGroup<TRecord>[],
  centroids: ReadonlyMap<string, PinCentroidPoint | null>
): BusinessPinGroup<TRecord>[] {
  return groups.map((group) => {
    if (!group.valid) return { ...group, records: [...group.records] };
    const centroid = centroids.get(group.pinCode);
    if (
      !centroid ||
      !Number.isFinite(centroid.latitude) ||
      !Number.isFinite(centroid.longitude)
    ) {
      return { ...group, latitude: null, longitude: null, records: [...group.records] };
    }
    return {
      ...group,
      latitude: centroid.latitude,
      longitude: centroid.longitude,
      records: [...group.records],
    };
  });
}

async function mapPool<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  const width = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;
  const runners = Array.from({ length: width }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

/**
 * Look up postal centroids for PIN strings only. Failures become null and do
 * not reject the batch. Concurrency is capped so a large set cannot stampede.
 */
export async function lookupPinCentroidsBounded(
  pins: readonly string[],
  resolve: (pin: string) => Promise<PinCentroidPoint | null>,
  concurrency = PIN_LOOKUP_CONCURRENCY
): Promise<Map<string, PinCentroidPoint | null>> {
  const unique = [...new Set(pins)];
  const out = new Map<string, PinCentroidPoint | null>();
  await mapPool(unique, concurrency, async (pin) => {
    try {
      const found = await resolve(pin);
      if (
        !found ||
        !Number.isFinite(found.latitude) ||
        !Number.isFinite(found.longitude)
      ) {
        out.set(pin, null);
        return;
      }
      out.set(pin, { latitude: found.latitude, longitude: found.longitude });
    } catch {
      out.set(pin, null);
    }
  });
  return out;
}
