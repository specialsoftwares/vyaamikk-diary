/**
 * G1 durable register/reconcile adapter (emulator).
 *
 * Not a live callable. Do not import this adapter into the production Functions entrypoint.
 * Does not import client runtime, React, @/config, localDb, or @/utils/sha256Hex.
 */

import { GOODS_EVIDENCE_SCHEMA_VERSION } from "../../src/goodsEvidence/constants";
import type { RegisterGoodsReceiptBody } from "../../src/goodsEvidence/command";
import { derivePhysicalCustody } from "../../src/goodsEvidence/custody";
import { formatGrinNumber } from "../../src/goodsEvidence/grinNumber";
import {
  emptyLedgers,
  type LineQuantityLedgers,
} from "../../src/goodsEvidence/quantities";
import { cloneSnapshot } from "../../src/goodsEvidence/snapshot";
import { financialYearTokenForIstInstant, formatUtcIso } from "../../src/goodsEvidence/time";
import type { GrinEvent, GrinView, ImmutableGrin } from "../../src/goodsEvidence/types";
import {
  commandEnvelopeError,
  effectiveRecordError,
  registerBodyError,
} from "../../src/goodsEvidence/validate";
import { freezeDigest, hashEventEnvelope, hashOriginalSnapshot } from "./hash";
import { commandIdError, documentIdError } from "./ids";
import {
  envelopeByteError,
  extraEnvelopeKeyError,
  lineCountError,
  serverFieldError,
  sparseArrayError,
  textLimitError,
} from "./limits";
import { logG1 } from "./log";
import {
  admissionPath,
  commandPath,
  eventPath,
  ledgerPath,
  receiptPath,
  serialPath,
  userPath,
} from "./paths";
import type {
  AdmissionPolicy,
  G1Clock,
  G1Firestore,
  G1Hooks,
  G1RegisterResult,
  G1RegisterSuccess,
  G1Transaction,
  TrustedCaller,
} from "./types";

const GENERIC_DENY = "denied";
const MAX_TX_ATTEMPTS = 5;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function deny(
  code: Extract<G1RegisterResult, { ok: false }>["code"],
  detail: string
): Extract<G1RegisterResult, { ok: false }> {
  logG1("grin_g1_denied", { code });
  return { ok: false, code, detail };
}

function parsePolicy(data: Record<string, unknown> | undefined): AdmissionPolicy | null {
  if (!data) return null;
  if (data.schemaVersion !== 1) return null;
  if (data.newCommands !== "allow" && data.newCommands !== "deny") return null;
  if (data.reconciliation !== "allow" && data.reconciliation !== "deny") return null;
  return {
    schemaVersion: 1,
    newCommands: data.newCommands,
    reconciliation: data.reconciliation,
  };
}

function storedSuccess(data: Record<string, unknown> | undefined): G1RegisterSuccess | null {
  const result = data?.result;
  if (!isPlainObject(result)) return null;
  if (result.ok !== true) return null;
  if (typeof result.receiptId !== "string") return null;
  if (typeof result.issuedNumber !== "string") return null;
  if (typeof result.serial !== "number") return null;
  if (typeof result.serverRegisteredAtUtc !== "string") return null;
  if (typeof result.eventVersion !== "number") return null;
  if (typeof result.headHash !== "string") return null;
  return {
    ok: true,
    replayed: true,
    receiptId: result.receiptId,
    issuedNumber: result.issuedNumber,
    serial: result.serial,
    serverRegisteredAtUtc: result.serverRegisteredAtUtc,
    eventVersion: result.eventVersion,
    headHash: result.headHash,
  };
}

export function isRetryable(err: unknown): boolean {
  const code = isPlainObject(err) ? err.code : undefined;
  if (code === 10 || code === "ABORTED" || code === 16) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /ABORTED|contention|too much contention/i.test(msg);
}

type FrozenRegister = {
  commandId: string;
  type: "registerGoodsReceipt";
  ownerUid: string;
  ledgerId: string;
  body: RegisterGoodsReceiptBody;
  digest: string;
};

type IssuedBuild = {
  original: ImmutableGrin;
  event: GrinEvent;
  view: GrinView;
  lineLedgers: Record<string, LineQuantityLedgers>;
  result: G1RegisterSuccess;
};

export class GoodsEvidenceRegisterAdapter {
  constructor(
    private readonly db: G1Firestore,
    private readonly clock: G1Clock,
    private readonly hooks: G1Hooks = {}
  ) {}

  async register(caller: TrustedCaller, envelope: unknown): Promise<G1RegisterResult> {
    if (!caller.uid) return deny("unauthenticated", GENERIC_DENY);
    const pre = this.prevalidate(envelope);
    if (pre) return pre;
    const parsed = envelope as {
      commandId: string;
      type: string;
      ledgerId: string;
      body: unknown;
      digest?: string;
    };
    const uid = caller.uid;
    const bodyClone = cloneSnapshot(parsed.body);
    const digest = freezeDigest({
      commandId: parsed.commandId,
      type: "registerGoodsReceipt",
      ownerUid: uid,
      ledgerId: parsed.ledgerId,
      body: bodyClone,
    });
    if (typeof parsed.digest === "string" && parsed.digest !== digest) {
      return deny("digest_conflict", "same commandId with a different body");
    }
    const frozen: FrozenRegister = {
      commandId: parsed.commandId,
      type: "registerGoodsReceipt",
      ownerUid: uid,
      ledgerId: parsed.ledgerId,
      body: bodyClone as RegisterGoodsReceiptBody,
      digest,
    };
    const envelopeErr = commandEnvelopeError(frozen, "registerGoodsReceipt");
    if (envelopeErr) return deny("invalid", envelopeErr);
    const bodyErr = registerBodyError(frozen.body);
    if (bodyErr) return deny("invalid", bodyErr);

    return this.runAttempts(async (tx, attempt) => {
      const serverMs = this.clock.nowMs();
      const fyToken = financialYearTokenForIstInstant(serverMs);
      const userSnap = await tx.get(this.db.doc(userPath(uid)));
      const ledgerSnap = await tx.get(this.db.doc(ledgerPath(uid, frozen.ledgerId)));
      const admissionSnap = await tx.get(this.db.doc(admissionPath(uid)));
      const commandRef = this.db.doc(commandPath(uid, frozen.ledgerId, frozen.commandId));
      const commandSnap = await tx.get(commandRef);
      const receiptRef = this.db.doc(receiptPath(uid, frozen.ledgerId, frozen.body.receiptId));
      const receiptSnap = await tx.get(receiptRef);
      const serialRef = this.db.doc(serialPath(uid, frozen.ledgerId, fyToken));
      const serialSnap = await tx.get(serialRef);
      await this.hooks.afterReads?.(attempt);

      const gate = this.gate(admissionSnap.data(), userSnap.exists, userSnap.data(), ledgerSnap.exists, ledgerSnap.data(), uid);
      if (!gate.ok) return gate;
      if (gate.policy.newCommands !== "allow") return deny("policy_denied", GENERIC_DENY);

      if (commandSnap.exists) {
        const stored = commandSnap.data();
        if (stored?.digest !== frozen.digest) {
          return deny("digest_conflict", "same commandId with a different body");
        }
        const result = storedSuccess(stored);
        if (!result) return deny("digest_conflict", "commandId is not a register command");
        logG1("grin_g1_replayed", { replayed: true, attempt });
        return result;
      }

      if (receiptSnap.exists) {
        return deny("receipt_exists", "receipt already issued; history cannot be replaced");
      }

      const serial =
        typeof serialSnap.data()?.nextSerial === "number" ? (serialSnap.data()!.nextSerial as number) : 1;
      const issued = this.buildIssued(frozen, uid, serverMs, fyToken, serial);
      if (!("result" in issued)) return issued;

      tx.set(serialRef, {
        fyToken,
        nextSerial: serial + 1,
        lastIssuedSerial: serial,
      });
      tx.set(receiptRef, {
        original: issued.original,
        view: issued.view,
        lineLedgers: issued.lineLedgers,
      });
      tx.set(
        this.db.doc(eventPath(uid, frozen.ledgerId, issued.original.receiptId, issued.event.eventId)),
        { ...issued.event }
      );
      tx.set(commandRef, {
        schemaVersion: GOODS_EVIDENCE_SCHEMA_VERSION,
        ownerUid: uid,
        ledgerId: frozen.ledgerId,
        commandId: frozen.commandId,
        type: "registerGoodsReceipt",
        digest: frozen.digest,
        receiptId: issued.original.receiptId,
        result: { ...issued.result, replayed: false },
      });
      logG1("grin_g1_committed", { attempt, replayed: false });
      return issued.result;
    });
  }

  async reconcile(
    caller: TrustedCaller,
    input: { ledgerId: unknown; commandId: unknown }
  ): Promise<G1RegisterResult> {
    if (!caller.uid) return deny("unauthenticated", GENERIC_DENY);
    const ledgerErr = documentIdError("ledgerId", input.ledgerId);
    if (ledgerErr) return deny("invalid", ledgerErr);
    const cmdErr = commandIdError(input.commandId);
    if (cmdErr) return deny("invalid", cmdErr);
    const uid = caller.uid;
    const ledgerId = input.ledgerId as string;
    const commandId = input.commandId as string;

    return this.runAttempts(async (tx, attempt) => {
      const userSnap = await tx.get(this.db.doc(userPath(uid)));
      const ledgerSnap = await tx.get(this.db.doc(ledgerPath(uid, ledgerId)));
      const admissionSnap = await tx.get(this.db.doc(admissionPath(uid)));
      const commandSnap = await tx.get(this.db.doc(commandPath(uid, ledgerId, commandId)));
      await this.hooks.afterReads?.(attempt);

      const gate = this.gate(admissionSnap.data(), userSnap.exists, userSnap.data(), ledgerSnap.exists, ledgerSnap.data(), uid);
      if (!gate.ok) return gate;
      if (gate.policy.reconciliation !== "allow") return deny("policy_denied", GENERIC_DENY);
      if (!commandSnap.exists) return deny("not_found", "command not found");
      const result = storedSuccess(commandSnap.data());
      if (!result) return deny("not_found", "command not found");
      logG1("grin_g1_replayed", { replayed: true, attempt });
      return result;
    });
  }

  private gate(
    admission: Record<string, unknown> | undefined,
    userExists: boolean,
    user: Record<string, unknown> | undefined,
    ledgerExists: boolean,
    ledger: Record<string, unknown> | undefined,
    uid: string
  ): { ok: true; policy: AdmissionPolicy } | Extract<G1RegisterResult, { ok: false }> {
    if (!userExists) return deny("forbidden", GENERIC_DENY);
    if ((user?.status ?? "active") !== "active") return deny("forbidden", GENERIC_DENY);
    if (!ledgerExists) return deny("forbidden", GENERIC_DENY);
    if (ledger?.ownerUid !== uid) return deny("forbidden", GENERIC_DENY);
    if (ledger?.status !== "active") return deny("forbidden", GENERIC_DENY);
    const policy = parsePolicy(admission);
    if (!policy) return deny("policy_denied", GENERIC_DENY);
    return { ok: true, policy };
  }

  private prevalidate(envelope: unknown): Extract<G1RegisterResult, { ok: false }> | null {
    const extra = extraEnvelopeKeyError(envelope);
    if (extra) return deny("invalid", extra);
    const bytes = envelopeByteError(envelope);
    if (bytes) return deny("invalid", bytes);
    if (!isPlainObject(envelope)) return deny("invalid", "command envelope is required");
    const cmdErr = commandIdError(envelope.commandId);
    if (cmdErr) return deny("invalid", cmdErr);
    const ledgerErr = documentIdError("ledgerId", envelope.ledgerId);
    if (ledgerErr) return deny("invalid", ledgerErr);
    if (envelope.type !== "registerGoodsReceipt") {
      return deny("invalid", "command type must be registerGoodsReceipt");
    }
    const receiptErr = documentIdError("receiptId", (envelope.body as { receiptId?: unknown })?.receiptId);
    if (receiptErr) return deny("invalid", receiptErr);
    const sparse = sparseArrayError(envelope.body, "body");
    if (sparse) return deny("invalid", sparse);
    const server = serverFieldError(envelope.body);
    if (server) return deny("invalid", server);
    const lines = lineCountError(envelope.body);
    if (lines) return deny("invalid", lines);
    const text = textLimitError(envelope.body);
    if (text) return deny("invalid", text);
    return null;
  }

  private buildIssued(
    frozen: FrozenRegister,
    uid: string,
    serverMs: number,
    fyToken: string,
    serial: number
  ): IssuedBuild | Extract<G1RegisterResult, { ok: false }> {
    const serverRegisteredAtUtc = formatUtcIso(serverMs);
    let issuedNumber: string;
    try {
      issuedNumber = formatGrinNumber({ series: frozen.body.series, fyToken, serial });
    } catch {
      return deny("invalid", "issued number could not be formed");
    }
    const body = cloneSnapshot(frozen.body);
    const draft: ImmutableGrin = {
      schemaVersion: GOODS_EVIDENCE_SCHEMA_VERSION,
      receiptId: body.receiptId,
      ownerUid: uid,
      ledgerId: frozen.ledgerId,
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
    if (envelopeErr) return deny("invalid", envelopeErr);
    const originalSnapshotHash = hashOriginalSnapshot(draft);
    const original = cloneSnapshot({ ...draft, originalSnapshotHash });
    const eventId = this.clock.uuid();
    const typedChanges = { issuedNumber, serial, fyToken, originalSnapshotHash };
    const eventHash = hashEventEnvelope({
      eventId,
      receiptId: original.receiptId,
      streamSequence: 1,
      type: "receipt_registered",
      actorUid: uid,
      serverAcceptedAtUtc: serverRegisteredAtUtc,
      clientObservedAtUtc: body.clientObservedAtUtc,
      reason: "issued",
      expectedPreviousVersion: 0,
      typedChanges,
      previousHash: null,
    });
    const event: GrinEvent = {
      schemaVersion: GOODS_EVIDENCE_SCHEMA_VERSION,
      eventId,
      receiptId: original.receiptId,
      streamSequence: 1,
      type: "receipt_registered",
      actorUid: uid,
      serverAcceptedAtUtc: serverRegisteredAtUtc,
      clientObservedAtUtc: body.clientObservedAtUtc,
      reason: "issued",
      expectedPreviousVersion: 0,
      typedChanges: cloneSnapshot(typedChanges),
      previousHash: null,
      eventHash,
      firestoreCommitTime: null,
    };
    const lineLedgers: Record<string, LineQuantityLedgers> = {};
    for (const line of original.lines) {
      const ledgers = emptyLedgers(line.unit);
      ledgers.physicalReceived = { ...line.physicallyReceived };
      if (original.custody === "refused_at_gate") {
        ledgers.acceptedForStock = emptyLedgers(line.unit).acceptedForStock;
      }
      lineLedgers[line.lineId] = cloneSnapshot(ledgers);
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
    view.custody = derivePhysicalCustody({
      originalDisposition: original.custody,
      qcStatus: view.qcStatus,
      lineLedgers: Object.values(lineLedgers),
    });
    return {
      original,
      event,
      view,
      lineLedgers,
      result: {
        ok: true,
        replayed: false,
        receiptId: original.receiptId,
        issuedNumber,
        serial,
        serverRegisteredAtUtc,
        eventVersion: 1,
        headHash: event.eventHash,
      },
    };
  }

  private async runAttempts(
    fn: (tx: G1Transaction, attempt: number) => Promise<G1RegisterResult>
  ): Promise<G1RegisterResult> {
    let last: unknown;
    for (let attempt = 1; attempt <= MAX_TX_ATTEMPTS; attempt++) {
      // Capture locally. The Firestore SDK/emulator may drop the callback return value.
      let outcome: G1RegisterResult | undefined;
      try {
        await this.db.runTransaction(
          async (tx) => {
            outcome = await fn(tx, attempt);
          },
          { maxAttempts: 1 }
        );
      } catch (err) {
        last = err;
        if (attempt < MAX_TX_ATTEMPTS && isRetryable(err)) continue;
        throw err;
      }
      if (!outcome) {
        throw new Error("g1_transaction_missing_result");
      }
      return outcome;
    }
    throw last;
  }
}
