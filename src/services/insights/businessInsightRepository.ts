import { getLocalDatabase } from "@/localDb/database";
import {
  LocalPayloadUnavailable,
  localPayloadSealRequired,
  lookupToken,
  openOwnedPayload,
  sealOwnedPayload,
} from "@/services/accountDeletion/localPayload";
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

function openInsightText(userId: string, stored: string): string {
  const opened = openOwnedPayload(userId, stored);
  if (opened.state !== "ready") throw new LocalPayloadUnavailable(opened.reason);
  return opened.value;
}

function mapRow(row: DbInsightRow): BusinessInsightRow {
  let metadata: BusinessInsightRow["metadata"] = {};
  try {
    const raw = row.metadata_json.startsWith("vyd1:")
      ? openInsightText(row.user_id, row.metadata_json)
      : row.metadata_json;
    metadata = JSON.parse(raw) as BusinessInsightRow["metadata"];
  } catch (error) {
    if (error instanceof LocalPayloadUnavailable) throw error;
    metadata = {};
  }
  const displayLabel = row.display_label.startsWith("vyd1:")
    ? openInsightText(row.user_id, row.display_label)
    : row.display_label;
  return {
    id: row.id,
    userId: row.user_id,
    ueid: row.ueid,
    kind: row.insight_kind as BusinessInsightKind,
    financialYear: row.financial_year,
    normalizedKey: row.normalized_key,
    displayLabel,
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

const INSIGHT_TOKEN_PREFIX = "vydh1.";

type InsightSql = {
  runSync(sql: string, params?: unknown[]): unknown;
  getAllSync<T>(sql: string, params?: unknown[]): T[];
  getFirstSync<T>(sql: string, params?: unknown[]): T | null | undefined;
};

export function insightJoinToken(userId: string, kind: string, logicalKey: string): string {
  if (!localPayloadSealRequired()) return logicalKey;
  if (logicalKey.startsWith(INSIGHT_TOKEN_PREFIX)) return logicalKey;
  return lookupToken(userId, `${kind}\0${logicalKey}`);
}

export function insightLinkStorageId(input: {
  userId: string;
  sourceRecordType: string;
  sourceRecordId: string;
  kind: string;
  logicalKey: string;
}): string {
  if (!localPayloadSealRequired()) {
    return `link_${input.sourceRecordType}_${input.sourceRecordId}_${input.kind}_${input.logicalKey}`;
  }
  return lookupToken(
    input.userId,
    `link\0${input.sourceRecordType}\0${input.sourceRecordId}\0${input.kind}\0${input.logicalKey}`
  );
}

function insightTablesReady(db: InsightSql): boolean {
  try {
    db.getFirstSync("SELECT 1 AS ok FROM business_insights LIMIT 1");
    db.getFirstSync("SELECT 1 AS ok FROM business_insight_links LIMIT 1");
    return true;
  } catch {
    return false;
  }
}

/**
 * Rewrites plaintext party/PIN join keys to account-bound tokens and moves
 * link ids with them. A crash leaves the remaining plaintext rows in place.
 * A second run finishes them. A plaintext row is deleted only when the
 * token copy of that same insight or link already exists.
 */
export function migrateInsightJoinKeys(db: InsightSql, userId: string): { migrated: number } {
  if (!localPayloadSealRequired()) return { migrated: 0 };
  if (!insightTablesReady(db)) return { migrated: 0 };
  let migrated = 0;
  const links = db.getAllSync<{
    id: string;
    insight_kind: string;
    normalized_key: string;
    source_record_type: string;
    source_record_id: string;
    financial_year: number;
    metadata_json: string | null;
  }>(
    `SELECT id, insight_kind, normalized_key, source_record_type, source_record_id, financial_year, metadata_json
     FROM business_insight_links WHERE user_id = ?`,
    [userId]
  );
  for (const link of links) {
    const logical = link.normalized_key;
    const alreadyToken = logical.startsWith(INSIGHT_TOKEN_PREFIX);
    const token = alreadyToken ? logical : insightJoinToken(userId, link.insight_kind, logical);
    const metadata = link.metadata_json == null || link.metadata_json.startsWith("vyd1:")
      ? link.metadata_json
      : sealOwnedPayload(userId, link.metadata_json);
    if (alreadyToken && metadata === link.metadata_json) continue;
    const nextId = alreadyToken
      ? link.id
      : insightLinkStorageId({
          userId,
          sourceRecordType: link.source_record_type,
          sourceRecordId: link.source_record_id,
          kind: link.insight_kind,
          logicalKey: logical,
        });
    const existing = nextId === link.id
      ? undefined
      : db.getFirstSync<{ id: string }>(
          "SELECT id FROM business_insight_links WHERE id = ? AND user_id = ?",
          [nextId, userId]
        );
    if (existing && existing.id !== link.id) {
      db.runSync("DELETE FROM business_insight_links WHERE id = ? AND user_id = ?", [link.id, userId]);
    } else {
      db.runSync(
        "UPDATE business_insight_links SET id = ?, normalized_key = ?, metadata_json = ? WHERE id = ? AND user_id = ?",
        [nextId, token, metadata, link.id, userId]
      );
    }
    migrated += 1;
  }
  const insights = db.getAllSync<{
    id: string;
    insight_kind: string;
    normalized_key: string;
    financial_year: number;
    display_label: string;
    metadata_json: string;
  }>(
    `SELECT id, insight_kind, normalized_key, financial_year, display_label, metadata_json
     FROM business_insights WHERE user_id = ?`,
    [userId]
  );
  for (const row of insights) {
    const token = row.normalized_key.startsWith(INSIGHT_TOKEN_PREFIX)
      ? row.normalized_key
      : insightJoinToken(userId, row.insight_kind, row.normalized_key);
    const displaySource = row.display_label ?? "";
    const metadataSource = row.metadata_json ?? "";
    const display = displaySource.startsWith("vyd1:")
      ? displaySource
      : sealOwnedPayload(userId, displaySource);
    const metadata = metadataSource.startsWith("vyd1:")
      ? metadataSource
      : sealOwnedPayload(userId, metadataSource);
    const unchanged =
      token === row.normalized_key && display === displaySource && metadata === metadataSource;
    if (unchanged) continue;
    const existing = token === row.normalized_key
      ? undefined
      : db.getFirstSync<{ id: string }>(
          `SELECT id FROM business_insights
           WHERE user_id = ? AND insight_kind = ? AND financial_year = ? AND normalized_key = ? AND id <> ?`,
          [userId, row.insight_kind, row.financial_year, token, row.id]
        );
    if (existing) {
      db.runSync("DELETE FROM business_insights WHERE id = ? AND user_id = ?", [row.id, userId]);
    } else {
      db.runSync(
        `UPDATE business_insights
         SET normalized_key = ?, display_label = ?, metadata_json = ?
         WHERE id = ? AND user_id = ?`,
        [token, display, metadata, row.id, userId]
      );
    }
    migrated += 1;
  }
  const groups = db.getAllSync<{
    insight_kind: string;
    normalized_key: string;
    financial_year: number;
  }>(
    `SELECT DISTINCT insight_kind, normalized_key, financial_year
     FROM business_insight_links WHERE user_id = ?`,
    [userId]
  );
  for (const group of groups) {
    recomputeInsightAggregateSync(
      db,
      userId,
      group.insight_kind as BusinessInsightKind,
      group.financial_year,
      group.normalized_key
    );
  }
  return { migrated };
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
    migrateInsightJoinKeys(db, input.userId);
    const now = Date.now();
    const storedKey = insightJoinToken(input.userId, input.kind, input.normalizedKey);
    const linkId = insightLinkStorageId({
      userId: input.userId,
      sourceRecordType: input.sourceRecordType,
      sourceRecordId: input.sourceRecordId,
      kind: input.kind,
      logicalKey: input.normalizedKey,
    });

    db.runSync(
      `INSERT OR REPLACE INTO business_insight_links
        (id, user_id, insight_kind, normalized_key, financial_year, source_record_type, source_record_id, record_date_ms, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        linkId,
        input.userId,
        input.kind,
        storedKey,
        input.financialYear,
        input.sourceRecordType,
        input.sourceRecordId,
        input.recordDateMs,
        sealOwnedPayload(input.userId, JSON.stringify(input.metadata)),
      ]
    );

    const existing = db.getFirstSync<DbInsightRow>(
      `SELECT * FROM business_insights
       WHERE user_id = ? AND insight_kind = ? AND financial_year = ? AND normalized_key = ?`,
      [input.userId, input.kind, input.financialYear, storedKey]
    );

    const countRow = db.getFirstSync<{ c: number }>(
      `SELECT COUNT(*) as c FROM business_insight_links
       WHERE user_id = ? AND insight_kind = ? AND financial_year = ? AND normalized_key = ?`,
      [input.userId, input.kind, input.financialYear, storedKey]
    );
    const recordCount = countRow?.c ?? 1;

    const lastRow = db.getFirstSync<{ m: number }>(
      `SELECT MAX(record_date_ms) as m FROM business_insight_links
       WHERE user_id = ? AND insight_kind = ? AND financial_year = ? AND normalized_key = ?`,
      [input.userId, input.kind, input.financialYear, storedKey]
    );
    const lastUsedAt = lastRow?.m ?? input.recordDateMs;

    if (existing) {
      const prevRaw = existing.metadata_json.startsWith("vyd1:")
        ? openInsightText(input.userId, existing.metadata_json)
        : existing.metadata_json;
      const prevMeta = JSON.parse(prevRaw) as Record<string, unknown>;
      const merged = mergeInsightMetadata(input.kind, prevMeta, input.metadata);
      db.runSync(
        `UPDATE business_insights SET
          display_label = ?, metadata_json = ?, record_count = ?, last_used_at = ?, updated_at = ?
         WHERE id = ?`,
        [
          sealOwnedPayload(input.userId, input.displayLabel),
          sealOwnedPayload(input.userId, JSON.stringify(merged)),
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
          storedKey,
          sealOwnedPayload(input.userId, input.displayLabel),
          sealOwnedPayload(input.userId, JSON.stringify(input.metadata)),
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

function recomputeInsightAggregateSync(
  db: InsightSql,
  userId: string,
  kind: BusinessInsightKind,
  financialYear: number,
  normalizedKey: string
): void {
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

async function recomputeInsightAggregate(
  userId: string,
  kind: BusinessInsightKind,
  financialYear: number,
  normalizedKey: string
): Promise<void> {
  recomputeInsightAggregateSync(getLocalDatabase(), userId, kind, financialYear, normalizedKey);
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
