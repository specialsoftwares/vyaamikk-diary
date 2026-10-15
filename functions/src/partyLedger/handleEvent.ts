/**
 * Accepted-record projection caller.
 * Not exported from functions/src/index.ts, so a functions deploy does not
 * register it. PARTY_LEDGER_FUNCTIONS must be "1" before registration.
 * The emulator binds the app transaction and sets PARTY_LEDGER_EMULATOR=1.
 */

import type { Firestore, Transaction } from "firebase-admin/firestore";

export interface PartyLedgerSourceEvent {
  ownerUid: string;
  recordType: string;
  recordId: string;
  sourceEpoch: string;
  revision: string;
  effectiveDay: string;
  acceptedAt: string;
  partyId?: string | null;
  voided?: boolean;
  deleted?: boolean;
  payload?: unknown;
}

export interface PartyLedgerEventStore {
  get(path: string): Promise<Record<string, unknown> | null>;
  set(path: string, data: Record<string, unknown>): void;
  delete(path: string): void;
}

type ApplyFn = (
  store: PartyLedgerEventStore,
  source: PartyLedgerSourceEvent,
  commandId: string
) => Promise<{ kind: string }>;

let applyFn: ApplyFn | null = null;

export function bindPartyLedgerApply(fn: ApplyFn | null): void {
  applyFn = fn;
}

function storeFrom(db: Firestore, tx: Transaction): PartyLedgerEventStore {
  return {
    async get(path: string) {
      const snap = await tx.get(db.doc(path));
      return snap.exists ? (snap.data() as Record<string, unknown>) : null;
    },
    set(path: string, data: Record<string, unknown>) {
      tx.set(db.doc(path), data);
    },
    delete(path: string) {
      tx.delete(db.doc(path));
    },
  };
}

export function partyLedgerTriggerEnabled(): boolean {
  return process.env.PARTY_LEDGER_FUNCTIONS === "1";
}

export async function handlePartyLedgerEvent(
  db: Firestore,
  pathUid: string,
  source: PartyLedgerSourceEvent,
  commandId: string
): Promise<{ status: "disabled" | "denied" | "ran"; result?: { kind: string } }> {
  const enabled =
    process.env.PARTY_LEDGER_FUNCTIONS === "1" || process.env.PARTY_LEDGER_EMULATOR === "1";
  if (!enabled) return { status: "disabled" };
  if (!pathUid || pathUid !== source.ownerUid) return { status: "denied" };
  if (!applyFn) throw new Error("party_ledger_apply_unbound");
  const fn = applyFn;
  const result = await db.runTransaction(async (tx) => fn(storeFrom(db, tx), source, commandId));
  return { status: "ran", result };
}
