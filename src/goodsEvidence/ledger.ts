import { GOODS_EVIDENCE_SCHEMA_VERSION, GOODS_EVIDENCE_SIMULATION_NOTICE } from "./constants";
import { freezeCommand, type FrozenCommand, type RegisterGoodsReceiptBody } from "./command";
import type { AmendFieldsBody, DispatchReturnBody, RecordQcBody, VoidWithReasonBody } from "./command";
import { isGoodsEvidenceEnabled } from "./featureFlag";
import { formatGrinNumber } from "./grinNumber";
import { hashEventEnvelope, hashOriginalSnapshot } from "./hashChain";
import { applyReturnDispatch, emptyLedgers, type LineQuantityLedgers } from "./quantities";
import { financialYearTokenForIstInstant, formatUtcIso } from "./time";
import type { CommandAdmission, GrinEvent, GrinView, ImmutableGrin } from "./types";

export interface LedgerClock {
  nowMs: () => number;
  uuid: () => string;
}

export interface RegisterSuccess {
  ok: true;
  replayed: boolean;
  receiptId: string;
  issuedNumber: string;
  serial: number;
  serverRegisteredAtUtc: string;
  eventVersion: number;
  headHash: string;
}

export type RegisterOutcome = RegisterSuccess | (CommandAdmission & { ok: false });

interface DedupeRecord {
  digest: string;
  result: RegisterSuccess;
}

interface ReceiptState {
  original: ImmutableGrin;
  events: GrinEvent[];
  view: GrinView;
  lineLedgers: Map<string, LineQuantityLedgers>;
}

/**
 * SIMULATED in-memory command processor for domain/sequence tests.
 * Not a deployed callable, not distributed multi-device sequencing,
 * not durable SQLite/Firestore storage, not a Storage originals pipeline.
 */
export class InMemoryGoodsLedger {
  /** Review label — this class is a test double, not a deployed ledger. */
  static readonly simulationNotice = GOODS_EVIDENCE_SIMULATION_NOTICE;

  private readonly grins = new Map<string, ReceiptState>();
  private readonly dedupe = new Map<string, DedupeRecord>();
  private readonly nextSerialByFy = new Map<string, number>();

  constructor(
    private readonly ownerUid: string,
    private readonly ledgerId: string,
    private readonly clock: LedgerClock
  ) {}

  getOriginal(receiptId: string): ImmutableGrin | undefined {
    return this.grins.get(receiptId)?.original;
  }

  getEvents(receiptId: string): GrinEvent[] {
    return this.grins.get(receiptId)?.events.slice() ?? [];
  }

  getView(receiptId: string): GrinView | undefined {
    const view = this.grins.get(receiptId)?.view;
    return view ? { ...view } : undefined;
  }

  getLineLedger(receiptId: string, lineId: string): LineQuantityLedgers | undefined {
    return this.grins.get(receiptId)?.lineLedgers.get(lineId);
  }

  register(command: FrozenCommand<RegisterGoodsReceiptBody>): RegisterOutcome {
    if (!isGoodsEvidenceEnabled()) {
      return { ok: false, code: "disabled", detail: "goods evidence is not enabled" };
    }
    if (command.ownerUid !== this.ownerUid || command.ledgerId !== this.ledgerId) {
      return { ok: false, code: "digest_conflict", detail: "owner/ledger mismatch" };
    }
    const key = `${command.ownerUid}/${command.ledgerId}/${command.commandId}`;
    const existing = this.dedupe.get(key);
    if (existing) {
      if (existing.digest !== command.digest) {
        return { ok: false, code: "digest_conflict", detail: "same commandId with a different body" };
      }
      return { ...existing.result, replayed: true };
    }

    const frozen = freezeCommand(command);
    if (frozen.digest !== command.digest) {
      return { ok: false, code: "digest_conflict", detail: "command body is not frozen" };
    }

    const serverMs = this.clock.nowMs();
    const serverRegisteredAtUtc = formatUtcIso(serverMs);
    const fyToken = financialYearTokenForIstInstant(serverMs);
    const serial = this.allocateSerial(fyToken);
    const issuedNumber = formatGrinNumber({
      series: command.body.series,
      fyToken,
      serial,
    });

    const original: ImmutableGrin = {
      schemaVersion: GOODS_EVIDENCE_SCHEMA_VERSION,
      receiptId: command.body.receiptId,
      ownerUid: command.ownerUid,
      ledgerId: command.ledgerId,
      series: command.body.series,
      serial,
      issuedNumber,
      fyToken,
      buyer: command.body.buyer,
      supplier: command.body.supplier,
      commercial: command.body.commercial,
      ewb: command.body.ewb,
      transport: command.body.transport,
      lines: command.body.lines.map((line) => ({ ...line })),
      custody: command.body.custody,
      receivingEmployeeAttributed: command.body.receivingEmployeeAttributed,
      qualityCheckedByAttributed: command.body.qualityCheckedByAttributed,
      remarks: command.body.remarks,
      acknowledgement: command.body.acknowledgement,
      captureProvenance: command.body.captureProvenance,
      capturedAtClientUtc: command.body.capturedAtClientUtc,
      reportedArrivalAt: command.body.reportedArrivalAt,
      reportedArrivalTimeZone: command.body.reportedArrivalTimeZone,
      serverRegisteredAtUtc,
      originalSnapshotHash: null,
    };
    original.originalSnapshotHash = hashOriginalSnapshot(original);

    const event = this.buildEvent({
      receiptId: original.receiptId,
      streamSequence: 1,
      type: "receipt_registered",
      reason: "registerGoodsReceipt",
      expectedPreviousVersion: 0,
      typedChanges: { issuedNumber, serial, fyToken },
      previous: null,
      clientObservedAtUtc: command.body.clientObservedAtUtc,
      serverAcceptedAtUtc: serverRegisteredAtUtc,
    });

    const lineLedgers = new Map<string, LineQuantityLedgers>();
    for (const line of original.lines) {
      const ledgers = emptyLedgers(line.unit);
      ledgers.physicalReceived = { ...line.physicallyReceived };
      if (original.custody === "refused_at_gate") {
        ledgers.acceptedForStock = emptyLedgers(line.unit).acceptedForStock;
      }
      lineLedgers.set(line.lineId, ledgers);
    }

    const view: GrinView = {
      schemaVersion: GOODS_EVIDENCE_SCHEMA_VERSION,
      receiptId: original.receiptId,
      eventVersion: 1,
      headHash: event.eventHash,
      issuedNumber,
      custody: original.custody,
      qcStatus: null,
      voided: false,
      warnings: [],
    };

    this.grins.set(original.receiptId, {
      original,
      events: [event],
      view,
      lineLedgers,
    });

    const result: RegisterSuccess = {
      ok: true,
      replayed: false,
      receiptId: original.receiptId,
      issuedNumber,
      serial,
      serverRegisteredAtUtc,
      eventVersion: 1,
      headHash: event.eventHash,
    };
    this.dedupe.set(key, { digest: command.digest, result: { ...result } });
    return result;
  }

  amend(command: FrozenCommand<AmendFieldsBody>): CommandAdmission & { eventVersion?: number } {
    const gated = this.gate(command, command.body.receiptId, command.body.expectedVersion);
    if (!gated.ok) return gated;
    const state = this.grins.get(command.body.receiptId)!;
    const oldValues: Record<string, unknown> = {};
    for (const key of Object.keys(command.body.changes)) {
      oldValues[key] = (state.view as unknown as Record<string, unknown>)[key] ?? null;
    }
    void command.body.claimedOldValues;
    const event = this.appendEvent(state, {
      type: "field_amended",
      reason: command.body.reason,
      expectedPreviousVersion: command.body.expectedVersion,
      typedChanges: { oldValues, newValues: command.body.changes },
      clientObservedAtUtc: command.body.clientObservedAtUtc,
    });
    return { ok: true, replayed: false, eventVersion: event.streamSequence };
  }

  recordQc(command: FrozenCommand<RecordQcBody>): CommandAdmission & { eventVersion?: number } {
    const gated = this.gate(command, command.body.receiptId, command.body.expectedVersion);
    if (!gated.ok) return gated;
    const state = this.grins.get(command.body.receiptId)!;
    const previousQc = state.view.qcStatus;
    const event = this.appendEvent(state, {
      type: previousQc == null ? "qc_decision" : "qc_reclassified",
      reason: command.body.reason,
      expectedPreviousVersion: command.body.expectedVersion,
      typedChanges: { oldQc: previousQc, newQc: command.body.qcStatus },
      clientObservedAtUtc: command.body.clientObservedAtUtc,
    });
    state.view.qcStatus = command.body.qcStatus;
    if (command.body.qcStatus === "hold") state.view.custody = "held_for_qc";
    return { ok: true, replayed: false, eventVersion: event.streamSequence };
  }

  dispatchReturn(command: FrozenCommand<DispatchReturnBody>): CommandAdmission & { eventVersion?: number } {
    const gated = this.gate(command, command.body.receiptId, command.body.expectedVersion);
    if (!gated.ok) return gated;
    const state = this.grins.get(command.body.receiptId)!;
    const ledger = state.lineLedgers.get(command.body.lineId);
    if (!ledger) {
      return { ok: false, code: "version_conflict", detail: "unknown line" };
    }
    const physicalBefore = ledger.physicalReceived.value;
    const next = applyReturnDispatch(ledger, command.body.returnQty);
    state.lineLedgers.set(command.body.lineId, next);
    const event = this.appendEvent(state, {
      type: "return_dispatched",
      reason: command.body.reason,
      expectedPreviousVersion: command.body.expectedVersion,
      typedChanges: {
        lineId: command.body.lineId,
        returnQty: command.body.returnQty,
        physicalReceivedUnchanged: next.physicalReceived.value === physicalBefore,
      },
      clientObservedAtUtc: command.body.clientObservedAtUtc,
    });
    state.view.custody = "returned";
    return { ok: true, replayed: false, eventVersion: event.streamSequence };
  }

  voidWithReason(command: FrozenCommand<VoidWithReasonBody>): CommandAdmission & { eventVersion?: number } {
    const gated = this.gate(command, command.body.receiptId, command.body.expectedVersion);
    if (!gated.ok) return gated;
    const state = this.grins.get(command.body.receiptId)!;
    const issuedNumber = state.original.issuedNumber;
    const event = this.appendEvent(state, {
      type: "void_with_reason",
      reason: command.body.reason,
      expectedPreviousVersion: command.body.expectedVersion,
      typedChanges: { issuedNumberPreserved: issuedNumber, linkedReceiptId: command.body.linkedReceiptId },
      clientObservedAtUtc: command.body.clientObservedAtUtc,
    });
    state.view.voided = true;
    return { ok: true, replayed: false, eventVersion: event.streamSequence };
  }

  private gate(
    command: FrozenCommand<unknown>,
    receiptId: string,
    expectedVersion: number
  ): CommandAdmission {
    if (!isGoodsEvidenceEnabled()) {
      return { ok: false, code: "disabled", detail: "goods evidence is not enabled" };
    }
    if (command.ownerUid !== this.ownerUid || command.ledgerId !== this.ledgerId) {
      return { ok: false, code: "digest_conflict", detail: "owner/ledger mismatch" };
    }
    const state = this.grins.get(receiptId);
    if (!state) return { ok: false, code: "version_conflict", detail: "unknown receipt" };
    if (state.view.voided) return { ok: false, code: "voided", detail: "receipt is void" };
    if (state.view.eventVersion !== expectedVersion) {
      return {
        ok: false,
        code: "version_conflict",
        detail: `intervening amendment at version ${state.view.eventVersion}`,
      };
    }
    return { ok: true, replayed: false };
  }

  private allocateSerial(fyToken: string): number {
    const next = this.nextSerialByFy.get(fyToken) ?? 1;
    this.nextSerialByFy.set(fyToken, next + 1);
    return next;
  }

  private appendEvent(
    state: ReceiptState,
    input: {
      type: GrinEvent["type"];
      reason: string;
      expectedPreviousVersion: number;
      typedChanges: Record<string, unknown>;
      clientObservedAtUtc: string;
    }
  ): GrinEvent {
    const previous = state.events[state.events.length - 1] ?? null;
    const event = this.buildEvent({
      receiptId: state.original.receiptId,
      streamSequence: state.events.length + 1,
      previous,
      serverAcceptedAtUtc: formatUtcIso(this.clock.nowMs()),
      ...input,
    });
    state.events.push(event);
    state.view.eventVersion = event.streamSequence;
    state.view.headHash = event.eventHash;
    return event;
  }

  private buildEvent(input: {
    receiptId: string;
    streamSequence: number;
    type: GrinEvent["type"];
    reason: string;
    expectedPreviousVersion: number;
    typedChanges: Record<string, unknown>;
    previous: GrinEvent | null;
    clientObservedAtUtc: string;
    serverAcceptedAtUtc: string;
  }): GrinEvent {
    const eventId = this.clock.uuid();
    const previousHash = input.previous?.eventHash ?? null;
    const eventHash = hashEventEnvelope({
      eventId,
      receiptId: input.receiptId,
      streamSequence: input.streamSequence,
      type: input.type,
      actorUid: this.ownerUid,
      serverAcceptedAtUtc: input.serverAcceptedAtUtc,
      clientObservedAtUtc: input.clientObservedAtUtc,
      reason: input.reason,
      expectedPreviousVersion: input.expectedPreviousVersion,
      typedChanges: input.typedChanges,
      previousHash,
    });
    return {
      schemaVersion: GOODS_EVIDENCE_SCHEMA_VERSION,
      eventId,
      receiptId: input.receiptId,
      streamSequence: input.streamSequence,
      type: input.type,
      actorUid: this.ownerUid,
      serverAcceptedAtUtc: input.serverAcceptedAtUtc,
      clientObservedAtUtc: input.clientObservedAtUtc,
      reason: input.reason,
      expectedPreviousVersion: input.expectedPreviousVersion,
      typedChanges: input.typedChanges,
      previousHash,
      eventHash,
      firestoreCommitTime: null,
    };
  }
}
