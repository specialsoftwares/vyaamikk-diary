import type { BusinessEntry } from "@/domain/businessEntry";
import { getDiaryRepository } from "@/services/diary";
import { getFinancialYearRange } from "@/utils/financialYear";

function dedupeById(entries: BusinessEntry[]): BusinessEntry[] {
  const seen = new Set<string>();
  const out: BusinessEntry[] = [];
  for (const e of entries) {
    const id = e.id?.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(e);
  }
  return out;
}

/** Drop duplicate / blank ids (e.g. legacy Firestore rows before doc-id fix). */
export function dedupeDiaryEntries(entries: BusinessEntry[]): BusinessEntry[] {
  return dedupeById(entries).filter((e) => !e.deletedAt);
}

/** Diary repository is the source of truth — not the local SQLite cache mirror. */
export async function listUserDiaryEntries(
  userId: string,
  options?: { limit?: number; includeDeleted?: boolean }
): Promise<BusinessEntry[]> {
  const entries = await getDiaryRepository().list(userId, {
    includeDeleted: options?.includeDeleted ?? false,
    limit: options?.limit ?? 5000,
  });
  return dedupeDiaryEntries(entries);
}

export async function countUserDiaryRecords(
  userId: string,
  options?: { fyStartYear?: number }
): Promise<number> {
  const entries = await listUserDiaryEntries(userId);
  if (options?.fyStartYear == null) return entries.length;
  const { startMs, endMs } = getFinancialYearRange(options.fyStartYear);
  return entries.filter((e) => e.entryDate >= startMs && e.entryDate < endMs).length;
}

