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
export function upsertReturnPlan(input: {
  existing: GrinReturnPlan | null;
  ownerUid: string;
  ledgerId: string;
  receiptId: string;
  reason: string;
  picks: GrinReturnLinePick[];
  nowUtc?: string;
}): GrinReturnPlan {
  const nowUtc = input.nowUtc ?? new Date().toISOString();
  const existingByLine = new Map(
    (input.existing?.lines ?? []).map((line) => [line.lineId, line] as const)
  );
  const lines: GrinReturnLineIntent[] = input.picks.map((pick) => {
    const prev = existingByLine.get(pick.lineId);
    const sameQty =
      prev &&
      prev.returnQty.value === pick.returnQty.value &&
      prev.returnQty.unit === pick.returnQty.unit;
    if (
      prev &&
      sameQty &&
      (prev.status === "queued" ||
        prev.status === "confirmed" ||
        prev.status === "awaiting_confirmation" ||
        prev.status === "conflicted" ||
        prev.status === "pending_submit" ||
        prev.status === "failed" ||
        prev.status === "stopped_version_conflict")
    ) {
      // Keep identity. Failed/pending_submit may retry the same commandId.
      const retryable =
        prev.status === "failed" ||
        prev.status === "pending_submit" ||
        prev.status === "stopped_version_conflict";
      return {
        ...prev,
        returnQty: pick.returnQty,
        status:
          prev.status === "confirmed" ||
          prev.status === "queued" ||
          prev.status === "awaiting_confirmation" ||
          prev.status === "conflicted"
            ? prev.status
            : retryable
              ? "pending_submit"
              : prev.status,
        lastError: retryable ? null : prev.lastError,
      };
    }
    return {
      lineId: pick.lineId,
      returnQty: pick.returnQty,
      commandId: prev && sameQty ? prev.commandId : mintCommandId(),
      status: "pending_submit",
      lastError: null,
    };
  });

  return {
    planId: input.existing?.planId ?? `grp_${mintCommandId().slice(5)}`,
    ownerUid: input.ownerUid,
    ledgerId: input.ledgerId,
    receiptId: input.receiptId.trim(),
    reason: input.reason.trim(),
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
