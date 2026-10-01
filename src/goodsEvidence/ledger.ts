import { GOODS_EVIDENCE_SCHEMA_VERSION, GOODS_EVIDENCE_SIMULATION_NOTICE } from "./constants";
import { freezeCommand, type FrozenCommand, type RegisterGoodsReceiptBody } from "./command";
import type {
  AmendFieldsBody,
  CorrectReturnDispatchBody,
  DispatchReturnBody,
  GoodsCommandType,
  LinkVerifiedEvidenceBody,
  RecordEwbObservationBody,
  RecordQcBody,
  VoidWithReasonBody,
} from "./command";
import { derivePhysicalCustody } from "./custody";
import {
  appendMovementEvent,
  appendPortalObservation,
  appendQcEvent,
  emptyEwbHistories,
  linkReplacement,
  type EwbHistories,
} from "./ewb";
import { isGoodsEvidenceEnabled } from "./featureFlag";
import { formatGrinNumber } from "./grinNumber";
import { hashEventEnvelope, hashOriginalSnapshot } from "./hashChain";
import {
  applyReturnCorrection,
  applyReturnDispatch,
  compareDecimal,
  emptyLedgers,
  IncompatibleUnitsError,
  QuantityBoundError,
  quantityShapeError,
  subtractQuantity,
  type LineQuantityLedgers,
  type Quantity,
} from "./quantities";
import { cloneSnapshot, freezeSnapshot } from "./snapshot";
import { financialYearTokenForIstInstant, formatUtcIso } from "./time";
import type { CommandAdmission, GrinEvent, GrinView, ImmutableGrin } from "./types";
import {
  amendmentFieldError,
  commandEnvelopeError,
  commandReasonError,
  effectiveRecordError,
  isAmendableGrinField,
  mutationBodyError,
  qcStatusError,
  recordEwbObservationBodyError,
  registerBodyError,
  verifiedEvidenceIdentityError,
  linkVerifiedEvidenceBodyError,
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

function asQuantity(value: unknown): Quantity | null {
  if (!value || typeof value !== "object") return null;
  const qty = value as Quantity;
  if (typeof qty.value !== "string" || typeof qty.unit !== "string") return null;
  return qty;
}

function remainingLinkedDispatch(
  events: GrinEvent[],
  linkedEventId: string,
  dispatched: Quantity
): Quantity {
  let remaining: Quantity = { ...dispatched };
  for (const event of events) {
    if (event.type !== "return_received") continue;
    if (event.typedChanges.linkedEventId !== linkedEventId) continue;
    const correction = asQuantity(event.typedChanges.correctionQty);
    if (!correction) continue;
    remaining = subtractQuantity(remaining, correction);
  }
  return remaining;
}

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
  ewbHistories: EwbHistories;
  linkedEvidenceIds: string[];
}

function cloneReceiptState(state: ReceiptState): ReceiptState {
  return {
    original: cloneSnapshot(state.original),
    effective: cloneSnapshot(state.effective),
    events: cloneSnapshot(state.events),
    view: cloneSnapshot(state.view),
    lineLedgers: cloneSnapshot(state.lineLedgers),
    ewbHistories: cloneSnapshot(state.ewbHistories),
    linkedEvidenceIds: cloneSnapshot(state.linkedEvidenceIds),
  };
}

function syncViewCustody(state: ReceiptState): void {
  state.view.custody = derivePhysicalCustody({
    originalDisposition: state.original.custody,
    qcStatus: state.view.qcStatus,
    lineLedgers: state.lineLedgers.values(),
  });
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

  getEwbHistories(receiptId: string): EwbHistories | undefined {
    const histories = this.grins.get(receiptId)?.ewbHistories;
    return histories ? freezeSnapshot(histories) : undefined;
  }

  register(command: FrozenCommand<RegisterGoodsReceiptBody>): RegisterOutcome {
    const blocked = this.productionBlock();
    if (blocked) return blocked;
    const invalid = this.operationError(command, "registerGoodsReceipt");
    if (invalid) return invalid;
    const identity = this.identityError(command);
    if (identity) return identity;
    const digestErr = this.digestError(command);
    if (digestErr) return digestErr;

    const key = this.commandKey(command.commandId);
    const replay = this.replayRegister(key, command.digest);
    if (replay) return replay;

    const bodyErr = registerBodyError(command.body);
    if (bodyErr) return { ok: false, code: "invalid", detail: bodyErr };

    const existingReceipt = this.grins.get(command.body.receiptId);
    if (existingReceipt) {
      return {
        ok: false,
        code: "receipt_exists",
        detail: "receipt already issued; history cannot be replaced",
      };
    }

    const body = cloneSnapshot(command.body);
    const serverMs = this.clock.nowMs();
    const serverRegisteredAtUtc = formatUtcIso(serverMs);
    const fyToken = financialYearTokenForIstInstant(serverMs);
    const serial = this.peekSerial(fyToken);
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
    const envelopeErr = effectiveRecordError(draft);
    if (envelopeErr) return { ok: false, code: "invalid", detail: envelopeErr };

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
    const state: ReceiptState = {
      original,
      effective: cloneSnapshot(original),
      events: [event],
      view,
      lineLedgers,
      ewbHistories: emptyEwbHistories(),
      linkedEvidenceIds: [],
    };
    syncViewCustody(state);

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
    this.commitRegister(fyToken, serial, original.receiptId, state, key, command.digest, result);
    return result;
  }

  amend(command: FrozenCommand<AmendFieldsBody>): MutationOutcome {
    const prepared = this.prepareMutation(
      command,
      "amendFields",
      command.body?.receiptId,
      command.body?.expectedVersion,
      command.body?.reason
    );
    if (!prepared.ok) return prepared;
    if (prepared.replayed) return prepared;

    const keys = Object.keys(command.body.changes ?? {});
    if (keys.length === 0) {
      return { ok: false, code: "invalid", detail: "amendment changes are required" };
    }
    const oldValues: Record<string, unknown> = {};
    const next = cloneReceiptState(prepared.state);
    for (const key of keys) {
      if (!isAmendableGrinField(key)) {
        return { ok: false, code: "invalid", detail: `field ${key} is not amendable` };
      }
      const fieldErr = amendmentFieldError(key, command.body.changes[key]);
      if (fieldErr) return { ok: false, code: "invalid", detail: fieldErr };
      oldValues[key] = cloneSnapshot((next.effective as unknown as Record<string, unknown>)[key] ?? null);
      (next.effective as unknown as Record<string, unknown>)[key] = cloneSnapshot(command.body.changes[key]);
    }
    const envelopeErr = effectiveRecordError(next.effective);
    if (envelopeErr) return { ok: false, code: "invalid", detail: envelopeErr };
    void command.body.claimedOldValues;
    const event = this.buildNextEvent(next, {
      type: "field_amended",
      reason: command.body.reason.trim(),
      expectedPreviousVersion: command.body.expectedVersion,
      typedChanges: { oldValues, newValues: cloneSnapshot(command.body.changes) },
      clientObservedAtUtc: command.body.clientObservedAtUtc,
    });
    this.finishEvent(next, event);
    return this.commitMutation(command.body.receiptId, next, command, event.streamSequence);
  }

  recordQc(command: FrozenCommand<RecordQcBody>): MutationOutcome {
    const prepared = this.prepareMutation(
      command,
      "recordQc",
      command.body?.receiptId,
      command.body?.expectedVersion,
      command.body?.reason
    );
    if (!prepared.ok) return prepared;
    if (prepared.replayed) return prepared;
    const qcErr = qcStatusError(command.body.qcStatus);
    if (qcErr) return { ok: false, code: "invalid", detail: qcErr };
    const next = cloneReceiptState(prepared.state);
    const previousQc = next.view.qcStatus;
    const event = this.buildNextEvent(next, {
      type: previousQc == null ? "qc_decision" : "qc_reclassified",
      reason: command.body.reason.trim(),
      expectedPreviousVersion: command.body.expectedVersion,
      typedChanges: { oldQc: previousQc, newQc: command.body.qcStatus },
      clientObservedAtUtc: command.body.clientObservedAtUtc,
    });
    next.view.qcStatus = command.body.qcStatus;
    this.finishEvent(next, event);
    return this.commitMutation(command.body.receiptId, next, command, event.streamSequence);
  }

  dispatchReturn(command: FrozenCommand<DispatchReturnBody>): MutationOutcome {
    const prepared = this.prepareMutation(
      command,
      "dispatchReturn",
      command.body?.receiptId,
      command.body?.expectedVersion,
      command.body?.reason
    );
    if (!prepared.ok) return prepared;
    if (prepared.replayed) return prepared;
    const next = cloneReceiptState(prepared.state);
    const ledger = next.lineLedgers.get(command.body.lineId);
    if (!ledger) {
      return { ok: false, code: "invalid", detail: "unknown line" };
    }
    const qtyErr = quantityShapeError(command.body.returnQty, {
      label: "returnQty",
      requiredUnit: ledger.physicalReceived.unit,
    });
    if (qtyErr) return { ok: false, code: "invalid", detail: qtyErr };
    try {
      const physicalBefore = ledger.physicalReceived.value;
      const updated = applyReturnDispatch(ledger, command.body.returnQty);
      next.lineLedgers.set(command.body.lineId, updated);
      const event = this.buildNextEvent(next, {
        type: "return_dispatched",
        reason: command.body.reason.trim(),
        expectedPreviousVersion: command.body.expectedVersion,
        typedChanges: {
          lineId: command.body.lineId,
          unit: command.body.returnQty.unit,
          returnQty: cloneSnapshot(command.body.returnQty),
          physicalReceivedUnchanged: updated.physicalReceived.value === physicalBefore,
        },
        clientObservedAtUtc: command.body.clientObservedAtUtc,
      });
      this.finishEvent(next, event);
      return this.commitMutation(command.body.receiptId, next, command, event.streamSequence);
    } catch (err) {
      if (err instanceof QuantityBoundError || err instanceof IncompatibleUnitsError) {
        return { ok: false, code: "invalid", detail: err.message };
      }
      throw err;
    }
  }

  correctReturnDispatch(command: FrozenCommand<CorrectReturnDispatchBody>): MutationOutcome {
    const prepared = this.prepareMutation(
      command,
      "correctReturnDispatch",
      command.body?.receiptId,
      command.body?.expectedVersion,
      command.body?.reason
    );
    if (!prepared.ok) return prepared;
    if (prepared.replayed) return prepared;
    if (!command.body.linkedEventId?.trim()) {
      return { ok: false, code: "invalid", detail: "linkedEventId is required for a return correction" };
    }
    const next = cloneReceiptState(prepared.state);
    const linked = next.events.find(
      (event) => event.eventId === command.body.linkedEventId && event.type === "return_dispatched"
    );
    if (!linked) {
      return { ok: false, code: "invalid", detail: "linked return_dispatched event not found" };
    }
    const linkedQty = asQuantity(linked.typedChanges.returnQty);
    const linkedLineId = linked.typedChanges.lineId;
    const linkedUnit =
      typeof linked.typedChanges.unit === "string" ? linked.typedChanges.unit : linkedQty?.unit;
    if (typeof linkedLineId !== "string" || !linkedQty || !linkedUnit) {
      return { ok: false, code: "invalid", detail: "linked dispatch is missing line quantity" };
    }
    if (command.body.lineId !== linkedLineId) {
      return { ok: false, code: "invalid", detail: "correction line must match the linked dispatch" };
    }
    if (command.body.correctionQty.unit !== linkedUnit) {
      return { ok: false, code: "invalid", detail: "correction unit must match the linked dispatch" };
    }
    const remaining = remainingLinkedDispatch(next.events, linked.eventId, linkedQty);
    if (compareDecimal(command.body.correctionQty.value, remaining.value) > 0) {
      return { ok: false, code: "invalid", detail: "correction exceeds remaining linked dispatch quantity" };
    }
    const ledger = next.lineLedgers.get(linkedLineId);
    if (!ledger) {
      return { ok: false, code: "invalid", detail: "unknown line" };
    }
    const qtyErr = quantityShapeError(command.body.correctionQty, {
      label: "correctionQty",
      requiredUnit: linkedUnit,
    });
    if (qtyErr) return { ok: false, code: "invalid", detail: qtyErr };
    try {
      const updated = applyReturnCorrection(ledger, command.body.correctionQty);
      next.lineLedgers.set(linkedLineId, updated);
      const event = this.buildNextEvent(next, {
        type: "return_received",
        reason: command.body.reason.trim(),
        expectedPreviousVersion: command.body.expectedVersion,
        typedChanges: {
          lineId: command.body.lineId,
          linkedEventId: command.body.linkedEventId,
          correctionQty: cloneSnapshot(command.body.correctionQty),
          physicalReceivedUnchanged: true,
        },
        clientObservedAtUtc: command.body.clientObservedAtUtc,
      });
      this.finishEvent(next, event);
      return this.commitMutation(command.body.receiptId, next, command, event.streamSequence);
    } catch (err) {
      if (err instanceof QuantityBoundError || err instanceof IncompatibleUnitsError) {
        return { ok: false, code: "invalid", detail: err.message };
      }
      throw err;
    }
  }

  voidWithReason(command: FrozenCommand<VoidWithReasonBody>): MutationOutcome {
    const prepared = this.prepareMutation(
      command,
      "voidWithReason",
      command.body?.receiptId,
      command.body?.expectedVersion,
      command.body?.reason
    );
    if (!prepared.ok) return prepared;
    if (prepared.replayed) return prepared;
    const next = cloneReceiptState(prepared.state);
    const issuedNumber = next.original.issuedNumber;
    const event = this.buildNextEvent(next, {
      type: "void_with_reason",
      reason: command.body.reason.trim(),
      expectedPreviousVersion: command.body.expectedVersion,
      typedChanges: { issuedNumberPreserved: issuedNumber, linkedReceiptId: command.body.linkedReceiptId },
      clientObservedAtUtc: command.body.clientObservedAtUtc,
    });
    next.view.voided = true;
    this.finishEvent(next, event);
    return this.commitMutation(command.body.receiptId, next, command, event.streamSequence);
  }

  recordEwbObservation(command: FrozenCommand<RecordEwbObservationBody>): MutationOutcome {
    const prepared = this.prepareMutation(
      command,
      "recordEwbObservation",
      command.body?.receiptId,
      command.body?.expectedVersion,
      command.body?.reason
    );
    if (!prepared.ok) return prepared;
    if (prepared.replayed) return prepared;
    const bodyErr = recordEwbObservationBodyError(command.body);
    if (bodyErr) return { ok: false, code: "invalid", detail: bodyErr };
    const next = cloneReceiptState(prepared.state);
    try {
      if (command.body.channel === "portal") {
        const appended = appendPortalObservation(next.ewbHistories, command.body.observation);
        if (!appended.ok) return { ok: false, code: "invalid", detail: appended.detail };
        next.ewbHistories = appended.histories;
      } else if (command.body.channel === "movement") {
        next.ewbHistories = appendMovementEvent(next.ewbHistories, command.body.observation);
      } else if (command.body.channel === "qc") {
        next.ewbHistories = appendQcEvent(next.ewbHistories, command.body.observation);
      } else {
        next.ewbHistories = linkReplacement(next.ewbHistories, command.body.observation);
      }
    } catch (err) {
      if (err instanceof Error) return { ok: false, code: "invalid", detail: err.message };
      throw err;
    }
    const event = this.buildNextEvent(next, {
      type: "ewb_observation_recorded",
      reason: command.body.reason.trim(),
      expectedPreviousVersion: command.body.expectedVersion,
      typedChanges: { channel: command.body.channel, observation: cloneSnapshot(command.body.observation) },
      clientObservedAtUtc: command.body.clientObservedAtUtc,
    });
    this.finishEvent(next, event);
    return this.commitMutation(command.body.receiptId, next, command, event.streamSequence);
  }

  linkVerifiedEvidence(command: FrozenCommand<LinkVerifiedEvidenceBody>): MutationOutcome {
    const prepared = this.prepareMutation(
      command,
      "linkVerifiedEvidence",
      command.body?.receiptId,
      command.body?.expectedVersion,
      command.body?.reason
    );
    if (!prepared.ok) return prepared;
    if (prepared.replayed) return prepared;
    const bodyErr = linkVerifiedEvidenceBodyError(command.body);
    if (bodyErr) return { ok: false, code: "invalid", detail: bodyErr };
    const identity = verifiedEvidenceIdentityError(command.body.verified, {
      ownerUid: this.ownerUid,
      ledgerId: this.ledgerId,
      receiptId: command.body.receiptId,
    });
    if (identity) return { ok: false, code: "invalid", detail: identity };
    if (prepared.state.linkedEvidenceIds.includes(command.body.verified.evidenceId)) {
      return { ok: false, code: "invalid", detail: "evidence already linked" };
    }
    const next = cloneReceiptState(prepared.state);
    next.linkedEvidenceIds.push(command.body.verified.evidenceId);
    const event = this.buildNextEvent(next, {
      type: "evidence_verified",
      reason: command.body.reason.trim(),
      expectedPreviousVersion: command.body.expectedVersion,
      typedChanges: {
        evidenceId: command.body.verified.evidenceId,
        generation: command.body.verified.generation,
        rawSha256: command.body.verified.rawSha256,
        storagePath: command.body.verified.storagePath,
        byteSize: command.body.verified.byteSize,
        linkOnly: true,
        bytesNotRehashed: true,
      },
      clientObservedAtUtc: command.body.clientObservedAtUtc,
    });
    this.finishEvent(next, event);
    return this.commitMutation(command.body.receiptId, next, command, event.streamSequence);
  }

  private productionBlock(): CommandAdmission & { ok: false } | null {
    if (this.admission === "simulated-domain-test") return null;
    if (!isGoodsEvidenceEnabled()) {
      return { ok: false, code: "disabled", detail: "goods evidence is not enabled" };
    }
    return null;
  }

  private operationError(
    command: FrozenCommand<unknown>,
    expectedType: GoodsCommandType
  ): CommandAdmission & { ok: false } | null {
    const envelope = commandEnvelopeError(command, expectedType);
    if (envelope) return { ok: false, code: "invalid", detail: envelope };
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
    expectedType: GoodsCommandType,
    receiptId: string | undefined,
    expectedVersion: number | undefined,
    reason: string | undefined
  ):
    | { ok: true; replayed: true; eventVersion: number }
    | { ok: true; replayed: false; state: ReceiptState }
    | (CommandAdmission & { ok: false }) {
    const blocked = this.productionBlock();
    if (blocked) return blocked;
    const invalid = this.operationError(command, expectedType);
    if (invalid) return invalid;
    const identity = this.identityError(command);
    if (identity) return identity;
    const digestErr = this.digestError(command);
    if (digestErr) return digestErr;
    const bodyErr = mutationBodyError(command.body);
    if (bodyErr) return { ok: false, code: "invalid", detail: bodyErr };
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

    const state = this.grins.get(receiptId ?? "");
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

  private peekSerial(fyToken: string): number {
    return this.nextSerialByFy.get(fyToken) ?? 1;
  }

  private commitRegister(
    fyToken: string,
    serial: number,
    receiptId: string,
    state: ReceiptState,
    key: string,
    digest: string,
    result: RegisterSuccess
  ): void {
    this.grins.set(receiptId, state);
    this.nextSerialByFy.set(fyToken, serial + 1);
    this.dedupe.set(key, { digest, result: { ...result } });
  }

  private commitMutation(
    receiptId: string,
    next: ReceiptState,
    command: FrozenCommand<unknown>,
    eventVersion: number
  ): MutationOutcome {
    this.grins.set(receiptId, next);
    return this.storeMutation(command, eventVersion);
  }

  private buildNextEvent(
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
    return this.buildEvent({
      receiptId: state.original.receiptId,
      streamSequence: state.events.length + 1,
      previous,
      serverAcceptedAtUtc: formatUtcIso(this.clock.nowMs()),
      ...input,
    });
  }

  private finishEvent(state: ReceiptState, event: GrinEvent): void {
    state.events.push(event);
    state.view.eventVersion = event.streamSequence;
    state.view.headHash = event.eventHash;
    syncViewCustody(state);
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
