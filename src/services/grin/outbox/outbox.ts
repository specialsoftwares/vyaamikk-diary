import type { GrinCommandType, GrinRegisterResult, OutboxLocalState } from "@/goodsEvidence/ports";
import { migrateToV10 } from "@/localDb/migrateGrin";
import { classifyRegisterResult, isNetworkAmbiguous, nextRetryState } from "./classify";
import { freezeAdmittedCommand } from "./freeze";
import type { GrinSqlDb } from "./hostSqlite";
import {
  assertCommandId,
  assertLedgerId,
  assertOwnerUid,
  assertReceiptId,
  commandRowId,
  evidenceRowId,
  mintCommandId,
  mintReceiptId,
  receiptRowId,
} from "./ids";
import type { GrinEvidenceUploadPort, GrinRegisterEnvelope, GrinServerCommandPort } from "./ports";
import { assertTransition, isUnsynchronisedState } from "./transitions";
import type {
  ActionableFailure,
  GrinDispatchSession,
  GrinLocalEvidenceFile,
  GrinLocalReceiptView,
  GrinQueuedCommand,
  LocalEvidenceRole,
  OutboxCrashPhase,
} from "./types";
import {
  DEFAULT_LEASE_TTL_MS,
  DURABLE_ORIGINAL_UPLOAD_CONDITION,
  MAX_DISPATCH_ATTEMPTS,
} from "./types";

export { DURABLE_ORIGINAL_UPLOAD_CONDITION };

const STATES: readonly OutboxLocalState[] = [
  "draft",
  "queued",
  "dispatching",
  "issued",
  "attachment_pending",
  "conflicted",
  "failed_retryable",
  "failed_permanent",
];

type Clock = { nowMs: () => number };

type ReceiptRow = {
  id: string;
  owner_uid: string;
  ledger_id: string;
  receipt_id: string;
  command_id: string;
  digest: string | null;
  local_state: string;
  issued_number: string | null;
  server_registered_at_utc: string | null;
  dispatch_generation: number;
  payload_json: string;
  created_at: number;
  updated_at: number;
};

type CommandRow = {
  id: string;
  owner_uid: string;
  ledger_id: string;
  command_id: string;
  receipt_id: string;
  command_type: string;
  digest: string;
  frozen_payload_json: string;
  local_state: string;
  attempt_count: number;
  max_attempts: number;
  last_error_code: string | null;
  last_error_actionable: string | null;
  lease_worker_id: string | null;
  lease_generation: number | null;
  lease_until_ms: number | null;
  dispatch_generation: number;
  created_at: number;
  updated_at: number;
};

type EvidenceRow = {
  id: string;
  owner_uid: string;
  ledger_id: string;
  receipt_id: string;
  evidence_id: string;
  role: string;
  local_path: string;
  claimed_sha256: string | null;
  byte_size: number | null;
  upload_state: string;
  original_durable: number;
  retain_local: number;
};

type RuntimeRow = {
  owner_uid: string;
  dispatch_generation: number;
  session_active: number;
  retirement_hold: number;
  retirement_at: number | null;
};

export type PersistDraftInput = {
  ledgerId: string;
  body: unknown;
  receiptId?: string;
  commandId?: string;
};

export type QueueInput = PersistDraftInput & {
  commandType?: GrinCommandType;
};

export type SaveDraftResult =
  | { ok: true; record: GrinLocalReceiptView }
  | { ok: false; code: "digest_conflict"; record: GrinLocalReceiptView };

export type PurgeResult =
  | { ok: true }
  | {
      ok: false;
      code: "unsync_evidence_retained" | "deletion_policy_unresolved";
      unsynchronisedCount: number;
    };

export type DispatchItemResult = {
  commandId: string;
  localState: OutboxLocalState;
  issuedNumber: string | null;
  replayed: boolean;
  skipped?: "session_retired" | "lease_held" | "owner_mismatch" | "unsupported_type";
};

export type DispatchReport = {
  processed: number;
  results: DispatchItemResult[];
};

let crashHook: ((phase: OutboxCrashPhase) => void) | null = null;

export function setOutboxCrashHook(hook: ((phase: OutboxCrashPhase) => void) | null): void {
  crashHook = hook;
}

function parseState(raw: string): OutboxLocalState {
  if ((STATES as readonly string[]).includes(raw)) return raw as OutboxLocalState;
  throw new Error("corrupt_outbox_state");
}

function parseJson(raw: string): unknown {
  return JSON.parse(raw) as unknown;
}

export type GrinOutboxDeps = {
  db: GrinSqlDb;
  server: GrinServerCommandPort;
  evidence?: GrinEvidenceUploadPort;
  clock?: Clock;
  leaseTtlMs?: number;
  maxAttempts?: number;
};

export class GrinOutbox {
  private readonly db: GrinSqlDb;
  private readonly server: GrinServerCommandPort;
  private readonly evidence: GrinEvidenceUploadPort | null;
  private readonly clock: Clock;
  private readonly leaseTtlMs: number;
  private readonly maxAttempts: number;

  constructor(deps: GrinOutboxDeps) {
    this.db = deps.db;
    this.server = deps.server;
    this.evidence = deps.evidence ?? null;
    this.clock = deps.clock ?? { nowMs: () => Date.now() };
    this.leaseTtlMs = deps.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS;
    this.maxAttempts = deps.maxAttempts ?? MAX_DISPATCH_ATTEMPTS;
  }

  ensureSchema(): void {
    migrateToV10(this.db as unknown as Parameters<typeof migrateToV10>[0]);
  }

  beginOwnerSession(ownerUid: string): GrinDispatchSession {
    assertOwnerUid(ownerUid);
    const now = this.clock.nowMs();
    let generation = 0;
    this.db.withTransactionSync(() => {
      const row = this.readRuntime(ownerUid);
      generation = (row?.dispatch_generation ?? 0) + 1;
      this.upsertRuntime({
        owner_uid: ownerUid,
        dispatch_generation: generation,
        session_active: 1,
        retirement_hold: row?.retirement_hold ?? 0,
        retirement_at: row?.retirement_at ?? null,
        updated_at: now,
      });
    });
    return { ownerUid, dispatchGeneration: generation };
  }

  endOwnerSession(ownerUid: string): void {
    assertOwnerUid(ownerUid);
    const now = this.clock.nowMs();
    this.db.withTransactionSync(() => {
      const row = this.readRuntime(ownerUid);
      const generation = (row?.dispatch_generation ?? 0) + 1;
      this.upsertRuntime({
        owner_uid: ownerUid,
        dispatch_generation: generation,
        session_active: 0,
        retirement_hold: row?.retirement_hold ?? 0,
        retirement_at: row?.retirement_at ?? null,
        updated_at: now,
      });
    });
  }

  isSessionCurrent(session: GrinDispatchSession): boolean {
    const row = this.readRuntime(session.ownerUid);
    if (!row) return false;
    return Number(row.session_active) === 1 && Number(row.dispatch_generation) === session.dispatchGeneration;
  }

  persistDraft(session: GrinDispatchSession, input: PersistDraftInput): GrinLocalReceiptView {
    this.assertSessionOwner(session, session.ownerUid);
    const ids = this.resolveIds(session, input, false);
    const now = this.clock.nowMs();
    this.db.withTransactionSync(() => {
      const existing = this.readReceipt(session.ownerUid, input.ledgerId, ids.receiptId);
      if (existing && parseState(existing.local_state) !== "draft") {
        throw new Error("draft_not_editable");
      }
      if (existing) {
        this.db.runSync(
          `UPDATE grin_local_receipts SET payload_json = ?, updated_at = ? WHERE id = ? AND owner_uid = ? AND local_state = ?`,
          [JSON.stringify(input.body), now, existing.id, session.ownerUid, "draft"]
        );
        return;
      }
      this.insertReceipt({
        ownerUid: session.ownerUid,
        ledgerId: ids.ledgerId,
        receiptId: ids.receiptId,
        commandId: ids.commandId,
        digest: null,
        localState: "draft",
        dispatchGeneration: session.dispatchGeneration,
        payload: input.body,
        now,
      });
    });
    return this.getRecord(session.ownerUid, ids.ledgerId, ids.receiptId)!;
  }

  persistDraftAndQueue(session: GrinDispatchSession, input: QueueInput): GrinLocalReceiptView {
    this.assertSessionOwner(session, session.ownerUid);
    const ids = this.resolveIds(session, input, true);
    const commandType: GrinCommandType = input.commandType ?? "registerGoodsReceipt";
    const frozen = freezeAdmittedCommand({
      commandId: ids.commandId,
      type: commandType,
      ownerUid: session.ownerUid,
      ledgerId: ids.ledgerId,
      body: this.bodyWithReceiptId(input.body, ids.receiptId),
    });
    const now = this.clock.nowMs();
    this.db.withTransactionSync(() => {
      const existingReceipt = this.readReceipt(session.ownerUid, ids.ledgerId, ids.receiptId);
      const existingCommand = this.readCommand(session.ownerUid, ids.ledgerId, ids.commandId);
      if (existingCommand) {
        if (existingCommand.digest !== frozen.digest) {
          this.markConflicted(existingReceipt, existingCommand, now);
          return;
        }
        return;
      }
      if (existingReceipt && parseState(existingReceipt.local_state) !== "draft") {
        if (existingReceipt.digest && existingReceipt.digest !== frozen.digest) {
          this.markConflicted(existingReceipt, existingCommand, now);
          return;
        }
      }
      if (existingReceipt) {
        assertTransition(parseState(existingReceipt.local_state), "queued");
        this.db.runSync(
          `UPDATE grin_local_receipts
              SET command_id = ?, digest = ?, local_state = ?, payload_json = ?, dispatch_generation = ?, updated_at = ?
            WHERE id = ? AND owner_uid = ?`,
          [
            frozen.commandId,
            frozen.digest,
            "queued",
            JSON.stringify(frozen.body),
            session.dispatchGeneration,
            now,
            existingReceipt.id,
            session.ownerUid,
          ]
        );
      } else {
        this.insertReceipt({
          ownerUid: session.ownerUid,
          ledgerId: ids.ledgerId,
          receiptId: ids.receiptId,
          commandId: frozen.commandId,
          digest: frozen.digest,
          localState: "queued",
          dispatchGeneration: session.dispatchGeneration,
          payload: frozen.body,
          now,
        });
      }
      crashHook?.("after_receipt");
      this.insertCommand({
        ownerUid: session.ownerUid,
        ledgerId: ids.ledgerId,
        commandId: frozen.commandId,
        receiptId: ids.receiptId,
        commandType,
        digest: frozen.digest,
        frozenPayload: frozen.body,
        localState: "queued",
        dispatchGeneration: session.dispatchGeneration,
        now,
      });
      crashHook?.("after_command");
    });
    return this.getRecord(session.ownerUid, ids.ledgerId, ids.receiptId)!;
  }

  saveDraft(
    session: GrinDispatchSession,
    input: PersistDraftInput & { receiptId: string }
  ): SaveDraftResult {
    const current = this.getRecord(session.ownerUid, input.ledgerId, input.receiptId);
    if (!current) throw new Error("not_found");
    if (current.localState === "draft") {
      return { ok: true, record: this.persistDraft(session, input) };
    }
    const frozen = freezeAdmittedCommand({
      commandId: current.commandId,
      type: current.commandType ?? "registerGoodsReceipt",
      ownerUid: session.ownerUid,
      ledgerId: input.ledgerId,
      body: this.bodyWithReceiptId(input.body, input.receiptId),
    });
    if (current.digest && frozen.digest !== current.digest) {
      return { ok: false, code: "digest_conflict", record: current };
    }
    return { ok: true, record: current };
  }

  getRecord(ownerUid: string, ledgerId: string, receiptId: string): GrinLocalReceiptView | null {
    assertOwnerUid(ownerUid);
    const receipt = this.readReceipt(ownerUid, ledgerId, receiptId);
    if (!receipt) return null;
    const command = this.readCommand(ownerUid, ledgerId, receipt.command_id);
    return this.toView(receipt, command);
  }

  listForOwner(ownerUid: string): GrinLocalReceiptView[] {
    assertOwnerUid(ownerUid);
    const rows = this.db.getAllSync<ReceiptRow>(
      `SELECT * FROM grin_local_receipts WHERE owner_uid = ? ORDER BY updated_at DESC`,
      [ownerUid]
    );
    return rows.map((row) => this.toView(row, this.readCommand(ownerUid, row.ledger_id, row.command_id)));
  }

  async dispatchDue(session: GrinDispatchSession, workerId: string, limit = 8): Promise<DispatchReport> {
    const results: DispatchItemResult[] = [];
    if (!this.isSessionCurrent(session)) {
      return { processed: 0, results };
    }
    const candidates = this.db.getAllSync<CommandRow>(
      `SELECT * FROM grin_outbox_commands
        WHERE owner_uid = ?
          AND local_state IN ('queued', 'failed_retryable', 'dispatching', 'attachment_pending')
        ORDER BY created_at ASC`,
      [session.ownerUid]
    );
    const now = this.clock.nowMs();
    for (const row of candidates) {
      if (results.length >= limit) break;
      if (!this.isSessionCurrent(session)) {
        results.push({
          commandId: row.command_id,
          localState: parseState(row.local_state),
          issuedNumber: null,
          replayed: false,
          skipped: "session_retired",
        });
        break;
      }
      if (row.owner_uid !== session.ownerUid) {
        results.push({
          commandId: row.command_id,
          localState: parseState(row.local_state),
          issuedNumber: null,
          replayed: false,
          skipped: "owner_mismatch",
        });
        continue;
      }
      const state = parseState(row.local_state);
      if (!this.leaseFree(row, workerId, session.dispatchGeneration, now)) {
        results.push({
          commandId: row.command_id,
          localState: state,
          issuedNumber: null,
          replayed: false,
          skipped: "lease_held",
        });
        continue;
      }
      const leased = this.tryAcquireLease(session, workerId, row);
      if (!leased) {
        results.push({
          commandId: row.command_id,
          localState: state,
          issuedNumber: null,
          replayed: false,
          skipped: "lease_held",
        });
        continue;
      }
      crashHook?.("after_dispatching");
      if (state === "attachment_pending") {
        results.push(await this.processAttachments(session, workerId, row));
        continue;
      }
      results.push(await this.dispatchLeased(session, workerId, row));
    }
    return { processed: results.filter((r) => !r.skipped).length, results };
  }

  async recoverAfterRestart(session: GrinDispatchSession, workerId: string): Promise<DispatchReport> {
    return this.dispatchDue(session, workerId);
  }

  attachLocalFile(
    session: GrinDispatchSession,
    input: {
      ledgerId: string;
      receiptId: string;
      evidenceId: string;
      role: LocalEvidenceRole;
      localPath: string;
      claimedSha256?: string | null;
      byteSize?: number | null;
    }
  ): GrinLocalEvidenceFile {
    this.assertSessionOwner(session, session.ownerUid);
    assertReceiptId(input.receiptId);
    const now = this.clock.nowMs();
    const id = evidenceRowId(session.ownerUid, input.ledgerId, input.evidenceId, input.role);
    this.db.runSync(
      `INSERT INTO grin_local_evidence_files (
         id, owner_uid, ledger_id, receipt_id, evidence_id, role, local_path, claimed_sha256,
         byte_size, upload_state, original_durable, retain_local, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
      [
        id,
        session.ownerUid,
        input.ledgerId,
        input.receiptId,
        input.evidenceId,
        input.role,
        input.localPath,
        input.claimedSha256 ?? null,
        input.byteSize ?? null,
        "local_only",
        now,
        now,
      ]
    );
    return this.readEvidenceById(session.ownerUid, id)!;
  }

  listLocalFiles(ownerUid: string, ledgerId: string, receiptId: string): GrinLocalEvidenceFile[] {
    assertOwnerUid(ownerUid);
    const rows = this.db.getAllSync<EvidenceRow>(
      `SELECT * FROM grin_local_evidence_files WHERE owner_uid = ? AND ledger_id = ? AND receipt_id = ?`,
      [ownerUid, ledgerId, receiptId]
    );
    return rows.map((row) => this.toEvidence(row));
  }

  releaseLocalOriginalIfDurable(
    ownerUid: string,
    ledgerId: string,
    evidenceId: string
  ): { ok: true } | { ok: false; reason: string } {
    const id = evidenceRowId(ownerUid, ledgerId, evidenceId, "original");
    const row = this.db.getFirstSync<EvidenceRow>(
      `SELECT * FROM grin_local_evidence_files WHERE id = ? AND owner_uid = ?`,
      [id, ownerUid]
    );
    if (!row) return { ok: false, reason: "not_found" };
    if (row.role !== "original") return { ok: false, reason: "not_original" };
    if (Number(row.original_durable) !== 1) {
      return { ok: false, reason: DURABLE_ORIGINAL_UPLOAD_CONDITION };
    }
    this.db.runSync(
      `UPDATE grin_local_evidence_files SET retain_local = 0, updated_at = ? WHERE id = ? AND owner_uid = ? AND original_durable = 1 AND role = ?`,
      [this.clock.nowMs(), id, ownerUid, "original"]
    );
    return { ok: true };
  }

  applyAccountRetirementHold(ownerUid: string): { retainedUnsyncCount: number } {
    assertOwnerUid(ownerUid);
    const now = this.clock.nowMs();
    this.db.withTransactionSync(() => {
      const row = this.readRuntime(ownerUid);
      this.upsertRuntime({
        owner_uid: ownerUid,
        dispatch_generation: row?.dispatch_generation ?? 0,
        session_active: row?.session_active ?? 0,
        retirement_hold: 1,
        retirement_at: now,
        updated_at: now,
      });
    });
    return { retainedUnsyncCount: this.countUnsynchronised(ownerUid) };
  }

  countUnsynchronised(ownerUid: string): number {
    assertOwnerUid(ownerUid);
    const receipts = this.db.getAllSync<ReceiptRow>(
      `SELECT * FROM grin_local_receipts WHERE owner_uid = ?`,
      [ownerUid]
    );
    let n = 0;
    for (const row of receipts) {
      if (isUnsynchronisedState(parseState(row.local_state))) n += 1;
    }
    const files = this.db.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) as n FROM grin_local_evidence_files
        WHERE owner_uid = ? AND retain_local = 1 AND role = ? AND original_durable = 0`,
      [ownerUid, "original"]
    );
    n += Number(files?.n ?? 0);
    return n;
  }

  purgeOwnerLocalGrin(ownerUid: string): PurgeResult {
    const unsync = this.countUnsynchronised(ownerUid);
    if (unsync > 0) {
      return { ok: false, code: "unsync_evidence_retained", unsynchronisedCount: unsync };
    }
    const any = this.db.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) as n FROM grin_local_receipts WHERE owner_uid = ?`,
      [ownerUid]
    );
    if (Number(any?.n ?? 0) > 0) {
      return { ok: false, code: "deletion_policy_unresolved", unsynchronisedCount: 0 };
    }
    return { ok: true };
  }

  private async dispatchLeased(
    session: GrinDispatchSession,
    workerId: string,
    snapshot: CommandRow
  ): Promise<DispatchItemResult> {
    void workerId;
    const commandType = snapshot.command_type as GrinCommandType;
    if (commandType !== "registerGoodsReceipt") {
      return {
        commandId: snapshot.command_id,
        localState: parseState(snapshot.local_state),
        issuedNumber: null,
        replayed: false,
        skipped: "unsupported_type",
      };
    }
    const envelope: GrinRegisterEnvelope = {
      commandId: snapshot.command_id,
      type: "registerGoodsReceipt",
      ledgerId: snapshot.ledger_id,
      body: parseJson(snapshot.frozen_payload_json),
    };
    let result: GrinRegisterResult;
    let usedReconcile = false;
    try {
      result = await this.server.register({
        uid: snapshot.owner_uid,
        envelope,
        digest: snapshot.digest,
      });
    } catch (err) {
      if (!isNetworkAmbiguous(err)) throw err;
      usedReconcile = true;
      result = await this.server.reconcile({
        uid: snapshot.owner_uid,
        ledgerId: snapshot.ledger_id,
        commandId: snapshot.command_id,
      });
    }
    if (!this.isSessionCurrent(session) && snapshot.owner_uid !== session.ownerUid) {
      return {
        commandId: snapshot.command_id,
        localState: "dispatching",
        issuedNumber: null,
        replayed: false,
        skipped: "session_retired",
      };
    }
    return this.applyRegisterOutcome(snapshot, result, usedReconcile);
  }

  private applyRegisterOutcome(
    snapshot: CommandRow,
    result: GrinRegisterResult,
    usedReconcile: boolean
  ): DispatchItemResult {
    const now = this.clock.nowMs();
    const classified = classifyRegisterResult(result);
    if (classified.kind === "success" && result.ok) {
      const pendingOriginals = this.hasUndurableOriginals(
        snapshot.owner_uid,
        snapshot.ledger_id,
        snapshot.receipt_id
      );
      const nextState: OutboxLocalState = pendingOriginals ? "attachment_pending" : "issued";
      this.writeCommandAndReceipt(snapshot, {
        localState: nextState,
        issuedNumber: result.issuedNumber,
        serverRegisteredAtUtc: result.serverRegisteredAtUtc,
        lastErrorCode: null,
        lastErrorActionable: null,
        clearLease: true,
        now,
      });
      return {
        commandId: snapshot.command_id,
        localState: nextState,
        issuedNumber: result.issuedNumber,
        replayed: result.replayed || usedReconcile,
      };
    }
    if (classified.kind === "success") {
      throw new Error("classified_success_without_ok");
    }
    if (classified.kind === "conflicted") {
      this.writeCommandAndReceipt(snapshot, {
        localState: "conflicted",
        issuedNumber: null,
        serverRegisteredAtUtc: null,
        lastErrorCode: classified.code,
        lastErrorActionable: classified.actionable,
        clearLease: true,
        now,
      });
      return {
        commandId: snapshot.command_id,
        localState: "conflicted",
        issuedNumber: null,
        replayed: false,
      };
    }
    if (classified.kind === "permanent") {
      this.writeCommandAndReceipt(snapshot, {
        localState: "failed_permanent",
        issuedNumber: null,
        serverRegisteredAtUtc: null,
        lastErrorCode: classified.code,
        lastErrorActionable: classified.actionable,
        clearLease: true,
        now,
      });
      return {
        commandId: snapshot.command_id,
        localState: "failed_permanent",
        issuedNumber: null,
        replayed: false,
      };
    }
    if (usedReconcile && result.ok === false && result.code === "not_found") {
      const attemptCount = Number(snapshot.attempt_count) + 1;
      const retry = nextRetryState(attemptCount, this.maxAttempts);
      this.writeCommandAndReceipt(snapshot, {
        localState: retry.state,
        issuedNumber: null,
        serverRegisteredAtUtc: null,
        lastErrorCode: "network_ambiguous",
        lastErrorActionable: retry.actionable,
        attemptCount,
        clearLease: true,
        now,
      });
      return {
        commandId: snapshot.command_id,
        localState: retry.state,
        issuedNumber: null,
        replayed: false,
      };
    }
    const attemptCount = Number(snapshot.attempt_count) + 1;
    const retry = nextRetryState(attemptCount, this.maxAttempts);
    const state = retry.state;
    this.writeCommandAndReceipt(snapshot, {
      localState: state,
      issuedNumber: null,
      serverRegisteredAtUtc: null,
      lastErrorCode: classified.code,
      lastErrorActionable: retry.actionable,
      attemptCount,
      clearLease: true,
      now,
    });
    return {
      commandId: snapshot.command_id,
      localState: state,
      issuedNumber: null,
      replayed: false,
    };
  }

  private async processAttachments(
    session: GrinDispatchSession,
    workerId: string,
    snapshot: CommandRow
  ): Promise<DispatchItemResult> {
    void workerId;
    const files = this.listLocalFiles(snapshot.owner_uid, snapshot.ledger_id, snapshot.receipt_id);
    if (!this.evidence) {
      return {
        commandId: snapshot.command_id,
        localState: "attachment_pending",
        issuedNumber: this.readReceipt(snapshot.owner_uid, snapshot.ledger_id, snapshot.receipt_id)?.issued_number ?? null,
        replayed: false,
      };
    }
    for (const file of files) {
      if (!this.isSessionCurrent(session)) {
        return {
          commandId: snapshot.command_id,
          localState: "attachment_pending",
          issuedNumber: this.readReceipt(snapshot.owner_uid, snapshot.ledger_id, snapshot.receipt_id)?.issued_number ?? null,
          replayed: false,
          skipped: "session_retired",
        };
      }
      if (file.role !== "original" && file.uploadState !== "local_only" && file.uploadState !== "failed_retryable") {
        continue;
      }
      if (file.role === "original" && file.originalDurable) continue;
      const uploaded = await this.evidence.upload({
        uid: snapshot.owner_uid,
        ledgerId: snapshot.ledger_id,
        receiptId: snapshot.receipt_id,
        evidenceId: file.evidenceId,
        role: file.role,
        localPath: file.localPath,
        claimedSha256: file.claimedSha256,
      });
      const now = this.clock.nowMs();
      if (file.role === "thumbnail" || file.role === "metadata") {
        this.db.runSync(
          `UPDATE grin_local_evidence_files
              SET upload_state = ?, original_durable = 0, retain_local = 1, updated_at = ?
            WHERE id = ? AND owner_uid = ? AND role = ?`,
          ["uploaded_derivative", now, evidenceRowId(snapshot.owner_uid, snapshot.ledger_id, file.evidenceId, file.role), snapshot.owner_uid, file.role]
        );
        continue;
      }
      if (uploaded.ok && uploaded.originalDurable) {
        this.db.runSync(
          `UPDATE grin_local_evidence_files
              SET upload_state = ?, original_durable = 1, updated_at = ?
            WHERE id = ? AND owner_uid = ? AND role = ?`,
          [
            "verified",
            now,
            evidenceRowId(snapshot.owner_uid, snapshot.ledger_id, file.evidenceId, "original"),
            snapshot.owner_uid,
            "original",
          ]
        );
      } else {
        this.db.runSync(
          `UPDATE grin_local_evidence_files
              SET upload_state = ?, original_durable = 0, retain_local = 1, updated_at = ?
            WHERE id = ? AND owner_uid = ? AND role = ?`,
          [
            "failed_retryable",
            now,
            evidenceRowId(snapshot.owner_uid, snapshot.ledger_id, file.evidenceId, "original"),
            snapshot.owner_uid,
            "original",
          ]
        );
      }
    }
    const pending = this.hasUndurableOriginals(snapshot.owner_uid, snapshot.ledger_id, snapshot.receipt_id);
    const receipt = this.readReceipt(snapshot.owner_uid, snapshot.ledger_id, snapshot.receipt_id);
    const issuedNumber = receipt?.issued_number ?? null;
    const next: OutboxLocalState = pending ? "attachment_pending" : "issued";
    this.writeCommandAndReceipt(snapshot, {
      localState: next,
      issuedNumber,
      serverRegisteredAtUtc: receipt?.server_registered_at_utc ?? null,
      lastErrorCode: pending ? "attachment_retry" : null,
      lastErrorActionable: pending ? "retry_when_online" : null,
      clearLease: true,
      now: this.clock.nowMs(),
    });
    return {
      commandId: snapshot.command_id,
      localState: next,
      issuedNumber,
      replayed: false,
    };
  }

  private tryAcquireLease(session: GrinDispatchSession, workerId: string, row: CommandRow): boolean {
    const now = this.clock.nowMs();
    const from = parseState(row.local_state);
    const nextState: OutboxLocalState = from === "attachment_pending" ? "attachment_pending" : "dispatching";
    if (from !== nextState) assertTransition(from, nextState);
    const until = now + this.leaseTtlMs;
    let acquired = false;
    this.db.withTransactionSync(() => {
      const result = this.db.runSync(
        `UPDATE grin_outbox_commands
            SET lease_worker_id = ?, lease_generation = ?, lease_until_ms = ?, local_state = ?, updated_at = ?
          WHERE id = ?
            AND owner_uid = ?
            AND local_state IN ('queued', 'failed_retryable', 'dispatching', 'attachment_pending')
            AND (
              lease_worker_id IS NULL
              OR lease_until_ms <= ?
              OR lease_worker_id = ?
              OR lease_generation != ?
            )`,
        [
          workerId,
          session.dispatchGeneration,
          until,
          nextState,
          now,
          row.id,
          session.ownerUid,
          now,
          workerId,
          session.dispatchGeneration,
        ]
      );
      if (result.changes !== 1) return;
      this.db.runSync(
        `UPDATE grin_local_receipts SET local_state = ?, updated_at = ? WHERE owner_uid = ? AND ledger_id = ? AND receipt_id = ?`,
        [nextState, now, row.owner_uid, row.ledger_id, row.receipt_id]
      );
      acquired = true;
    });
    return acquired;
  }

  private leaseFree(
    row: CommandRow,
    workerId: string,
    generation: number,
    now: number
  ): boolean {
    if (!row.lease_worker_id) return true;
    if (Number(row.lease_until_ms ?? 0) <= now) return true;
    if (row.lease_worker_id === workerId) return true;
    if (Number(row.lease_generation ?? -1) !== generation) return true;
    return false;
  }

  private writeCommandAndReceipt(
    snapshot: CommandRow,
    args: {
      localState: OutboxLocalState;
      issuedNumber: string | null;
      serverRegisteredAtUtc: string | null;
      lastErrorCode: string | null;
      lastErrorActionable: ActionableFailure | null;
      attemptCount?: number;
      clearLease: boolean;
      now: number;
    }
  ): void {
    const fromCmd = this.readCommand(snapshot.owner_uid, snapshot.ledger_id, snapshot.command_id);
    const from = fromCmd ? parseState(fromCmd.local_state) : parseState(snapshot.local_state);
    assertTransition(from, args.localState);
    this.db.withTransactionSync(() => {
      this.db.runSync(
        `UPDATE grin_outbox_commands
            SET local_state = ?,
                attempt_count = ?,
                last_error_code = ?,
                last_error_actionable = ?,
                lease_worker_id = ?,
                lease_generation = ?,
                lease_until_ms = ?,
                updated_at = ?
          WHERE id = ? AND owner_uid = ?`,
        [
          args.localState,
          args.attemptCount ?? snapshot.attempt_count,
          args.lastErrorCode,
          args.lastErrorActionable,
          args.clearLease ? null : snapshot.lease_worker_id,
          args.clearLease ? null : snapshot.lease_generation,
          args.clearLease ? null : snapshot.lease_until_ms,
          args.now,
          snapshot.id,
          snapshot.owner_uid,
        ]
      );
      this.db.runSync(
        `UPDATE grin_local_receipts
            SET local_state = ?,
                issued_number = ?,
                server_registered_at_utc = ?,
                updated_at = ?
          WHERE owner_uid = ? AND ledger_id = ? AND receipt_id = ?`,
        [
          args.localState,
          args.issuedNumber,
          args.serverRegisteredAtUtc,
          args.now,
          snapshot.owner_uid,
          snapshot.ledger_id,
          snapshot.receipt_id,
        ]
      );
    });
  }

  private hasUndurableOriginals(ownerUid: string, ledgerId: string, receiptId: string): boolean {
    const row = this.db.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) as n FROM grin_local_evidence_files
        WHERE owner_uid = ? AND ledger_id = ? AND receipt_id = ? AND role = ? AND original_durable = 0 AND retain_local = 1`,
      [ownerUid, ledgerId, receiptId, "original"]
    );
    return Number(row?.n ?? 0) > 0;
  }

  private markConflicted(receipt: ReceiptRow | null, command: CommandRow | null, now: number): void {
    if (receipt) {
      const from = parseState(receipt.local_state);
      if (from !== "conflicted") assertTransition(from, "conflicted");
      this.db.runSync(
        `UPDATE grin_local_receipts SET local_state = ?, updated_at = ? WHERE id = ? AND owner_uid = ?`,
        ["conflicted", now, receipt.id, receipt.owner_uid]
      );
    }
    if (command) {
      const from = parseState(command.local_state);
      if (from !== "conflicted") assertTransition(from, "conflicted");
      this.db.runSync(
        `UPDATE grin_outbox_commands
            SET local_state = ?, last_error_code = ?, last_error_actionable = ?, updated_at = ?
          WHERE id = ? AND owner_uid = ?`,
        ["conflicted", "digest_conflict", "command_payload_mismatch", now, command.id, command.owner_uid]
      );
    }
  }

  private insertReceipt(args: {
    ownerUid: string;
    ledgerId: string;
    receiptId: string;
    commandId: string;
    digest: string | null;
    localState: OutboxLocalState;
    dispatchGeneration: number;
    payload: unknown;
    now: number;
  }): void {
    this.db.runSync(
      `INSERT INTO grin_local_receipts (
         id, owner_uid, ledger_id, receipt_id, command_id, digest, local_state,
         issued_number, server_registered_at_utc, dispatch_generation, payload_json, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)`,
      [
        receiptRowId(args.ownerUid, args.ledgerId, args.receiptId),
        args.ownerUid,
        args.ledgerId,
        args.receiptId,
        args.commandId,
        args.digest,
        args.localState,
        args.dispatchGeneration,
        JSON.stringify(args.payload),
        args.now,
        args.now,
      ]
    );
  }

  private insertCommand(args: {
    ownerUid: string;
    ledgerId: string;
    commandId: string;
    receiptId: string;
    commandType: GrinCommandType;
    digest: string;
    frozenPayload: unknown;
    localState: OutboxLocalState;
    dispatchGeneration: number;
    now: number;
  }): void {
    this.db.runSync(
      `INSERT INTO grin_outbox_commands (
         id, owner_uid, ledger_id, command_id, receipt_id, command_type, digest, frozen_payload_json,
         local_state, attempt_count, max_attempts, last_error_code, last_error_actionable,
         lease_worker_id, lease_generation, lease_until_ms, dispatch_generation, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?)`,
      [
        commandRowId(args.ownerUid, args.ledgerId, args.commandId),
        args.ownerUid,
        args.ledgerId,
        args.commandId,
        args.receiptId,
        args.commandType,
        args.digest,
        JSON.stringify(args.frozenPayload),
        args.localState,
        this.maxAttempts,
        args.dispatchGeneration,
        args.now,
        args.now,
      ]
    );
  }

  private resolveIds(
    session: GrinDispatchSession,
    input: PersistDraftInput,
    _queue: boolean
  ): { ledgerId: string; receiptId: string; commandId: string } {
    void _queue;
    assertLedgerId(input.ledgerId);
    const fromBody =
      input.body && typeof input.body === "object" && typeof (input.body as { receiptId?: unknown }).receiptId === "string"
        ? (input.body as { receiptId: string }).receiptId
        : undefined;
    const receiptId = input.receiptId ?? fromBody ?? mintReceiptId();
    const commandId = input.commandId ?? mintCommandId();
    assertReceiptId(receiptId);
    assertCommandId(commandId);
    const existing = this.readReceipt(session.ownerUid, input.ledgerId, receiptId);
    if (existing) {
      return { ledgerId: input.ledgerId, receiptId, commandId: existing.command_id };
    }
    return { ledgerId: input.ledgerId, receiptId, commandId };
  }

  private bodyWithReceiptId(body: unknown, receiptId: string): unknown {
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return { ...(body as Record<string, unknown>), receiptId };
    }
    return body;
  }

  private assertSessionOwner(session: GrinDispatchSession, ownerUid: string): void {
    if (session.ownerUid !== ownerUid) throw new Error("owner_mismatch");
    if (!this.isSessionCurrent(session)) throw new Error("session_retired");
  }

  private readReceipt(ownerUid: string, ledgerId: string, receiptId: string): ReceiptRow | null {
    return this.db.getFirstSync<ReceiptRow>(
      `SELECT * FROM grin_local_receipts WHERE owner_uid = ? AND ledger_id = ? AND receipt_id = ?`,
      [ownerUid, ledgerId, receiptId]
    );
  }

  private readCommand(ownerUid: string, ledgerId: string, commandId: string): CommandRow | null {
    return this.db.getFirstSync<CommandRow>(
      `SELECT * FROM grin_outbox_commands WHERE owner_uid = ? AND ledger_id = ? AND command_id = ?`,
      [ownerUid, ledgerId, commandId]
    );
  }

  private readRuntime(ownerUid: string): RuntimeRow | null {
    return this.db.getFirstSync<RuntimeRow>(
      `SELECT * FROM grin_owner_runtime WHERE owner_uid = ?`,
      [ownerUid]
    );
  }

  private upsertRuntime(row: RuntimeRow & { updated_at: number }): void {
    const existing = this.readRuntime(row.owner_uid);
    if (!existing) {
      this.db.runSync(
        `INSERT INTO grin_owner_runtime (
           owner_uid, dispatch_generation, session_active, retirement_hold, retirement_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          row.owner_uid,
          row.dispatch_generation,
          row.session_active,
          row.retirement_hold,
          row.retirement_at,
          row.updated_at,
        ]
      );
      return;
    }
    this.db.runSync(
      `UPDATE grin_owner_runtime
          SET dispatch_generation = ?, session_active = ?, retirement_hold = ?, retirement_at = ?, updated_at = ?
        WHERE owner_uid = ?`,
      [
        row.dispatch_generation,
        row.session_active,
        row.retirement_hold,
        row.retirement_at,
        row.updated_at,
        row.owner_uid,
      ]
    );
  }

  private toView(receipt: ReceiptRow, command: CommandRow | null): GrinLocalReceiptView {
    return {
      ownerUid: receipt.owner_uid,
      ledgerId: receipt.ledger_id,
      receiptId: receipt.receipt_id,
      commandId: receipt.command_id,
      digest: receipt.digest ?? command?.digest ?? "",
      localState: parseState(receipt.local_state),
      issuedNumber: receipt.issued_number,
      serverRegisteredAtUtc: receipt.server_registered_at_utc,
      dispatchGeneration: Number(receipt.dispatch_generation ?? 0),
      commandType: command ? (command.command_type as GrinCommandType) : null,
      lastErrorCode: command?.last_error_code ?? null,
      lastErrorActionable: (command?.last_error_actionable as ActionableFailure | null) ?? null,
      attemptCount: Number(command?.attempt_count ?? 0),
    };
  }

  private readEvidenceById(ownerUid: string, id: string): GrinLocalEvidenceFile | null {
    const row = this.db.getFirstSync<EvidenceRow>(
      `SELECT * FROM grin_local_evidence_files WHERE id = ? AND owner_uid = ?`,
      [id, ownerUid]
    );
    return row ? this.toEvidence(row) : null;
  }

  private toEvidence(row: EvidenceRow): GrinLocalEvidenceFile {
    return {
      ownerUid: row.owner_uid,
      ledgerId: row.ledger_id,
      receiptId: row.receipt_id,
      evidenceId: row.evidence_id,
      role: row.role as LocalEvidenceRole,
      localPath: row.local_path,
      claimedSha256: row.claimed_sha256,
      byteSize: row.byte_size == null ? null : Number(row.byte_size),
      uploadState: row.upload_state as GrinLocalEvidenceFile["uploadState"],
      originalDurable: Number(row.original_durable) === 1,
      retainLocal: Number(row.retain_local) === 1,
    };
  }
}

export function peekQueuedCommand(
  db: GrinSqlDb,
  ownerUid: string,
  ledgerId: string,
  commandId: string
): GrinQueuedCommand | null {
  const row = db.getFirstSync<CommandRow>(
    `SELECT * FROM grin_outbox_commands WHERE owner_uid = ? AND ledger_id = ? AND command_id = ?`,
    [ownerUid, ledgerId, commandId]
  );
  if (!row) return null;
  return {
    ownerUid: row.owner_uid,
    ledgerId: row.ledger_id,
    commandId: row.command_id,
    receiptId: row.receipt_id,
    commandType: row.command_type as GrinCommandType,
    digest: row.digest,
    frozenPayload: parseJson(row.frozen_payload_json),
    localState: parseState(row.local_state),
    attemptCount: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    lastErrorCode: row.last_error_code,
    lastErrorActionable: (row.last_error_actionable as ActionableFailure | null) ?? null,
    leaseWorkerId: row.lease_worker_id,
    leaseGeneration: row.lease_generation == null ? null : Number(row.lease_generation),
    leaseUntilMs: row.lease_until_ms == null ? null : Number(row.lease_until_ms),
    dispatchGeneration: Number(row.dispatch_generation),
  };
}
