import type {
  AmendFieldsBody,
  RecordEwbObservationBody,
  RegisterGoodsReceiptBody,
} from "@/goodsEvidence/command";
import type { EvidencePackManifest } from "@/goodsEvidence/evidencePack";
import type { ExceptionEvaluation } from "@/goodsEvidence/exceptions";
import type { GrinCommandType, OutboxLocalState } from "@/goodsEvidence/ports";
import type { Quantity } from "@/goodsEvidence/quantities";
import type { CaptureProvenance, CustodyState, ImmutableGrin, QcStatus } from "@/goodsEvidence/types";
import type { GrinOutbox } from "@/services/grin/outbox/outbox";
import type { GrinDispatchSession, GrinLocalEvidenceFile, GrinLocalReceiptView } from "@/services/grin/outbox/types";

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

export type GrinProjectionCompleteness = "readable" | "unknown_incomplete";

export type GrinGateRefusal = "none" | "refused_at_gate" | "received_then_rejected" | "unknown_incomplete";

export type GrinApplicationListItem = {
  receiptId: string;
  displayNumber: string | null;
  supplierName: string | null;
  localState: OutboxLocalState;
  /** Null when the local projection is missing or corrupt — never invented. */
  custody: CustodyState | null;
  qcStatus: QcStatus | null;
  captureProvenance: CaptureProvenance | null;
  reportedArrivalAt: string | null;
  serverRegisteredAtUtc: string | null;
  offlinePending: boolean;
  gateRefusal: GrinGateRefusal;
  projection: GrinProjectionCompleteness;
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
  gateRefusal: GrinGateRefusal;
  projection: "readable";
};

export type GrinIncompleteReceipt = {
  projection: "unknown_incomplete";
  receiptId: string;
  ownerUid: string;
  ledgerId: string;
  localState: OutboxLocalState;
  issuedNumber: string | null;
  serverRegisteredAtUtc: string | null;
  commandId: string;
};

export type GrinApplicationLookup = GrinApplicationRecord | GrinIncompleteReceipt;

export type GrinLocalHistoryItem = {
  commandId: string;
  commandType: GrinCommandType | "unreadable";
  localState: OutboxLocalState | "unknown_incomplete";
  digest: string | null;
  /** Local outbox row — not a server event id. */
  source: "local_outbox_queue";
};

export type GrinApplicationAttachment = {
  evidenceId: string;
  role: GrinLocalEvidenceFile["role"];
  localPathPresent: boolean;
  uploadState: GrinLocalEvidenceFile["uploadState"];
  originalDurable: boolean;
  byteSize: number | null;
  claimedSha256: string | null;
  completeness: "complete" | "not_complete";
  verification: "pending" | "verified" | "failed";
  isDerivative: boolean;
};

export type GrinApplicationPackExport = {
  manifest: EvidencePackManifest;
  completenessLabel: "complete" | "incomplete";
  itcDisposition: "not_determined";
  invoiceReferenceIsNotRetainedInvoice: boolean;
  challanIsNotInvoice: boolean;
  missingOriginal: boolean;
};

export type GrinApplicationExceptionView = {
  evaluations: ExceptionEvaluation[];
  itcAlwaysNotDetermined: true;
  sourceKind: "unknown_incomplete";
};

export type GrinAmendInput = {
  receiptId: string;
  reason: string;
  changes: AmendFieldsBody["changes"];
};

export type GrinQcInput = {
  receiptId: string;
  reason: string;
  qcStatus: QcStatus;
};

export type GrinReturnInput = {
  receiptId: string;
  reason: string;
  lineId: string;
  returnQty: Quantity;
};

export type GrinEwbObservationInput = {
  receiptId: string;
  reason: string;
  observation: RecordEwbObservationBody["observation"];
  channel?: RecordEwbObservationBody["channel"];
};

export type GrinApplicationRepositoryDeps = {
  outbox: GrinOutbox;
  db: GrinApplicationDb;
  ownerUid: string;
  ledgerId: string;
  session: GrinDispatchSession;
  /**
   * Extra live-owner check (UID + dispatchGeneration). Binding injects this so a
   * stale captured repo cannot queue after B is current, even before sqlite
   * retirement if the in-memory live token already moved.
   */
  isBindingLive?: (session: GrinDispatchSession) => boolean;
};
