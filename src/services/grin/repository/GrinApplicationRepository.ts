import type {
  AmendFieldsBody,
  DispatchReturnBody,
  RecordEwbObservationBody,
  RecordQcBody,
} from "@/goodsEvidence/command";
import { assembleManifest, mayMarkComplete } from "@/goodsEvidence/evidencePack";
import {
  appendPortalObservation,
  emptyEwbHistories,
  type EwbHistories,
} from "@/goodsEvidence/ewb";
import { evaluateAllExceptionRules, type GrinExceptionBundle } from "@/goodsEvidence/exceptions";
import type { GrinCommandType, OutboxLocalState } from "@/goodsEvidence/ports";
import { cloneSnapshot } from "@/goodsEvidence/snapshot";
import { peekQueuedCommand, type GrinOutbox } from "@/services/grin/outbox/outbox";
import { mintCommandId, mintReceiptId } from "@/services/grin/outbox/ids";
import type { GrinDispatchSession, GrinLocalReceiptView } from "@/services/grin/outbox/types";

import { asApplicationOutbox, type GrinMutationQueueInput } from "./outboxContract";
import {
  GRIN_MUTATION_QUEUE_UNINJECTED,
  GRIN_SESSION_RETIRED,
} from "./sessionErrors";
import {
  GRIN_APPLICATION_REPOSITORY_KIND,
  GRIN_APPLICATION_REPOSITORY_LABEL,
  GRIN_PRICING_QUOTA_UNRESOLVED,
  grinRepositoryIsFake,
} from "./labels";
import { incompleteListItem, parseRegisterBody, toApplicationRecord, toListItem } from "./snapshot";
import type {
  GrinAmendInput,
  GrinApplicationAttachment,
  GrinApplicationDb,
  GrinApplicationExceptionView,
  GrinApplicationListItem,
  GrinApplicationLookup,
  GrinApplicationPackExport,
  GrinApplicationRecord,
  GrinApplicationRepositoryDeps,
  GrinCreateInput,
  GrinEwbObservationInput,
  GrinIncompleteReceipt,
  GrinLocalHistoryItem,
  GrinQcInput,
  GrinReturnInput,
} from "./types";

type CommandRowLite = {
  command_id: string;
  command_type: string;
  digest: string;
  local_state: string;
  frozen_payload_json: string;
};

const LOCAL_STATES: readonly OutboxLocalState[] = [
  "draft",
  "queued",
  "dispatching",
  "issued",
  "attachment_pending",
  "conflicted",
  "failed_retryable",
  "failed_permanent",
];

function parseLocalState(raw: string): OutboxLocalState | "unknown_incomplete" {
  return (LOCAL_STATES as readonly string[]).includes(raw) ? (raw as OutboxLocalState) : "unknown_incomplete";
}

/**
 * WAVE-2 APPLICATION repository. Not GrinFixtureRepository.
 * Reads/writes only through GrinOutbox. Never invents issuedNumber or
 * serverRegisteredAtUtc. Never calls beginOwnerSession to revive a session.
 */
export class GrinApplicationRepository {
  static readonly label = GRIN_APPLICATION_REPOSITORY_LABEL;
  static readonly kind = GRIN_APPLICATION_REPOSITORY_KIND;
  static readonly wave = "wave2-application-outbox";
  static readonly isFake = false;
  static readonly pricingQuotaBlocker = GRIN_PRICING_QUOTA_UNRESOLVED;

  readonly label = GRIN_APPLICATION_REPOSITORY_LABEL;
  readonly isFake = false;

  private readonly outbox: GrinOutbox;
  private readonly db: GrinApplicationDb;
  private readonly ownerUid: string;
  private readonly ledgerId: string;
  private readonly session: GrinDispatchSession;
  private readonly isBindingLive: ((session: GrinDispatchSession) => boolean) | null;

  constructor(deps: GrinApplicationRepositoryDeps) {
    this.outbox = deps.outbox;
    this.db = deps.db;
    this.ownerUid = deps.ownerUid;
    this.ledgerId = deps.ledgerId;
    this.session = deps.session;
    this.isBindingLive = deps.isBindingLive ?? null;
    if (grinRepositoryIsFake(this.label)) {
      throw new Error("application_repository_must_not_be_fake");
    }
    if (this.session.ownerUid !== this.ownerUid) {
      throw new Error("owner_mismatch");
    }
  }

  originatingSession(): GrinDispatchSession {
    return { ownerUid: this.session.ownerUid, dispatchGeneration: this.session.dispatchGeneration };
  }

  list(): GrinApplicationListItem[] {
    this.assertLive("read");
    return this.listViews()
      .map((view) => {
        const record = this.recordFromView(view);
        return record ? toListItem(record) : incompleteListItem(view);
      })
      .sort((a, b) => b.receiptId.localeCompare(a.receiptId));
  }

  get(receiptId: string): GrinApplicationRecord | null {
    const lookup = this.lookup(receiptId);
    return lookup && lookup.projection === "readable" ? lookup : null;
  }

  lookup(receiptId: string): GrinApplicationLookup | null {
    this.assertLive("read");
    const trimmed = receiptId.trim();
    if (!trimmed) return null;
    const view = this.outbox.getRecord(this.ownerUid, this.ledgerId, trimmed);
    if (!view) return null;
    const record = this.recordFromView(view);
    return record ?? this.incompleteFromView(view);
  }

  createQueued(input: GrinCreateInput): GrinApplicationRecord {
    this.assertLive("write");
    const receiptId = input.receiptId.trim() || mintReceiptId();
    const body = cloneSnapshot({ ...input, receiptId });
    const queued = this.outbox.persistDraftAndQueue(this.session, {
      ledgerId: this.ledgerId,
      receiptId,
      body,
    });
    if (queued.issuedNumber != null) {
      throw new Error("issued_number_must_come_from_server");
    }
    const record = this.recordFromView(queued);
    if (!record) {
      throw new Error("queued_record_unreadable");
    }
    return record;
  }

  amend(input: GrinAmendInput): GrinApplicationRecord {
    if (!input.reason.trim()) throw new Error("amend_reason_required");
    const body: AmendFieldsBody = {
      receiptId: input.receiptId.trim(),
      expectedVersion: this.clientExpectedVersion(input.receiptId),
      reason: input.reason.trim(),
      changes: cloneSnapshot(input.changes),
      clientObservedAtUtc: new Date().toISOString(),
    };
    return this.queueMutationAndReload({
      receiptId: body.receiptId,
      commandType: "amendFields",
      body,
    });
  }

  recordQc(input: GrinQcInput): GrinApplicationRecord {
    if (!input.reason.trim()) throw new Error("qc_reason_required");
    const body: RecordQcBody = {
      receiptId: input.receiptId.trim(),
      expectedVersion: this.clientExpectedVersion(input.receiptId),
      reason: input.reason.trim(),
      qcStatus: input.qcStatus,
      clientObservedAtUtc: new Date().toISOString(),
    };
    return this.queueMutationAndReload({
      receiptId: body.receiptId,
      commandType: "recordQc",
      body,
    });
  }

  dispatchReturn(input: GrinReturnInput): GrinApplicationRecord {
    if (!input.reason.trim()) throw new Error("return_reason_required");
    const body: DispatchReturnBody = {
      receiptId: input.receiptId.trim(),
      expectedVersion: this.clientExpectedVersion(input.receiptId),
      reason: input.reason.trim(),
      lineId: input.lineId,
      returnQty: cloneSnapshot(input.returnQty),
      clientObservedAtUtc: new Date().toISOString(),
    };
    return this.queueMutationAndReload({
      receiptId: body.receiptId,
      commandType: "dispatchReturn",
      body,
    });
  }

  recordEwbObservation(input: GrinEwbObservationInput): GrinApplicationRecord {
    const body: RecordEwbObservationBody = {
      receiptId: input.receiptId.trim(),
      expectedVersion: this.clientExpectedVersion(input.receiptId),
      reason: input.reason.trim() || "Recorded e-way bill observation — not portal authority.",
      clientObservedAtUtc: new Date().toISOString(),
      channel: input.channel ?? "portal",
      observation: cloneSnapshot(input.observation),
    };
    return this.queueMutationAndReload({
      receiptId: body.receiptId,
      commandType: "recordEwbObservation",
      body,
    });
  }

  history(receiptId: string): GrinLocalHistoryItem[] {
    this.assertLive("read");
    const trimmed = receiptId.trim();
    if (!trimmed) return [];
    const rows = this.db.getAllSync<CommandRowLite>(
      `SELECT command_id, command_type, digest, local_state, frozen_payload_json
         FROM grin_outbox_commands
        WHERE owner_uid = ? AND ledger_id = ? AND receipt_id = ?
        ORDER BY created_at ASC`,
      [this.ownerUid, this.ledgerId, trimmed]
    );
    return rows.map((row) => ({
      commandId: row.command_id,
      commandType: (row.command_type as GrinCommandType) ?? "unreadable",
      localState: parseLocalState(row.local_state),
      digest: typeof row.digest === "string" && row.digest ? row.digest : null,
      source: "local_outbox_queue" as const,
    }));
  }

  attachments(receiptId: string): GrinApplicationAttachment[] {
    this.assertLive("read");
    const trimmed = receiptId.trim();
    if (!trimmed) return [];
    return this.outbox.listLocalFiles(this.ownerUid, this.ledgerId, trimmed).map((file) => {
      const verification =
        file.uploadState === "verified" && file.originalDurable
          ? "verified"
          : file.uploadState === "failed_retryable"
            ? "failed"
            : "pending";
      const complete = verification === "verified" && file.role === "original" && file.originalDurable;
      return {
        evidenceId: file.evidenceId,
        role: file.role,
        localPathPresent: Boolean(file.localPath),
        uploadState: file.uploadState,
        originalDurable: file.originalDurable,
        byteSize: file.byteSize,
        claimedSha256: file.claimedSha256,
        completeness: complete ? "complete" : "not_complete",
        verification,
        isDerivative: file.role !== "original",
      };
    });
  }

  ewbHistories(receiptId: string): EwbHistories {
    this.assertLive("read");
    let histories = emptyEwbHistories();
    for (const item of this.history(receiptId)) {
      if (item.commandType !== "recordEwbObservation") continue;
      const queued = peekQueuedCommand(this.db, this.ownerUid, this.ledgerId, item.commandId);
      const observation = observationFromQueuedPayload(queued?.frozenPayload);
      if (!observation) continue;
      const appended = appendPortalObservation(histories, observation);
      if (appended.ok) histories = appended.histories;
    }
    return histories;
  }

  exportPack(receiptId: string): GrinApplicationPackExport | null {
    const lookup = this.lookup(receiptId);
    if (!lookup) return null;
    this.assertLive("read");
    const trimmed = receiptId.trim();
    const originalSnapshots = lookup.projection === "readable" ? [lookup.original] : [];
    const missingOrUnverifiable = [
      "server event cut is not retained locally",
      "no verified originals retained locally",
    ];
    if (lookup.projection === "unknown_incomplete") {
      missingOrUnverifiable.push("receipt projection is unknown or incomplete");
    }
    const commercial = lookup.projection === "readable" ? lookup.body.commercial : null;
    const invoiceReferenceIsNotRetainedInvoice = commercial?.supplierInvoiceNumber.kind === "present";
    const challanIsNotInvoice = commercial?.challanNumber.kind === "present";
    const manifest = assembleManifest({
      exportId: `local-export-${this.ownerUid}-${this.ledgerId}-${trimmed}`,
      ownerUid: this.ownerUid,
      ledgerId: this.ledgerId,
      purchaseCaseId: `case-${trimmed}`,
      pinnedCuts: [],
      verifiedOriginals: [],
      artifactHashes: {},
      missingOrUnverifiable,
      eventStreams: [],
      originalSnapshots,
      inventoryDispositions: [],
      evidenceLinks: {},
      templateVersion: "grin-application-pack-v1",
    });
    const complete = mayMarkComplete(manifest);
    return {
      manifest,
      completenessLabel: complete ? "complete" : "incomplete",
      itcDisposition: "not_determined",
      invoiceReferenceIsNotRetainedInvoice,
      challanIsNotInvoice,
      missingOriginal: true,
    };
  }

  exceptions(receiptId: string): GrinApplicationExceptionView | null {
    const lookup = this.lookup(receiptId);
    if (!lookup) return null;
    const bundle = exceptionBundleFromLookup(lookup, this.history(receiptId));
    return {
      evaluations: evaluateAllExceptionRules(bundle),
      itcAlwaysNotDetermined: true,
      sourceKind: "unknown_incomplete",
    };
  }

  queuedReturnQty(receiptId: string, lineId: string): { unit: string; value: string } | null {
    this.assertLive("read");
    for (const item of this.history(receiptId).slice().reverse()) {
      if (item.commandType !== "dispatchReturn") continue;
      const queued = peekQueuedCommand(this.db, this.ownerUid, this.ledgerId, item.commandId);
      const payload = queued?.frozenPayload;
      if (!payload || typeof payload !== "object") continue;
      const rec = payload as Partial<DispatchReturnBody>;
      if (rec.lineId !== lineId) continue;
      if (!rec.returnQty || typeof rec.returnQty.value !== "string") return null;
      return { unit: rec.returnQty.unit, value: rec.returnQty.value };
    }
    return null;
  }

  private queueMutationAndReload(input: Omit<GrinMutationQueueInput, "ledgerId">): GrinApplicationRecord {
    this.assertLive("write");
    const persist = asApplicationOutbox(this.outbox).persistMutationAndQueue;
    if (typeof persist !== "function") {
      throw new Error(GRIN_MUTATION_QUEUE_UNINJECTED);
    }
    persist.call(this.outbox, this.session, {
      ledgerId: this.ledgerId,
      receiptId: input.receiptId,
      commandType: input.commandType,
      body: input.body,
      commandId: input.commandId ?? mintCommandId(),
    });
    const record = this.get(input.receiptId);
    if (!record) throw new Error("queued_record_unreadable");
    return record;
  }

  /**
   * Client does not invent a server event version. 0 means no retained stream.
   */
  private clientExpectedVersion(_receiptId: string): number {
    return 0;
  }

  private listViews(): GrinLocalReceiptView[] {
    const scoped = asApplicationOutbox(this.outbox).listForOwnerAndLedger;
    if (typeof scoped === "function") {
      return scoped.call(this.outbox, this.ownerUid, this.ledgerId);
    }
    return this.outbox.listForOwner(this.ownerUid).filter((view) => view.ledgerId === this.ledgerId);
  }

  private assertLive(kind: "read" | "write" | "publish"): void {
    if (this.session.ownerUid !== this.ownerUid) {
      throw new Error("owner_mismatch");
    }
    if (this.isBindingLive && !this.isBindingLive(this.session)) {
      throw new Error(GRIN_SESSION_RETIRED);
    }
    if (!this.outbox.isSessionCurrent(this.session)) {
      throw new Error(GRIN_SESSION_RETIRED);
    }
    void kind;
  }

  private recordFromView(view: GrinLocalReceiptView): GrinApplicationRecord | null {
    if (view.ownerUid !== this.ownerUid || view.ledgerId !== this.ledgerId) return null;
    const payload = this.readPayload(view);
    const body = parseRegisterBody(payload);
    if (!body) return null;
    return toApplicationRecord(view, body);
  }

  private incompleteFromView(view: GrinLocalReceiptView): GrinIncompleteReceipt {
    return {
      projection: "unknown_incomplete",
      receiptId: view.receiptId,
      ownerUid: view.ownerUid,
      ledgerId: view.ledgerId,
      localState: view.localState,
      issuedNumber: view.issuedNumber,
      serverRegisteredAtUtc: view.serverRegisteredAtUtc,
      commandId: view.commandId,
    };
  }

  private readPayload(view: GrinLocalReceiptView): unknown {
    try {
      const queued = peekQueuedCommand(this.db, view.ownerUid, view.ledgerId, view.commandId);
      if (queued) return queued.frozenPayload;
    } catch {
      // Corrupt command JSON is an incomplete projection, not a throw.
    }
    const row = this.db.getFirstSync<{ payload_json: string }>(
      `SELECT payload_json FROM grin_local_receipts WHERE owner_uid = ? AND ledger_id = ? AND receipt_id = ?`,
      [view.ownerUid, view.ledgerId, view.receiptId]
    );
    if (!row?.payload_json) return null;
    try {
      return JSON.parse(row.payload_json) as unknown;
    } catch {
      return null;
    }
  }
}

function observationFromQueuedPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return null;
  const rec = payload as Partial<RecordEwbObservationBody>;
  return rec.observation ?? null;
}

function exceptionBundleFromLookup(
  lookup: GrinApplicationLookup,
  history: GrinLocalHistoryItem[]
): GrinExceptionBundle {
  const readable = lookup.projection === "readable" ? lookup : null;
  const ewbPresent = readable?.body.ewb.kind === "present";
  const invoiceLinked = readable?.body.commercial.supplierInvoiceNumber.kind === "present";
  const challanLinked = readable?.body.commercial.challanNumber.kind === "present";
  const returnRecorded = history.some((item) => item.commandType === "dispatchReturn");
  return {
    evaluatedAtUtc: new Date().toISOString(),
    observation: {
      observedAtUtc: new Date().toISOString(),
      source: "Local GRIN projection — not a live GST or e-way bill portal",
      sourceKind: "unknown_incomplete",
    },
    ewbPresent: Boolean(ewbPresent),
    invoiceLinked: Boolean(invoiceLinked),
    bookEntryPresent: false,
    ewbApplicability: "unknown",
    ewbLinked: Boolean(ewbPresent),
    inwardEwbPresent: Boolean(ewbPresent),
    grinPresent: lookup.issuedNumber != null,
    challanLinked: Boolean(challanLinked),
    ewbCancelled: false,
    cancellationEvidence: null,
    partyMatch: "unknown",
    amountMatch: "unknown",
    isGoodsPurchase: true,
    isServiceOrIsd: false,
    hasDirectDeliveryEvidence: false,
    importCoverage: "none",
    appearsIn2b: "unknown",
    isGstReportedGoodsPurchase: true,
    grinOrInvoicePresent: lookup.issuedNumber != null || Boolean(invoiceLinked),
    supplierStatus: "unknown",
    returnRecorded,
    returnEwbPresent: false,
    creditNotePresent: false,
    returnDocumentCoverage: "none",
  };
}

export { draftFromFormDefaults, presentText } from "./form";
export {
  GRIN_APPLICATION_LEDGER_ID,
  GRIN_APPLICATION_REPOSITORY_KIND,
  GRIN_APPLICATION_REPOSITORY_LABEL,
  GRIN_PRICING_QUOTA_UNRESOLVED,
  grinRepositoryIsFake,
} from "./labels";
