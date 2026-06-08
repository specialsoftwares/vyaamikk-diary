import { getLocalDatabase } from "@/localDb/database";
import type {
  BusinessInsightKind,
  BusinessInsightLink,
  BusinessInsightRow,
  InsightSourceRecordType,
  PartyInsightMeta,
  PinInsightMeta,
} from "@/domain/businessInsight";
import { createLogger } from "@/utils/logger";
import { shortId } from "@/utils/id";

const log = createLogger("insights/businessInsight");

interface DbInsightRow {
  id: string;
  user_id: string;
  ueid: string;
  insight_kind: string;
  financial_year: number;
  normalized_key: string;
  display_label: string;
  metadata_json: string;
  record_count: number;
  last_used_at: number;
  created_at: number;
  updated_at: number;
}

function mapRow(row: DbInsightRow): BusinessInsightRow {
  let metadata: BusinessInsightRow["metadata"] = {};
  try {
    metadata = JSON.parse(row.metadata_json) as BusinessInsightRow["metadata"];
  } catch {
    metadata = {};
  }
  return {
    id: row.id,
    userId: row.user_id,
    ueid: row.ueid,
    kind: row.insight_kind as BusinessInsightKind,
    financialYear: row.financial_year,
    normalizedKey: row.normalized_key,
    displayLabel: row.display_label,
    metadata,
    recordCount: row.record_count,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizePartyKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizePinKey(pin: string): string {
  return pin.replace(/\D/g, "").slice(0, 6);
}

export async function upsertInsightLink(input: {
  userId: string;
  ueid: string;
  kind: BusinessInsightKind;
  normalizedKey: string;
  financialYear: number;
  displayLabel: string;
  metadata: Record<string, unknown>;
  sourceRecordType: InsightSourceRecordType;
  sourceRecordId: string;
  recordDateMs: number;
}): Promise<void> {
  try {
    const db = getLocalDatabase();
    const now = Date.now();
    const linkId = `link_${input.sourceRecordType}_${input.sourceRecordId}_${input.kind}_${input.normalizedKey}`;

    db.runSync(
      `INSERT OR REPLACE INTO business_insight_links
        (id, user_id, insight_kind, normalized_key, financial_year, source_record_type, source_record_id, record_date_ms, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        linkId,
        input.userId,
        input.kind,
        input.normalizedKey,
        input.financialYear,
        input.sourceRecordType,
        input.sourceRecordId,
        input.recordDateMs,
        JSON.stringify(input.metadata),
      ]
    );

    const existing = db.getFirstSync<DbInsightRow>(
      `SELECT * FROM business_insights
       WHERE user_id = ? AND insight_kind = ? AND financial_year = ? AND normalized_key = ?`,
      [input.userId, input.kind, input.financialYear, input.normalizedKey]
    );

    const countRow = db.getFirstSync<{ c: number }>(
      `SELECT COUNT(*) as c FROM business_insight_links
       WHERE user_id = ? AND insight_kind = ? AND financial_year = ? AND normalized_key = ?`,
      [input.userId, input.kind, input.financialYear, input.normalizedKey]
    );
    const recordCount = countRow?.c ?? 1;

    const lastRow = db.getFirstSync<{ m: number }>(
      `SELECT MAX(record_date_ms) as m FROM business_insight_links
       WHERE user_id = ? AND insight_kind = ? AND financial_year = ? AND normalized_key = ?`,
      [input.userId, input.kind, input.financialYear, input.normalizedKey]
    );
    const lastUsedAt = lastRow?.m ?? input.recordDateMs;

    if (existing) {
      const prevMeta = JSON.parse(existing.metadata_json) as Record<string, unknown>;
      const merged = mergeInsightMetadata(input.kind, prevMeta, input.metadata);
      db.runSync(
        `UPDATE business_insights SET
          display_label = ?, metadata_json = ?, record_count = ?, last_used_at = ?, updated_at = ?
         WHERE id = ?`,
        [
          input.displayLabel,
          JSON.stringify(merged),
          recordCount,
          lastUsedAt,
          now,
          existing.id,
        ]
      );
    } else {
      db.runSync(
        `INSERT INTO business_insights
          (id, user_id, ueid, insight_kind, financial_year, normalized_key, display_label, metadata_json, record_count, last_used_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `bi_${shortId()}`,
          input.userId,
          input.ueid,
          input.kind,
          input.financialYear,
          input.normalizedKey,
          input.displayLabel,
          JSON.stringify(input.metadata),
          recordCount,
          lastUsedAt,
          now,
          now,
        ]
      );
    }
  } catch (e) {
    log.warn("upsert insight link failed", e);
  }
}

function mergeInsightMetadata(
  kind: BusinessInsightKind,
  prev: Record<string, unknown>,
  next: Record<string, unknown>
): Record<string, unknown> {
  if (kind === "party") {
    const p = prev as unknown as PartyInsightMeta;
    const n = next as unknown as PartyInsightMeta;
    const sources = [...new Set([...(p.sources ?? []), ...(n.sources ?? [])])];
    return {
      partyName: n.partyName || p.partyName,
      pin: n.pin ?? p.pin ?? null,
      locality: n.locality ?? p.locality ?? null,
      state: n.state ?? p.state ?? null,
      sources,
    };
  }
  if (kind === "pin") {
    const p = prev as unknown as PinInsightMeta;
    const n = next as unknown as PinInsightMeta;
    const parties = [...new Set([...(p.parties ?? []), ...(n.parties ?? [])])].slice(0, 12);
    return {
      pin: n.pin || p.pin,
      locality: n.locality ?? p.locality ?? null,
      district: n.district ?? p.district ?? null,
      state: n.state ?? p.state ?? null,
      resolved: Boolean(n.resolved || p.resolved),
      parties,
    };
  }
  return { ...prev, ...next };
}

/** Remove shop Credit/EMI links from party/PIN insights (customers have their own list). */
export async function removeShopCustomerPartyPinLinks(userId: string): Promise<void> {
  try {
    const db = getLocalDatabase();
    const affected = db.getAllSync<{
      insight_kind: string;
      normalized_key: string;
      financial_year: number;
    }>(
      `SELECT DISTINCT insight_kind, normalized_key, financial_year FROM business_insight_links
       WHERE user_id = ? AND source_record_type = 'customer_credit' AND insight_kind IN ('party', 'pin')`,
      [userId]
    );
    if (!affected.length) return;
    db.runSync(
      `DELETE FROM business_insight_links
       WHERE user_id = ? AND source_record_type = 'customer_credit' AND insight_kind IN ('party', 'pin')`,
      [userId]
    );
    for (const row of affected) {
      await recomputeInsightAggregate(
        userId,
        row.insight_kind as BusinessInsightKind,
        row.financial_year,
        row.normalized_key
      );
    }
  } catch (e) {
    log.warn("remove shop customer insight links", e);
  }
}

export async function removeInsightLinksForSource(
  userId: string,
  sourceRecordType: InsightSourceRecordType,
  sourceRecordId: string
): Promise<void> {
  try {
    const db = getLocalDatabase();
    const affected = db.getAllSync<{
      insight_kind: string;
      normalized_key: string;
      financial_year: number;
    }>(
      `SELECT DISTINCT insight_kind, normalized_key, financial_year FROM business_insight_links
       WHERE user_id = ? AND source_record_type = ? AND source_record_id = ?`,
      [userId, sourceRecordType, sourceRecordId]
    );

    db.runSync(
      `DELETE FROM business_insight_links
       WHERE user_id = ? AND source_record_type = ? AND source_record_id = ?`,
      [userId, sourceRecordType, sourceRecordId]
    );

    for (const row of affected) {
      await recomputeInsightAggregate(
        userId,
        row.insight_kind as BusinessInsightKind,
        row.financial_year,
        row.normalized_key
      );
    }
  } catch (e) {
    log.warn("remove insight links", e);
  }
}

async function recomputeInsightAggregate(
  userId: string,
  kind: BusinessInsightKind,
  financialYear: number,
  normalizedKey: string
): Promise<void> {
  const db = getLocalDatabase();
  const countRow = db.getFirstSync<{ c: number }>(
    `SELECT COUNT(*) as c FROM business_insight_links
     WHERE user_id = ? AND insight_kind = ? AND financial_year = ? AND normalized_key = ?`,
    [userId, kind, financialYear, normalizedKey]
  );
  const count = countRow?.c ?? 0;
  if (count === 0) {
    db.runSync(
      `DELETE FROM business_insights
       WHERE user_id = ? AND insight_kind = ? AND financial_year = ? AND normalized_key = ?`,
      [userId, kind, financialYear, normalizedKey]
    );
    return;
  }
  const lastRow = db.getFirstSync<{ m: number }>(
    `SELECT MAX(record_date_ms) as m FROM business_insight_links
     WHERE user_id = ? AND insight_kind = ? AND financial_year = ? AND normalized_key = ?`,
    [userId, kind, financialYear, normalizedKey]
  );
  db.runSync(
    `UPDATE business_insights SET record_count = ?, last_used_at = ?, updated_at = ?
     WHERE user_id = ? AND insight_kind = ? AND financial_year = ? AND normalized_key = ?`,
    [count, lastRow?.m ?? Date.now(), Date.now(), userId, kind, financialYear, normalizedKey]
  );
}

export function listInsightsByKind(
  userId: string,
  kind: BusinessInsightKind,
  financialYear: number,
  limit = 100
): BusinessInsightRow[] {
  try {
    const db = getLocalDatabase();
    const rows = db.getAllSync<DbInsightRow>(
      `SELECT * FROM business_insights
       WHERE user_id = ? AND insight_kind = ? AND financial_year = ?
       ORDER BY last_used_at DESC LIMIT ?`,
      [userId, kind, financialYear, limit]
    );
    return rows.map(mapRow);
  } catch (e) {
    log.warn("list insights", e);
    return [];
  }
}

export function listDistinctFinancialYears(userId: string): number[] {
  try {
    const db = getLocalDatabase();
    const rows = db.getAllSync<{ financial_year: number }>(
      `SELECT DISTINCT financial_year FROM business_insights WHERE user_id = ? ORDER BY financial_year DESC`,
      [userId]
    );
    return rows.map((r) => r.financial_year);
  } catch {
    return [];
  }
}

export function purgeBusinessInsightsForUser(userId: string): void {
  try {
    const db = getLocalDatabase();
    db.runSync("DELETE FROM business_insight_links WHERE user_id = ?", [userId]);
    db.runSync("DELETE FROM business_insights WHERE user_id = ?", [userId]);
  } catch (e) {
    log.warn("purge insights", e);
  }
}
