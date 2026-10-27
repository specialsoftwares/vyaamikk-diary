/**
 * Persistence-boundary codec. Repositories and the sync adapter exchange the
 * logical record. SQLite stores a versioned envelope when a key is bound.
 * Legacy plaintext stays until migration and is not deleted when the key is missing.
 */

import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha2";

import {
  LocalKeyUnavailable,
  openLocalTextSync,
  sealLocalTextSync,
  type LocalKeyFailure,
} from "@/services/accountDeletion/localDataKey";

const PREFIX = "vyd1:";

export type PayloadOpen =
  | { state: "ready"; value: string; legacy: boolean }
  | { state: "unavailable"; reason: LocalKeyFailure };

type Bound = { key: Uint8Array };

const bound = new Map<string, Bound>();
let sealRequired = true;

export function localPayloadSealRequired(): boolean {
  return sealRequired;
}

/** Node tests that install a fake database and never load a device key. */
export function allowUnsealedLocalPayloadForTests(): void {
  sealRequired = false;
}

export function requireSealedLocalPayloadForTests(): void {
  sealRequired = true;
}

export function bindLocalDataKey(uid: string, key: Uint8Array): void {
  const copy = new Uint8Array(key.byteLength);
  copy.set(key);
  bound.set(uid, { key: copy });
}

export function unbindLocalDataKey(uid: string): void {
  bound.delete(uid);
}

export function boundLocalDataKey(uid: string): Uint8Array | null {
  const found = bound.get(uid);
  return found ? new Uint8Array(found.key) : null;
}

export function sealOwnedPayload(uid: string, plaintext: string): string {
  if (!sealRequired) return plaintext;
  const key = bound.get(uid)?.key;
  if (!key) throw new LocalKeyUnavailable("key_missing");
  return PREFIX + sealLocalTextSync(key, plaintext);
}

export function openOwnedPayload(uid: string, stored: string | null): PayloadOpen {
  if (stored == null) return { state: "ready", value: "", legacy: true };
  if (!stored.startsWith(PREFIX)) return { state: "ready", value: stored, legacy: true };
  if (!sealRequired) return { state: "unavailable", reason: "key_missing" };
  const key = bound.get(uid)?.key;
  if (!key) return { state: "unavailable", reason: "key_missing" };
  const clear = openLocalTextSync(key, stored.slice(PREFIX.length));
  if (clear == null) return { state: "unavailable", reason: "key_corrupt" };
  return { state: "ready", value: clear, legacy: false };
}

export function storeOwnedJson(uid: string, value: unknown): string {
  return sealOwnedPayload(uid, JSON.stringify(value));
}

export function readOwnedJson(uid: string, stored: string): unknown {
  const opened = openOwnedPayload(uid, stored);
  if (opened.state === "unavailable") throw new LocalPayloadUnavailable(opened.reason);
  return JSON.parse(opened.value) as unknown;
}

export function lookupToken(uid: string, logical: string): string {
  if (!sealRequired) return logical;
  const key = bound.get(uid)?.key;
  if (!key) throw new LocalKeyUnavailable("key_missing");
  const mac = hmac(sha256, key, new TextEncoder().encode(`${uid}\0${logical}`));
  let hex = "";
  for (const byte of mac) hex += byte.toString(16).padStart(2, "0");
  return `vydh1.${hex}`;
}

export class LocalPayloadUnavailable extends LocalKeyUnavailable {}

type PayloadDb = {
  runSync(sql: string, params?: unknown[]): unknown;
  getAllSync<T>(sql: string, params?: unknown[]): T[];
};

const PAYLOAD_TABLES = [
  { table: "entries_local", column: "payload_json", id: "id" },
  { table: "entries_local", column: "origin_payload_json", id: "id" },
  { table: "sync_queue", column: "payload_json", id: "id" },
  { table: "form_drafts", column: "payload_json", id: "id" },
  { table: "form_drafts", column: "title", id: "id" },
  { table: "active_route", column: "params_json", id: "user_id" },
] as const;

/**
 * Seals leftover plaintext for one account. Already sealed rows are left
 * untouched. A row that cannot be opened is counted and not deleted.
 */
export function migrateOwnedPayloads(db: PayloadDb, uid: string): {
  sealed: number;
  unreadable: number;
} {
  let sealed = 0;
  let unreadable = 0;
  for (const spec of PAYLOAD_TABLES) {
    const rows = db.getAllSync<{ id: string; value: string | null }>(
      `SELECT ${spec.id} AS id, ${spec.column} AS value FROM ${spec.table} WHERE user_id = ?`,
      [uid]
    );
    for (const row of rows) {
      if (row.value == null || row.value === "") continue;
      const opened = openOwnedPayload(uid, row.value);
      if (opened.state === "unavailable") {
        unreadable += 1;
        continue;
      }
      if (!opened.legacy) continue;
      db.runSync(
        `UPDATE ${spec.table} SET ${spec.column} = ? WHERE ${spec.id} = ? AND user_id = ?`,
        [sealOwnedPayload(uid, opened.value), row.id, uid]
      );
      sealed += 1;
    }
  }
  return { sealed, unreadable };
}

const GRIN_PAYLOAD_COLUMNS = [
  { table: "grin_local_receipts", column: "payload_json" },
  { table: "grin_local_receipts", column: "confirmed_original_json" },
  { table: "grin_local_receipts", column: "confirmed_events_json" },
  { table: "grin_local_receipts", column: "confirmed_effective_json" },
  { table: "grin_outbox_commands", column: "frozen_payload_json" },
] as const;

/** Seals leftover GRIN plaintext for one account. Legacy rows stay readable if this never runs. */
export function migrateGrinOwnedPayloads(db: PayloadDb, uid: string): {
  sealed: number;
  unreadable: number;
} {
  let sealed = 0;
  let unreadable = 0;
  for (const spec of GRIN_PAYLOAD_COLUMNS) {
    const rows = db.getAllSync<{ id: string; value: string | null }>(
      `SELECT id AS id, ${spec.column} AS value FROM ${spec.table} WHERE owner_uid = ?`,
      [uid]
    );
    for (const row of rows) {
      if (row.value == null || row.value === "") continue;
      const opened = openOwnedPayload(uid, row.value);
      if (opened.state === "unavailable") {
        unreadable += 1;
        continue;
      }
      if (!opened.legacy) continue;
      db.runSync(
        `UPDATE ${spec.table} SET ${spec.column} = ? WHERE id = ? AND owner_uid = ?`,
        [sealOwnedPayload(uid, opened.value), row.id, uid]
      );
      sealed += 1;
    }
  }
  return { sealed, unreadable };
}
