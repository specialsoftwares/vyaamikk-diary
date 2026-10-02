import type {
  AmendFieldsBody,
  RecordEwbObservationBody,
  RegisterGoodsReceiptBody,
} from "@/goodsEvidence/command";
import type { EvidencePackManifest } from "@/goodsEvidence/evidencePack";
import type { ExceptionEvaluation } from "@/goodsEvidence/exceptions";
import type { EvidenceCategory } from "@/goodsEvidence/evidence";
import type { GrinAttachCategory } from "./attachCategories";
import type { GrinCommandType, OutboxLocalState } from "@/goodsEvidence/ports";
import type { Quantity } from "@/goodsEvidence/quantities";
import type {
  CaptureProvenance,
  CustodyState,
  GrinEventType,
  ImmutableGrin,
  QcStatus,
} from "@/goodsEvidence/types";
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

export type GrinHistoryLane = "confirmed_event" | "outbox_pending" | "outbox_failed" | "outbox_conflicted";

export type GrinLocalHistoryItem = {
  commandId: string | null;
  commandType: GrinCommandType | GrinEventType | "unreadable";
  localState: OutboxLocalState | "confirmed" | "unknown_incomplete";
  digest: string | null;
  /** Confirmed events are distinct from pending/failed/conflicted outbox rows. */
  source: GrinHistoryLane;
  eventId?: string;
  eventVersion?: number;
};

export type GrinAttachOriginalInput = {
  receiptId: string;
  category: GrinAttachCategory | EvidenceCategory;
  localPath: string;
  claimedSha256?: string | null;
  byteSize?: number | null;
  evidenceId?: string;
  mime?: string;
  fileName?: string;
  captureProvenance?: string;
  osConversionOccurred?: boolean | "unknown";
  generation?: string | null;
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

export type GrinPackExportKind = "manifest_and_pdf_summary";

export type GrinApplicationPackExport = {
  manifest: EvidencePackManifest;
  completenessLabel: "complete" | "incomplete";
  itcDisposition: "not_determined";
  invoiceReferenceIsNotRetainedInvoice: boolean;
  challanIsNotInvoice: boolean;
  missingOriginal: boolean;
  /** Inventory evaluation at the pinned cut. Distinct from bundled artifacts. */
  coverage: EvidencePackManifest["coverage"];
  /**
   * Whether original bytes are in the export payload.
   * Current export is a manifest + PDF summary only — originals are not bundled.
   */
  bundledArtifacts: "none";
  exportKind: GrinPackExportKind;
  originalsBundled: false;
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
