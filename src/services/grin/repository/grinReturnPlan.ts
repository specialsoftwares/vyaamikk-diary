/**
 * Durable multi-line return intent for the existing per-line dispatchReturn API.
 *
 * Queueing is not confirmation. Each dependent line submits only against the
 * confirmed eventVersion after prior lines are confirmed (or the sequence stops).
 * Command identities are minted once and never rewritten.
 */

import type { Quantity } from "@/goodsEvidence/quantities";

import { mintCommandId } from "@/services/grin/outbox/ids";

import type { GrinApplicationDb } from "./types";

export const GRIN_RETURN_PLAN_DRAFT_KIND = "grin_return_plan" as const;

export type GrinReturnLineStatus =
  | "pending_submit"
  | "queued"
  | "confirmed"
  | "failed"
  | "conflicted"
  | "awaiting_confirmation"
  | "stopped_version_conflict";

export type GrinReturnLineIntent = {
  lineId: string;
  returnQty: Quantity;
  commandId: string;
  status: GrinReturnLineStatus;
  lastError: string | null;
};

export type GrinReturnPlan = {
  planId: string;
  /** Submission intent. A later independent return uses a different id. */
  intentId: string;
  ownerUid: string;
  ledgerId: string;
  receiptId: string;
  reason: string;
  lines: GrinReturnLineIntent[];
  createdAtUtc: string;
  updatedAtUtc: string;
};

export type GrinReturnLinePick = {
  lineId: string;
  returnQty: Quantity;
};

function planRowId(ownerUid: string, ledgerId: string, receiptId: string): string {
  return `grin_return_plan:${ownerUid}:${ledgerId}:${receiptId.trim()}`;
}

function scopeKey(ledgerId: string, receiptId: string): string {
  return `${ledgerId}:${receiptId.trim()}`;
}

/** Diary schema normally owns form_drafts; SQLITE_HOST grin-only DBs need this DDL. */
function ensureFormDraftsTable(db: GrinApplicationDb): void {
  db.execSync(`
CREATE TABLE IF NOT EXISTS form_drafts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  draft_kind TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  entry_id TEXT,
  payload_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);`);
}

export function loadReturnPlan(
  db: GrinApplicationDb,
  ownerUid: string,
  ledgerId: string,
  receiptId: string
): GrinReturnPlan | null {
  ensureFormDraftsTable(db);
  const row = db.getFirstSync<{ payload_json: string }>(
    `SELECT payload_json FROM form_drafts WHERE id = ? AND user_id = ? AND draft_kind = ?`,
    [planRowId(ownerUid, ledgerId, receiptId), ownerUid, GRIN_RETURN_PLAN_DRAFT_KIND]
  );
  if (!row?.payload_json) return null;
  try {
    const parsed = JSON.parse(row.payload_json) as GrinReturnPlan;
    if (!parsed || parsed.receiptId !== receiptId.trim()) return null;
    if (!Array.isArray(parsed.lines)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveReturnPlan(db: GrinApplicationDb, plan: GrinReturnPlan): void {
  ensureFormDraftsTable(db);
  const id = planRowId(plan.ownerUid, plan.ledgerId, plan.receiptId);
  const now = Date.now();
  const payload = JSON.stringify({ ...plan, updatedAtUtc: new Date(now).toISOString() });
  db.runSync(
    `INSERT INTO form_drafts (id, user_id, draft_kind, scope_key, entry_id, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       payload_json = excluded.payload_json,
       updated_at = excluded.updated_at,
       scope_key = excluded.scope_key,
       entry_id = excluded.entry_id`,
    [
      id,
      plan.ownerUid,
      GRIN_RETURN_PLAN_DRAFT_KIND,
      scopeKey(plan.ledgerId, plan.receiptId),
      plan.receiptId,
      payload,
      now,
    ]
  );
}

export function clearReturnPlan(
  db: GrinApplicationDb,
  ownerUid: string,
  ledgerId: string,
  receiptId: string
): void {
  ensureFormDraftsTable(db);
  db.runSync(`DELETE FROM form_drafts WHERE id = ? AND user_id = ? AND draft_kind = ?`, [
    planRowId(ownerUid, ledgerId, receiptId),
    ownerUid,
    GRIN_RETURN_PLAN_DRAFT_KIND,
  ]);
}

/**
 * Merge user picks into an existing plan, preserving commandIds for lines that
 * already queued/confirmed with the same quantity. Does not mint a second
 * command for successfully queued work merely because another line failed.
 */
const SUBMITTED_STATUSES = new Set<GrinReturnLineStatus>([
  "queued",
  "confirmed",
  "awaiting_confirmation",
  "conflicted",
  "failed",
  "stopped_version_conflict",
]);

function sameQty(prev: GrinReturnLineIntent, pick: GrinReturnLinePick): boolean {
  return prev.returnQty.value === pick.returnQty.value && prev.returnQty.unit === pick.returnQty.unit;
}

/**
 * Merge picks into an existing plan.
 * Submitted command identities are never replaced because a quantity was edited.
 * Unfinished lines omitted from the new pick list are kept.
 */
export function upsertReturnPlan(input: {
  existing: GrinReturnPlan | null;
  intentId: string;
  ownerUid: string;
  ledgerId: string;
  receiptId: string;
  reason: string;
  picks: GrinReturnLinePick[];
  nowUtc?: string;
}): GrinReturnPlan {
  const nowUtc = input.nowUtc ?? new Date().toISOString();
  const existingLines = input.existing?.lines ?? [];
  const existingByLine = new Map(existingLines.map((line) => [line.lineId, line] as const));
  const seen = new Set<string>();
  const lines: GrinReturnLineIntent[] = [];

  for (const pick of input.picks) {
    seen.add(pick.lineId);
    const prev = existingByLine.get(pick.lineId);
    if (!prev) {
      lines.push({
        lineId: pick.lineId,
        returnQty: pick.returnQty,
        commandId: mintCommandId(),
        status: "pending_submit",
        lastError: null,
      });
      continue;
    }
    if (SUBMITTED_STATUSES.has(prev.status) && !sameQty(prev, pick)) {
      lines.push({
        ...prev,
        lastError: "quantity_edit_blocked",
      });
      continue;
    }
    const retryable =
      prev.status === "failed" ||
      prev.status === "pending_submit" ||
      prev.status === "stopped_version_conflict";
    lines.push({
      ...prev,
      returnQty: SUBMITTED_STATUSES.has(prev.status) ? prev.returnQty : pick.returnQty,
      commandId: prev.commandId,
      status:
        prev.status === "confirmed" ||
        prev.status === "queued" ||
        prev.status === "awaiting_confirmation" ||
        prev.status === "conflicted"
          ? prev.status
          : retryable
            ? "pending_submit"
            : prev.status,
      lastError:
        prev.status === "queued" ||
        prev.status === "awaiting_confirmation" ||
        prev.status === "confirmed" ||
        prev.status === "conflicted"
          ? prev.lastError
          : null,
    });
  }

  for (const prev of existingLines) {
    if (seen.has(prev.lineId)) continue;
    if (prev.status === "confirmed") continue;
    lines.push(prev);
  }

  return {
    planId: input.existing?.planId ?? `grp_${mintCommandId().slice(5)}`,
    intentId: input.existing?.intentId ?? input.intentId,
    ownerUid: input.ownerUid,
    ledgerId: input.ledgerId,
    receiptId: input.receiptId.trim(),
    reason: input.existing?.reason?.trim() ? input.existing.reason : input.reason.trim(),
    lines,
    createdAtUtc: input.existing?.createdAtUtc ?? nowUtc,
    updatedAtUtc: nowUtc,
  };
}

export function allReturnLinesTerminal(plan: GrinReturnPlan): boolean {
  return plan.lines.every(
    (line) => line.status === "confirmed" || line.status === "conflicted" || line.status === "failed"
  );
}

export function allReturnLinesConfirmed(plan: GrinReturnPlan): boolean {
  return plan.lines.length > 0 && plan.lines.every((line) => line.status === "confirmed");
}
