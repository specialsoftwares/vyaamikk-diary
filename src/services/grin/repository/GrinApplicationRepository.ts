/**
 * WAVE-2 APPLICATION repository. Not GrinFixtureRepository.
 * Reads/writes only through GrinOutbox listForOwner / persistDraftAndQueue.
 * Never invents issuedNumber or serverRegisteredAtUtc.
 */

import { cloneSnapshot } from "@/goodsEvidence/snapshot";
import { peekQueuedCommand, type GrinOutbox } from "@/services/grin/outbox/outbox";
import { mintReceiptId } from "@/services/grin/outbox/ids";
import type { GrinDispatchSession, GrinLocalReceiptView } from "@/services/grin/outbox/types";
import {
  GRIN_APPLICATION_REPOSITORY_KIND,
  GRIN_APPLICATION_REPOSITORY_LABEL,
  GRIN_PRICING_QUOTA_UNRESOLVED,
  grinRepositoryIsFake,
} from "./labels";
import { parseRegisterBody, toApplicationRecord, toListItem } from "./snapshot";
import type {
  GrinApplicationDb,
  GrinApplicationListItem,
  GrinApplicationRecord,
  GrinApplicationRepositoryDeps,
  GrinCreateInput,
} from "./types";

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
  private session: GrinDispatchSession;

  constructor(deps: GrinApplicationRepositoryDeps) {
    this.outbox = deps.outbox;
    this.db = deps.db;
    this.ownerUid = deps.ownerUid;
    this.ledgerId = deps.ledgerId;
    this.session = deps.session;
    if (grinRepositoryIsFake(this.label)) {
      throw new Error("application_repository_must_not_be_fake");
    }
  }

  list(): GrinApplicationListItem[] {
    return this.outbox
      .listForOwner(this.ownerUid)
      .map((view) => {
        const record = this.recordFromView(view);
        return record ? toListItem(record) : this.fallbackListItem(view);
      })
      .sort((a, b) => b.receiptId.localeCompare(a.receiptId));
  }

  get(receiptId: string): GrinApplicationRecord | null {
    const trimmed = receiptId.trim();
    if (!trimmed) return null;
    const views = this.outbox.listForOwner(this.ownerUid);
    const view = views.find((row) => row.receiptId === trimmed);
    if (!view) return null;
    return this.recordFromView(view);
  }

  createQueued(input: GrinCreateInput): GrinApplicationRecord {
    const session = this.ensureSession();
    const receiptId = input.receiptId.trim() || mintReceiptId();
    const body = cloneSnapshot({ ...input, receiptId });
    const queued = this.outbox.persistDraftAndQueue(session, {
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

  private ensureSession(): GrinDispatchSession {
    if (!this.outbox.isSessionCurrent(this.session)) {
      this.session = this.outbox.beginOwnerSession(this.ownerUid);
    }
    return this.session;
  }

  private recordFromView(view: GrinLocalReceiptView): GrinApplicationRecord | null {
    const payload = this.readPayload(view);
    const body = parseRegisterBody(payload);
    if (!body) return null;
    return toApplicationRecord(view, body);
  }

  private readPayload(view: GrinLocalReceiptView): unknown {
    const queued = peekQueuedCommand(this.db, view.ownerUid, view.ledgerId, view.commandId);
    if (queued) return queued.frozenPayload;
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

  private fallbackListItem(view: GrinLocalReceiptView): GrinApplicationListItem {
    return {
      receiptId: view.receiptId,
      displayNumber: view.issuedNumber,
      supplierName: view.receiptId,
      localState: view.localState,
      custody: "received",
      qcStatus: null,
      captureProvenance: "offline",
      reportedArrivalAt: "",
      serverRegisteredAtUtc: view.serverRegisteredAtUtc,
      offlinePending: view.localState !== "issued" || view.issuedNumber == null,
      gateRefusal: "none",
    };
  }
}

export { draftFromFormDefaults, presentText } from "./form";
export {
  GRIN_APPLICATION_LEDGER_ID,
  GRIN_APPLICATION_REPOSITORY_KIND,
  GRIN_APPLICATION_REPOSITORY_LABEL,
  GRIN_PRICING_QUOTA_UNRESOLVED,
  grinRepositoryIsFake,
} from "./labels";
