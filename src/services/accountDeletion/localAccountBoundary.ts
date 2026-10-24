/**
 * On-device account boundary. Ordinary logout retains unsynced rows.
 * Account deletion removes that account's rows. A query for one account
 * does not return another account's rows.
 */

import { resetLetterheadSaveDiagnostic } from "@/services/letterhead/letterheadSaveDiagnostics";

export const LOCAL_OWNER_TABLES = ["form_drafts", "entries_local", "sync_queue", "active_route"] as const;

export type LocalSql = {
  runSync(sql: string, params?: unknown[]): unknown;
  getAllSync<T>(sql: string, params?: unknown[]): T[];
};

export type LocalRetentionKind = "pending_sync" | "draft" | "session_secret" | "diagnostic" | "search";

export function logoutDisposition(kind: LocalRetentionKind): "retain" | "drop_memory" {
  if (kind === "session_secret" || kind === "diagnostic") return "drop_memory";
  return "retain";
}

export function listOwnedIds(db: LocalSql, table: (typeof LOCAL_OWNER_TABLES)[number], uid: string): string[] {
  const rows = db.getAllSync<{ id: string }>(`SELECT id FROM ${table} WHERE user_id = ?`, [uid]);
  return rows.map((row) => row.id);
}

export function deleteLocalOwnerRows(db: LocalSql, uid: string): void {
  for (const table of LOCAL_OWNER_TABLES) {
    db.runSync(`DELETE FROM ${table} WHERE user_id = ?`, [uid]);
  }
}

const GRIN_OWNER_TABLES = [
  "grin_local_receipts",
  "grin_outbox_commands",
  "grin_owner_runtime",
  "grin_local_evidence_files",
] as const;

/**
 * Account deletion only. Removes one owner's excluded GRIN rows.
 * A missing table is left alone. Logout does not call this.
 */
export function deleteGrinLocalOwnerRows(db: LocalSql, uid: string): void {
  for (const table of GRIN_OWNER_TABLES) {
    try {
      db.runSync(`DELETE FROM ${table} WHERE owner_uid = ?`, [uid]);
    } catch {
      // The excluded module's tables are absent on this database.
    }
  }
}

export function retainLocalAccountOnLogout(uid: string | null | undefined): "retained" {
  resetLetterheadSaveDiagnostic();
  void uid;
  return "retained";
}

export function staleLocalWorkerMayContinue(
  captured: { uid: string; generation: number } | null,
  live: { uid: string; generation: number } | null
): boolean {
  return !!captured && !!live && captured.uid === live.uid && captured.generation === live.generation;
}
