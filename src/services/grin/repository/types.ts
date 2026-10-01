import type { RegisterGoodsReceiptBody } from "@/goodsEvidence/command";
import type { OutboxLocalState } from "@/goodsEvidence/ports";
import type { CustodyState, ImmutableGrin, QcStatus } from "@/goodsEvidence/types";
import type { GrinOutbox } from "@/services/grin/outbox/outbox";
import type { GrinDispatchSession, GrinLocalReceiptView } from "@/services/grin/outbox/types";

import type { GRIN_APPLICATION_REPOSITORY_KIND } from "./labels";

/** Minimal sqlite surface used by the application repository. Matches GrinSqlDb. */
export type GrinApplicationDb = {
  runSync: (sql: string, params?: unknown[]) => { changes: number };
  getFirstSync: <T>(sql: string, params?: unknown[]) => T | null;
  getAllSync: <T>(sql: string, params?: unknown[]) => T[];
  execSync: (sql: string) => void;
  withTransactionSync: (fn: () => void) => void;
};

export type GrinCreateInput = RegisterGoodsReceiptBody;

export type GrinApplicationListItem = {
  receiptId: string;
  displayNumber: string | null;
  supplierName: string;
  localState: OutboxLocalState;
  custody: CustodyState;
  qcStatus: QcStatus | null;
  captureProvenance: ImmutableGrin["captureProvenance"];
  reportedArrivalAt: string;
  serverRegisteredAtUtc: string | null;
  offlinePending: boolean;
  gateRefusal: "none" | "refused_at_gate" | "received_then_rejected";
};

export type GrinApplicationRecord = {
  repositoryKind: typeof GRIN_APPLICATION_REPOSITORY_KIND;
  receiptId: string;
  ownerUid: string;
  ledgerId: string;
  localState: OutboxLocalState;
  issuedNumber: string | null;
  serverRegisteredAtUtc: string | null;
  commandId: string;
  digest: string;
  outbox: GrinLocalReceiptView;
  body: RegisterGoodsReceiptBody;
  original: ImmutableGrin;
  effective: ImmutableGrin;
  gateRefusal: GrinApplicationListItem["gateRefusal"];
};

export type GrinApplicationRepositoryDeps = {
  outbox: GrinOutbox;
  db: GrinApplicationDb;
  ownerUid: string;
  ledgerId: string;
  session: GrinDispatchSession;
};
