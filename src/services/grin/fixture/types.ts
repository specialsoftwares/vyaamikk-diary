import type { OriginalEvidence } from "@/goodsEvidence/evidence";
import type {
  EvidenceItemDisposition,
  EvidenceLinkage,
  EvidencePackManifest,
  EventStreamCutInput,
  PinnedEventCut,
} from "@/goodsEvidence/evidencePack";
import type { EwbCancellationEvidence, EwbHistories } from "@/goodsEvidence/ewb";
import type {
  ExceptionEvaluation,
  GrinExceptionBundle,
} from "@/goodsEvidence/exceptions";
import type { LineQuantityLedgers } from "@/goodsEvidence/quantities";
import type { OutboxLocalState } from "@/goodsEvidence/ports";
import type { GrinEvent, GrinView, ImmutableGrin, QcStatus } from "@/goodsEvidence/types";
import type { RegisterGoodsReceiptBody } from "@/goodsEvidence/command";

export type GrinFixtureAttachmentStatus = "pending" | "verified" | "failed" | "rejected";

export type GrinFixtureAttachment = {
  evidenceId: string;
  /** Review label — fixture bytes are not stored originals. */
  fixtureLabel: "GrinFixtureAttachment";
  category: OriginalEvidence["category"];
  displayName: string;
  verification: GrinFixtureAttachmentStatus;
  isDerivative: boolean;
  isRetainedOriginal: boolean;
  /** Invoice number on the GRIN is never this retained original. */
  isInvoiceReferenceOnly: boolean;
  /** Challan files are not invoices. */
  isChallan: boolean;
  completeness: "complete" | "not_complete";
};

export type GrinPackFixtureSpec = {
  purchaseCaseId: string;
  verifiedOriginals: OriginalEvidence[];
  artifactHashes: Record<string, string>;
  missingOrUnverifiable: string[];
  inventoryDispositions: EvidenceItemDisposition[];
  evidenceLinks: Record<string, EvidenceLinkage>;
};

export type GrinFixtureRecord = {
  /** Always this class name so Team 5 can grep fakes. */
  fixtureKind: "GrinFixtureRecord";
  receiptId: string;
  localState: OutboxLocalState;
  original: ImmutableGrin;
  effective: ImmutableGrin;
  view: GrinView;
  events: GrinEvent[];
  ewbHistories: EwbHistories;
  lineLedgers: Record<string, LineQuantityLedgers>;
  attachments: GrinFixtureAttachment[];
  exceptionBundle: GrinExceptionBundle;
  packSpec: GrinPackFixtureSpec;
  gateRefusal: "none" | "refused_at_gate" | "received_then_rejected";
};

export type GrinListItem = {
  receiptId: string;
  displayNumber: string | null;
  supplierName: string;
  localState: OutboxLocalState;
  custody: ImmutableGrin["custody"];
  qcStatus: QcStatus | null;
  captureProvenance: ImmutableGrin["captureProvenance"];
  reportedArrivalAt: string;
  serverRegisteredAtUtc: string | null;
  offlinePending: boolean;
  gateRefusal: GrinFixtureRecord["gateRefusal"];
};

export type GrinCreateInput = RegisterGoodsReceiptBody;

export type GrinAmendInput = {
  receiptId: string;
  reason: string;
  changes: Record<string, unknown>;
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
  /** Material quantity in the line's material unit — never a weight or package count. */
  returnQtyValue: string;
  returnQtyUnit: string;
};

export type GrinEwbPortalInput = {
  receiptId: string;
  status: "generated_active" | "cancelled" | "expired" | "closed" | "unknown";
  source: string;
  observedAtUtc: string;
  verificationLevel: "user_reported" | "imported_document";
  evidence?: EwbCancellationEvidence;
};

export type GrinPackExport = {
  manifest: EvidencePackManifest;
  completenessLabel: "complete" | "incomplete";
  itcDisposition: "not_determined";
  invoiceReferenceIsNotRetainedInvoice: boolean;
  challanIsNotInvoice: boolean;
  missingOriginal: boolean;
};

export type GrinExceptionView = {
  evaluations: ExceptionEvaluation[];
  itcAlwaysNotDetermined: true;
};

export type { EventStreamCutInput, PinnedEventCut };
