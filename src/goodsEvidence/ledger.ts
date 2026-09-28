import { GOODS_EVIDENCE_SCHEMA_VERSION, GOODS_EVIDENCE_SIMULATION_NOTICE } from "./constants";
import { freezeCommand, type FrozenCommand, type RegisterGoodsReceiptBody } from "./command";
import type {
  AmendFieldsBody,
  CorrectReturnDispatchBody,
  DispatchReturnBody,
  RecordQcBody,
  VoidWithReasonBody,
} from "./command";
import { isGoodsEvidenceEnabled } from "./featureFlag";
import { formatGrinNumber } from "./grinNumber";
import { hashEventEnvelope, hashOriginalSnapshot } from "./hashChain";
import {
  applyReturnCorrection,
  applyReturnDispatch,
  emptyLedgers,
  QuantityBoundError,
  type LineQuantityLedgers,
} from "./quantities";
import { cloneSnapshot, freezeSnapshot } from "./snapshot";
import { financialYearTokenForIstInstant, formatUtcIso } from "./time";
import type { CommandAdmission, GrinEvent, GrinView, ImmutableGrin } from "./types";
import {
  commandReasonError,
  isAmendableGrinField,
  registerBodyError,
} from "./validate";

export interface LedgerClock {
  nowMs: () => number;
  uuid: () => string;
}

/**
 * `production` uses isGoodsEvidenceEnabled (store-or-standalone stays off).
 * `simulated-domain-test` is a labelled in-memory fixture and must not be
 * wired to production admission.
 */
export type LedgerAdmission = "production" | "simulated-domain-test";

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

export type MutationOutcome = (CommandAdmission & { eventVersion?: number });

interface DedupeRecord {
  digest: string;
  result: RegisterSuccess | { ok: true; replayed: boolean; eventVersion: number };
}

interface ReceiptState {
  original: ImmutableGrin;
  effective: ImmutableGrin;
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
    private readonly clock: LedgerClock,
    private readonly admission: LedgerAdmission = "production"
  ) {}

  getOriginal(receiptId: string): ImmutableGrin | undefined {
    const original = this.grins.get(receiptId)?.original;
    return original ? freezeSnapshot(original) : undefined;
  }

  getEffective(receiptId: string): ImmutableGrin | undefined {
    const effective = this.grins.get(receiptId)?.effective;
    return effective ? freezeSnapshot(effective) : undefined;
  }

  getEvents(receiptId: string): GrinEvent[] {
    const events = this.grins.get(receiptId)?.events;
    return events ? freezeSnapshot(events) : [];
  }

  getView(receiptId: string): GrinView | undefined {
    const view = this.grins.get(receiptId)?.view;
    return view ? freezeSnapshot(view) : undefined;
  }

  getLineLedger(receiptId: string, lineId: string): LineQuantityLedgers | undefined {
    const ledger = this.grins.get(receiptId)?.lineLedgers.get(lineId);
    return ledger ? freezeSnapshot(ledger) : undefined;
  }

  register(command: FrozenCommand<RegisterGoodsReceiptBody>): RegisterOutcome {
    const blocked = this.productionBlock();
    if (blocked) return blocked;
    const identity = this.identityError(command);
    if (identity) return identity;
    const digestErr = this.digestError(command);
    if (digestErr) return digestErr;

    const key = this.commandKey(command.commandId);
    const replay = this.replayRegister(key, command.digest);
    if (replay) return replay;

    const existingReceipt = this.grins.get(command.body.receiptId);
    if (existingReceipt) {
      return {
        ok: false,
        code: "receipt_exists",
        detail: "receipt already issued; history cannot be replaced",
      };
    }

    const bodyErr = registerBodyError(command.body);
    if (bodyErr) return { ok: false, code: "invalid", detail: bodyErr };

    const body = cloneSnapshot(command.body);
    const serverMs = this.clock.nowMs();
    const serverRegisteredAtUtc = formatUtcIso(serverMs);
    const fyToken = financialYearTokenForIstInstant(serverMs);
    const serial = this.allocateSerial(fyToken);
    const issuedNumber = formatGrinNumber({
      series: body.series,
      fyToken,
      serial,
    });

    const draft: ImmutableGrin = {
      schemaVersion: GOODS_EVIDENCE_SCHEMA_VERSION,
      receiptId: body.receiptId,
      ownerUid: command.ownerUid,
      ledgerId: command.ledgerId,
      series: body.series,
      serial,
      issuedNumber,
      fyToken,
      buyer: body.buyer,
      supplier: body.supplier,
      commercial: body.commercial,
      ewb: body.ewb,
      transport: body.transport,
      lines: body.lines,
      custody: body.custody,
      receivingEmployeeAttributed: body.receivingEmployeeAttributed,
      qualityCheckedByAttributed: body.qualityCheckedByAttributed,
      remarks: body.remarks,
      acknowledgement: body.acknowledgement,
      warehouse: body.warehouse,
      locationBin: body.locationBin,
      captureProvenance: body.captureProvenance,
      capturedAtClientUtc: body.capturedAtClientUtc,
      reportedArrivalAt: body.reportedArrivalAt,
      reportedArrivalTimeZone: body.reportedArrivalTimeZone,
      serverRegisteredAtUtc,
      originalSnapshotHash: null,
    };
    const originalSnapshotHash = hashOriginalSnapshot(draft);
    const original = cloneSnapshot({ ...draft, originalSnapshotHash });

    const event = this.buildEvent({
      receiptId: original.receiptId,
      streamSequence: 1,
      type: "receipt_registered",
      reason: "issued",
      expectedPreviousVersion: 0,
      typedChanges: { issuedNumber, serial, fyToken, originalSnapshotHash },
      previous: null,
      clientObservedAtUtc: body.clientObservedAtUtc,
      serverAcceptedAtUtc: serverRegisteredAtUtc,
    });

    const lineLedgers = new Map<string, LineQuantityLedgers>();
    for (const line of original.lines) {
      const ledgers = emptyLedgers(line.unit);
      ledgers.physicalReceived = { ...line.physicallyReceived };
      if (original.custody === "refused_at_gate") {
        ledgers.acceptedForStock = emptyLedgers(line.unit).acceptedForStock;
      }
      lineLedgers.set(line.lineId, cloneSnapshot(ledgers));
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
      effective: cloneSnapshot(original),
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

  amend(command: FrozenCommand<AmendFieldsBody>): MutationOutcome {
    const prepared = this.prepareMutation(command, command.body.receiptId, command.body.expectedVersion, command.body.reason);
    if (!prepared.ok) return prepared;
    if (prepared.replayed) return prepared;

    const keys = Object.keys(command.body.changes);
    if (keys.length === 0) {
      return { ok: false, code: "invalid", detail: "amendment changes are required" };
    }
    const oldValues: Record<string, unknown> = {};
    const next = cloneSnapshot(prepared.state.effective);
    for (const key of keys) {
      if (!isAmendableGrinField(key)) {
        return { ok: false, code: "invalid", detail: `field ${key} is not amendable` };
      }
      oldValues[key] = cloneSnapshot((next as unknown as Record<string, unknown>)[key] ?? null);
      (next as unknown as Record<string, unknown>)[key] = cloneSnapshot(command.body.changes[key]);
    }
    void command.body.claimedOldValues;
    prepared.state.effective = next;
    const event = this.appendEvent(prepared.state, {
      type: "field_amended",
      reason: command.body.reason.trim(),
      expectedPreviousVersion: command.body.expectedVersion,
      typedChanges: { oldValues, newValues: cloneSnapshot(command.body.changes) },
      clientObservedAtUtc: command.body.clientObservedAtUtc,
    });
    return this.storeMutation(command, event.streamSequence);
  }

  recordQc(command: FrozenCommand<RecordQcBody>): MutationOutcome {
    const prepared = this.prepareMutation(command, command.body.receiptId, command.body.expectedVersion, command.body.reason);
    if (!prepared.ok) return prepared;
    if (prepared.replayed) return prepared;
    const previousQc = prepared.state.view.qcStatus;
    const event = this.appendEvent(prepared.state, {
      type: previousQc == null ? "qc_decision" : "qc_reclassified",
      reason: command.body.reason.trim(),
      expectedPreviousVersion: command.body.expectedVersion,
      typedChanges: { oldQc: previousQc, newQc: command.body.qcStatus },
      clientObservedAtUtc: command.body.clientObservedAtUtc,
    });
    prepared.state.view.qcStatus = command.body.qcStatus;
    prepared.state.effective = cloneSnapshot({
      ...prepared.state.effective,
    });
    if (command.body.qcStatus === "hold") prepared.state.view.custody = "held_for_qc";
    return this.storeMutation(command, event.streamSequence);
  }

  dispatchReturn(command: FrozenCommand<DispatchReturnBody>): MutationOutcome {
    const prepared = this.prepareMutation(command, command.body.receiptId, command.body.expectedVersion, command.body.reason);
    if (!prepared.ok) return prepared;
    if (prepared.replayed) return prepared;
    const ledger = prepared.state.lineLedgers.get(command.body.lineId);
    if (!ledger) {
      return { ok: false, code: "invalid", detail: "unknown line" };
    }
    try {
      const physicalBefore = ledger.physicalReceived.value;
      const next = applyReturnDispatch(ledger, command.body.returnQty);
      prepared.state.lineLedgers.set(command.body.lineId, next);
      const event = this.appendEvent(prepared.state, {
        type: "return_dispatched",
        reason: command.body.reason.trim(),
        expectedPreviousVersion: command.body.expectedVersion,
        typedChanges: {
          lineId: command.body.lineId,
          returnQty: cloneSnapshot(command.body.returnQty),
          physicalReceivedUnchanged: next.physicalReceived.value === physicalBefore,
        },
        clientObservedAtUtc: command.body.clientObservedAtUtc,
      });
      prepared.state.view.custody = "returned";
      return this.storeMutation(command, event.streamSequence);
    } catch (err) {
      const detail = err instanceof QuantityBoundError ? err.message : "invalid return quantity";
      return { ok: false, code: "invalid", detail };
    }
  }

  correctReturnDispatch(command: FrozenCommand<CorrectReturnDispatchBody>): MutationOutcome {
    const prepared = this.prepareMutation(command, command.body.receiptId, command.body.expectedVersion, command.body.reason);
    if (!prepared.ok) return prepared;
    if (prepared.replayed) return prepared;
    if (!command.body.linkedEventId?.trim()) {
      return { ok: false, code: "invalid", detail: "linkedEventId is required for a return correction" };
    }
    const linked = prepared.state.events.find(
      (event) => event.eventId === command.body.linkedEventId && event.type === "return_dispatched"
    );
    if (!linked) {
      return { ok: false, code: "invalid", detail: "linked return_dispatched event not found" };
    }
    const ledger = prepared.state.lineLedgers.get(command.body.lineId);
    if (!ledger) {
      return { ok: false, code: "invalid", detail: "unknown line" };
    }
    try {
      const next = applyReturnCorrection(ledger, command.body.correctionQty);
      prepared.state.lineLedgers.set(command.body.lineId, next);
      const event = this.appendEvent(prepared.state, {
        type: "return_received",
        reason: command.body.reason.trim(),
        expectedPreviousVersion: command.body.expectedVersion,
        typedChanges: {
          lineId: command.body.lineId,
          linkedEventId: command.body.linkedEventId,
          correctionQty: cloneSnapshot(command.body.correctionQty),
        },
        clientObservedAtUtc: command.body.clientObservedAtUtc,
      });
      return this.storeMutation(command, event.streamSequence);
    } catch (err) {
      const detail = err instanceof QuantityBoundError ? err.message : "invalid correction quantity";
      return { ok: false, code: "invalid", detail };
    }
  }

  voidWithReason(command: FrozenCommand<VoidWithReasonBody>): MutationOutcome {
    const prepared = this.prepareMutation(command, command.body.receiptId, command.body.expectedVersion, command.body.reason);
    if (!prepared.ok) return prepared;
    if (prepared.replayed) return prepared;
    const issuedNumber = prepared.state.original.issuedNumber;
    const event = this.appendEvent(prepared.state, {
      type: "void_with_reason",
      reason: command.body.reason.trim(),
      expectedPreviousVersion: command.body.expectedVersion,
      typedChanges: { issuedNumberPreserved: issuedNumber, linkedReceiptId: command.body.linkedReceiptId },
      clientObservedAtUtc: command.body.clientObservedAtUtc,
    });
    prepared.state.view.voided = true;
    return this.storeMutation(command, event.streamSequence);
  }

  private productionBlock(): CommandAdmission & { ok: false } | null {
    if (this.admission === "simulated-domain-test") return null;
    if (!isGoodsEvidenceEnabled()) {
      return { ok: false, code: "disabled", detail: "goods evidence is not enabled" };
    }
    return null;
  }

  private identityError(command: FrozenCommand<unknown>): CommandAdmission & { ok: false } | null {
    if (command.ownerUid !== this.ownerUid || command.ledgerId !== this.ledgerId) {
      return { ok: false, code: "digest_conflict", detail: "owner/ledger mismatch" };
    }
    return null;
  }

  private digestError<TBody>(command: FrozenCommand<TBody>): CommandAdmission & { ok: false } | null {
    const frozen = freezeCommand(command);
    if (frozen.digest !== command.digest) {
      return { ok: false, code: "digest_conflict", detail: "command body is not frozen" };
    }
    return null;
  }

  private commandKey(commandId: string): string {
    return `${this.ownerUid}/${this.ledgerId}/${commandId}`;
  }

  private replayRegister(key: string, digest: string): RegisterOutcome | null {
    const existing = this.dedupe.get(key);
    if (!existing) return null;
    if (existing.digest !== digest) {
      return { ok: false, code: "digest_conflict", detail: "same commandId with a different body" };
    }
    if (!("issuedNumber" in existing.result)) {
      return { ok: false, code: "digest_conflict", detail: "commandId is not a register command" };
    }
    return { ...existing.result, replayed: true };
  }

  private prepareMutation(
    command: FrozenCommand<unknown>,
    receiptId: string,
    expectedVersion: number,
    reason: string
  ):
    | { ok: true; replayed: true; eventVersion: number }
    | { ok: true; replayed: false; state: ReceiptState }
    | (CommandAdmission & { ok: false }) {
    const blocked = this.productionBlock();
    if (blocked) return blocked;
    const identity = this.identityError(command);
    if (identity) return identity;
    const digestErr = this.digestError(command);
    if (digestErr) return digestErr;
    const reasonErr = commandReasonError(reason);
    if (reasonErr) return { ok: false, code: "invalid", detail: reasonErr };

    const key = this.commandKey(command.commandId);
    const existing = this.dedupe.get(key);
    if (existing) {
      if (existing.digest !== command.digest) {
        return { ok: false, code: "digest_conflict", detail: "same commandId with a different body" };
      }
      if ("issuedNumber" in existing.result) {
        return { ok: false, code: "digest_conflict", detail: "commandId already used to register" };
      }
      return { ok: true, replayed: true, eventVersion: existing.result.eventVersion };
    }

    const state = this.grins.get(receiptId);
    if (!state) return { ok: false, code: "invalid", detail: "unknown receipt" };
    if (state.view.voided) return { ok: false, code: "voided", detail: "receipt is void" };
    if (state.view.eventVersion !== expectedVersion) {
      return {
        ok: false,
        code: "version_conflict",
        detail: `intervening amendment at version ${state.view.eventVersion}`,
      };
    }
    return { ok: true, replayed: false, state };
  }

  private storeMutation(command: FrozenCommand<unknown>, eventVersion: number): MutationOutcome {
    const result = { ok: true as const, replayed: false, eventVersion };
    this.dedupe.set(this.commandKey(command.commandId), {
      digest: command.digest,
      result,
    });
    return result;
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
      typedChanges: cloneSnapshot(input.typedChanges),
      previousHash,
      eventHash,
      firestoreCommitTime: null,
    };
  }
}
