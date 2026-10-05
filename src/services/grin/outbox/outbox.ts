import type {
  GrinCommandType,
  GrinConfirmedProjection,
  GrinMutationResult,
  GrinReceiptReadResult,
  GrinReconcileResult,
  GrinRegisterResult,
  OutboxLocalState,
} from "@/goodsEvidence/ports";
import {
  generationError,
  HASH_CHUNK_BYTES,
  hashBoundedChunks,
  isAllowedOriginalMime,
  isSha256Hex,
  isWave1OriginalCategory,
  MAX_CONCURRENT_UPLOADS_PER_OWNER,
  normalizeOsConversionOccurred,
  storagePathShapeError,
  type Wave1OriginalCategory,
} from "@/goodsEvidence/evidence";
import { migrateToV10 } from "@/localDb/migrateGrin";
import { classifyRegisterResult, isNetworkAmbiguous, nextRetryState, type ClassifiedOutcome } from "./classify";
import { confirmedProjectionJson, parseConfirmedProjection } from "./confirmedProjection";
import { freezeAdmittedCommand } from "./freeze";
import type { GrinSqlDb } from "./hostSqlite";
import {
  assertCommandId,
  assertLedgerId,
  assertOwnerUid,
  assertReceiptId,
  commandRowId,
  evidenceRowId,
  mintAttemptId,
  mintCommandId,
  mintReceiptId,
  receiptRowId,
} from "./ids";
import type {
  GrinEvidenceUploadPort,
  GrinEvidenceUploadResult,
  GrinMutationEnvelope,
  GrinRegisterEnvelope,
  GrinServerCommandPort,
} from "./ports";
import { assertTransition, canTransition, isUnsynchronisedState } from "./transitions";
import type {
  ActionableFailure,
  GrinDispatchSession,
  GrinLocalEvidenceFile,
  GrinLocalOriginalHasher,
  GrinLocalReceiptView,
  GrinQueuedCommand,
  LocalEvidenceRole,
  OutboxCrashPhase,
} from "./types";
import {
  liveTokenCurrent,
  memoryGenerationForOwner,
  nextDispatchGeneration,
  type LiveSessionToken,
} from "./sessionAuthority";
import {
  DEFAULT_LEASE_TTL_MS,
  DURABLE_ORIGINAL_UPLOAD_CONDITION,
  MAX_DISPATCH_ATTEMPTS,
} from "./types";

export { DURABLE_ORIGINAL_UPLOAD_CONDITION };

const MUTATION_COMMAND_TYPES = new Set<GrinMutationEnvelope["type"]>([
  "amendFields",
  "recordQc",
  "dispatchReturn",
  "correctReturnDispatch",
  "voidWithReason",
  "recordEwbObservation",
  "linkVerifiedEvidence",
]);

function isMutationCommandType(type: string): type is GrinMutationEnvelope["type"] {
  return (MUTATION_COMMAND_TYPES as ReadonlySet<string>).has(type);
}

/** Reconcile is wave1b-shaped; register dispatch never invents issuedNumber from a mutation success. */
function registerResultFromReconcile(result: GrinReconcileResult): GrinRegisterResult {
  if (!result.ok) return result;
  if (result.commandType === "registerGoodsReceipt") {
    return {
      ok: true,
      replayed: result.replayed,
      receiptId: result.receiptId,
      issuedNumber: result.issuedNumber,
      serial: result.serial,
      serverRegisteredAtUtc: result.serverRegisteredAtUtc,
      eventVersion: result.eventVersion,
      headHash: result.headHash,
    };
  }
  return { ok: false, code: "integrity", detail: "reconcile_result_not_register" };
}

function mutationResultFromReconcile(result: GrinReconcileResult): GrinMutationResult {
  if (!result.ok) return result;
  if (result.commandType !== "registerGoodsReceipt") {
    return {
      ok: true,
      replayed: result.replayed,
      receiptId: result.receiptId,
      eventId: result.eventId,
      eventVersion: result.eventVersion,
      headHash: result.headHash,
      serverAcceptedAtUtc: result.serverAcceptedAtUtc,
    };
  }
  return { ok: false, code: "integrity", detail: "reconcile_result_not_mutation" };
}

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
  confirmed_event_version: number | null;
  confirmed_head_hash: string | null;
  confirmed_original_json: string | null;
  confirmed_events_json: string | null;
  confirmed_effective_json: string | null;
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
  lease_attempt_id: string | null;
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
  category: string | null;
  upload_state: string;
  original_durable: number;
  retain_local: number;
  actual_sha256: string | null;
  mime: string | null;
  size_bytes: number | null;
  storage_path: string | null;
  object_generation: string | null;
  reservation_id: string | null;
  capture_provenance: string | null;
  os_conversion_occurred: string | null;
  claimed_mime: string | null;
};

type LocalOriginalHash = {
  sha256: string;
  byteSize: number;
};

const FORBIDDEN_OBJECT_GENERATION = "verified";

function encodeOsConversion(value: unknown): string {
  const normalized = normalizeOsConversionOccurred(value);
  if (normalized === true) return "true";
  if (normalized === false) return "false";
  return "unknown";
}

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

export type PersistMutationInput = {
  ledgerId: string;
  receiptId: string;
  type: GrinMutationEnvelope["type"];
  body: unknown;
  commandId?: string;
};

type AttemptFence = {
  workerId: string;
  attemptId: string;
  generation: number;
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
  skipped?:
    | "session_retired"
    | "lease_held"
    | "owner_mismatch"
    | "unsupported_type"
    | "predecessor_inflight";
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
  /**
   * Required to mark an original durable. SQLITE_HOST injects node fs chunks
   * at HASH_CHUNK_BYTES (not NATIVE_DEVICE). Echoed claimedSha256 cannot substitute.
   */
  localOriginalHasher?: GrinLocalOriginalHasher | null;
};

export class GrinOutbox {
  private readonly db: GrinSqlDb;
  private readonly server: GrinServerCommandPort;
  private readonly evidence: GrinEvidenceUploadPort | null;
  private readonly clock: Clock;
  private readonly leaseTtlMs: number;
  private readonly maxAttempts: number;
  private readonly localOriginalHasher: GrinLocalOriginalHasher | null;
  /** Process-local live token. Not durable. Restart falls back to sqlite. */
  private liveToken: LiveSessionToken | null = null;
  private readonly inFlightUploadsByOwner = new Map<string, number>();

  constructor(deps: GrinOutboxDeps) {
    this.db = deps.db;
    this.server = deps.server;
    this.evidence = deps.evidence ?? null;
    this.clock = deps.clock ?? { nowMs: () => Date.now() };
    this.leaseTtlMs = deps.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS;
    this.maxAttempts = deps.maxAttempts ?? MAX_DISPATCH_ATTEMPTS;
    this.localOriginalHasher = deps.localOriginalHasher ?? null;
  }

  ensureSchema(): void {
    migrateToV10(this.db as unknown as Parameters<typeof migrateToV10>[0]);
  }

  /**
   * Combined claim + sqlite persist. Prefer claimOwnerSession + persistBeginOwnerSession
   * when sqlite must not run inside a React render.
   * Only session starter. persistDraftAndQueue, persistMutationAndQueue,
   * dispatchDue, recoverAfterRestart, attachLocalFile, and completion must not
   * call this to revive a retired session.
   */
  beginOwnerSession(ownerUid: string): GrinDispatchSession {
    const session = this.claimOwnerSession(ownerUid);
    this.persistBeginOwnerSession(session);
    return session;
  }

  /**
   * Immediate in-memory live token. generation = max(persisted, memory)+1.
   * Does not write sqlite. Making B current retires A's captured origin now.
   */
  claimOwnerSession(ownerUid: string): GrinDispatchSession {
    assertOwnerUid(ownerUid);
    const persisted = Number(this.readRuntime(ownerUid)?.dispatch_generation ?? 0);
    const memory = memoryGenerationForOwner(this.liveToken, ownerUid);
    const dispatchGeneration = nextDispatchGeneration(persisted, memory);
    this.liveToken = { ownerUid, dispatchGeneration, active: true };
    return { ownerUid, dispatchGeneration };
  }

  /** Alias for claimOwnerSession (contract F1 advanceLiveToken). */
  advanceLiveToken(ownerUid: string): GrinDispatchSession {
    return this.claimOwnerSession(ownerUid);
  }

  persistBeginOwnerSession(session: GrinDispatchSession): void {
    assertOwnerUid(session.ownerUid);
    if (
      this.liveToken &&
      (this.liveToken.ownerUid !== session.ownerUid ||
        this.liveToken.dispatchGeneration !== session.dispatchGeneration ||
        !this.liveToken.active)
    ) {
      return;
    }
    const now = this.clock.nowMs();
    this.db.withTransactionSync(() => {
      const row = this.readRuntime(session.ownerUid);
      const persisted = Number(row?.dispatch_generation ?? 0);
      if (persisted > session.dispatchGeneration) return;
      this.upsertRuntime({
        owner_uid: session.ownerUid,
        dispatch_generation: session.dispatchGeneration,
        session_active: 1,
        retirement_hold: row?.retirement_hold ?? 0,
        retirement_at: row?.retirement_at ?? null,
        updated_at: now,
      });
    });
  }

  persistEndOwnerSession(session: GrinDispatchSession): void {
    assertOwnerUid(session.ownerUid);
    const now = this.clock.nowMs();
    if (
      this.liveToken &&
      this.liveToken.ownerUid === session.ownerUid &&
      this.liveToken.dispatchGeneration === session.dispatchGeneration
    ) {
      const next = nextDispatchGeneration(
        Number(this.readRuntime(session.ownerUid)?.dispatch_generation ?? 0),
        this.liveToken.dispatchGeneration
      );
      this.liveToken = { ownerUid: session.ownerUid, dispatchGeneration: next, active: false };
    }
    this.db.withTransactionSync(() => {
      const row = this.readRuntime(session.ownerUid);
      const persisted = Number(row?.dispatch_generation ?? 0);
      if (persisted > session.dispatchGeneration && Number(row?.session_active) === 0) return;
      const generation = nextDispatchGeneration(persisted, session.dispatchGeneration);
      this.upsertRuntime({
        owner_uid: session.ownerUid,
        dispatch_generation: generation,
        session_active: 0,
        retirement_hold: row?.retirement_hold ?? 0,
        retirement_at: row?.retirement_at ?? null,
        updated_at: now,
      });
    });
  }

  endOwnerSession(ownerUid: string): void {
    assertOwnerUid(ownerUid);
    const live =
      this.liveToken?.ownerUid === ownerUid
        ? { ownerUid, dispatchGeneration: this.liveToken.dispatchGeneration }
        : null;
    if (live) {
      this.persistEndOwnerSession(live);
      return;
    }
    const now = this.clock.nowMs();
    this.db.withTransactionSync(() => {
      const row = this.readRuntime(ownerUid);
      const generation = nextDispatchGeneration(Number(row?.dispatch_generation ?? 0), 0);
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
    const fromMemory = liveTokenCurrent(this.liveToken, session);
    if (fromMemory !== null) return fromMemory;
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

  /**
   * G4 mutations through the same admit contract as persistDraftAndQueue:
   * immutable command identity, current session required, no self-revive.
   * Does not call beginOwnerSession.
   */
  persistMutationAndQueue(session: GrinDispatchSession, input: PersistMutationInput): GrinLocalReceiptView {
    this.assertSessionOwner(session, session.ownerUid);
    if (!isMutationCommandType(input.type)) {
      throw new Error("unsupported_type");
    }
    assertLedgerId(input.ledgerId);
    assertReceiptId(input.receiptId);
    const commandId = input.commandId ?? mintCommandId();
    assertCommandId(commandId);
    const frozen = freezeAdmittedCommand({
      commandId,
      type: input.type,
      ownerUid: session.ownerUid,
      ledgerId: input.ledgerId,
      body: this.bodyWithReceiptId(input.body, input.receiptId),
    });
    const now = this.clock.nowMs();
    this.db.withTransactionSync(() => {
      const existingReceipt = this.readReceipt(session.ownerUid, input.ledgerId, input.receiptId);
      const existingCommand = this.readCommand(session.ownerUid, input.ledgerId, frozen.commandId);
      if (existingCommand) {
        if (existingCommand.digest !== frozen.digest) {
          this.markConflicted(existingReceipt, existingCommand, now);
          return;
        }
        return;
      }
      if (!existingReceipt) {
        this.insertReceipt({
          ownerUid: session.ownerUid,
          ledgerId: input.ledgerId,
          receiptId: input.receiptId,
          commandId: frozen.commandId,
          digest: frozen.digest,
          localState: "queued",
          dispatchGeneration: session.dispatchGeneration,
          payload: frozen.body,
          now,
        });
      } else {
        const from = parseState(existingReceipt.local_state);
        const nextReceiptState: OutboxLocalState = from === "draft" ? "queued" : from;
        if (from === "draft") assertTransition(from, nextReceiptState);
        this.db.runSync(
          `UPDATE grin_local_receipts
              SET command_id = ?, digest = ?, local_state = ?, dispatch_generation = ?, updated_at = ?
            WHERE id = ? AND owner_uid = ?`,
          [
            frozen.commandId,
            frozen.digest,
            nextReceiptState,
            session.dispatchGeneration,
            now,
            existingReceipt.id,
            session.ownerUid,
          ]
        );
      }
      crashHook?.("after_receipt");
      this.insertCommand({
        ownerUid: session.ownerUid,
        ledgerId: input.ledgerId,
        commandId: frozen.commandId,
        receiptId: input.receiptId,
        commandType: input.type,
        digest: frozen.digest,
        frozenPayload: frozen.body,
        localState: "queued",
        dispatchGeneration: session.dispatchGeneration,
        now,
      });
      crashHook?.("after_command");
    });
    return this.getRecord(session.ownerUid, input.ledgerId, input.receiptId)!;
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

  listForOwnerAndLedger(ownerUid: string, ledgerId: string): GrinLocalReceiptView[] {
    assertOwnerUid(ownerUid);
    assertLedgerId(ledgerId);
    const rows = this.db.getAllSync<ReceiptRow>(
      `SELECT * FROM grin_local_receipts WHERE owner_uid = ? AND ledger_id = ? ORDER BY updated_at DESC`,
      [ownerUid, ledgerId]
    );
    return rows.map((row) => this.toView(row, this.readCommand(ownerUid, row.ledger_id, row.command_id)));
  }

  getConfirmedProjection(
    ownerUid: string,
    ledgerId: string,
    receiptId: string
  ): GrinConfirmedProjection | null {
    assertOwnerUid(ownerUid);
    assertLedgerId(ledgerId);
    assertReceiptId(receiptId);
    const row = this.readReceipt(ownerUid, ledgerId, receiptId);
    if (!row) return null;
    if (row.confirmed_event_version == null || row.confirmed_head_hash == null) return null;
    if (
      row.confirmed_original_json == null ||
      row.confirmed_events_json == null ||
      row.confirmed_effective_json == null
    ) {
      return null;
    }
    try {
      return parseConfirmedProjection(
        {
          receiptId: row.receipt_id,
          eventVersion: Number(row.confirmed_event_version),
          headHash: row.confirmed_head_hash,
          original: JSON.parse(row.confirmed_original_json) as unknown,
          events: JSON.parse(row.confirmed_events_json) as unknown,
          effective: JSON.parse(row.confirmed_effective_json) as unknown,
        },
        receiptId
      );
    } catch {
      return null;
    }
  }

  persistConfirmedProjection(session: GrinDispatchSession, confirmed: GrinConfirmedProjection): void {
    this.assertSessionOwner(session, session.ownerUid);
    const parsed = parseConfirmedProjection(confirmed, confirmed.receiptId);
    if (!parsed) throw new Error("invalid_confirmed_projection");
    const now = this.clock.nowMs();
    this.db.withTransactionSync(() => {
      if (!this.isSessionCurrent(session)) throw new Error("session_retired");
      const ledgerId = this.ledgerIdForConfirmed(session.ownerUid, parsed);
      if (!ledgerId) throw new Error("invalid_confirmed_projection");
      this.upsertConfirmedProjection(session.ownerUid, ledgerId, parsed, now);
    });
  }

  listCommandsForReceipt(ownerUid: string, ledgerId: string, receiptId: string): GrinQueuedCommand[] {
    assertOwnerUid(ownerUid);
    assertLedgerId(ledgerId);
    assertReceiptId(receiptId);
    const rows = this.db.getAllSync<CommandRow>(
      `SELECT * FROM grin_outbox_commands
        WHERE owner_uid = ? AND ledger_id = ? AND receipt_id = ?
        ORDER BY created_at ASC`,
      [ownerUid, ledgerId, receiptId]
    );
    return rows.map((row) => this.toQueued(row));
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
    let slotsUsed = 0;
    for (const row of candidates) {
      if (slotsUsed >= limit) break;
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
      if (state !== "attachment_pending" && !this.canDispatchCommandType(row.command_type)) {
        // Do not acquire a lease for types this worker cannot dispatch.
        const localState = state === "dispatching" ? "queued" : state;
        if (state === "dispatching") this.releaseUnsupportedToQueued(row);
        results.push({
          commandId: row.command_id,
          localState,
          issuedNumber: null,
          replayed: false,
          skipped: "unsupported_type",
        });
        continue;
      }
      if (this.hasInFlightPredecessorMutation(row)) {
        results.push({
          commandId: row.command_id,
          localState: state,
          issuedNumber: null,
          replayed: false,
          skipped: "predecessor_inflight",
        });
        continue;
      }
      if (!this.leaseFree(row, workerId, session.dispatchGeneration, now)) {
        results.push({
          commandId: row.command_id,
          localState: state,
          issuedNumber: null,
          replayed: false,
          skipped: "lease_held",
        });
        slotsUsed += 1;
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
        slotsUsed += 1;
        continue;
      }
      crashHook?.("after_dispatching");
      slotsUsed += 1;
      if (state === "attachment_pending") {
        results.push(await this.processAttachments(session, workerId, leased));
        continue;
      }
      results.push(await this.dispatchLeased(session, workerId, leased));
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
      category?: unknown;
      captureProvenance?: string | null;
      osConversionOccurred?: boolean | "unknown";
      mime?: string | null;
    }
  ): GrinLocalEvidenceFile {
    this.assertSessionOwner(session, session.ownerUid);
    assertReceiptId(input.receiptId);
    let category: Wave1OriginalCategory | null = null;
    if (input.role === "original") {
      if (!isWave1OriginalCategory(input.category)) {
        throw new Error("invalid_evidence_category");
      }
      category = input.category;
    }
    const now = this.clock.nowMs();
    const id = evidenceRowId(session.ownerUid, input.ledgerId, input.evidenceId, input.role);
    this.db.runSync(
      `INSERT INTO grin_local_evidence_files (
         id, owner_uid, ledger_id, receipt_id, evidence_id, role, local_path, claimed_sha256,
         byte_size, category, upload_state, original_durable, retain_local, capture_provenance,
         os_conversion_occurred, claimed_mime,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?)`,
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
        category,
        "local_only",
        input.captureProvenance ?? null,
        encodeOsConversion(input.osConversionOccurred),
        input.mime?.trim() || null,
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

  private canDispatchCommandType(commandType: string): boolean {
    if (commandType === "registerGoodsReceipt") return true;
    return typeof this.server.mutate === "function" && isMutationCommandType(commandType);
  }

  private releaseUnsupportedToQueued(snapshot: CommandRow): void {
    const receipt = this.readReceipt(snapshot.owner_uid, snapshot.ledger_id, snapshot.receipt_id);
    this.writeCommandAndReceipt(snapshot, {
      localState: "queued",
      issuedNumber: receipt?.issued_number ?? null,
      serverRegisteredAtUtc: receipt?.server_registered_at_utc ?? null,
      lastErrorCode: snapshot.last_error_code,
      lastErrorActionable: (snapshot.last_error_actionable as ActionableFailure | null) ?? null,
      attemptCount: snapshot.attempt_count,
      clearLease: true,
      now: this.clock.nowMs(),
    });
  }

  private attemptFence(session: GrinDispatchSession, workerId: string, snapshot: CommandRow): AttemptFence | null {
    if (!snapshot.lease_attempt_id) return null;
    return {
      workerId,
      attemptId: snapshot.lease_attempt_id,
      generation: session.dispatchGeneration,
    };
  }

  private attemptOwns(
    current: CommandRow | null,
    fence: AttemptFence,
    now: number
  ): boolean {
    if (!current) return false;
    if (current.lease_worker_id !== fence.workerId) return false;
    if (Number(current.lease_generation) !== fence.generation) return false;
    if (current.lease_attempt_id !== fence.attemptId) return false;
    if (Number(current.lease_until_ms ?? 0) <= now) return false;
    return true;
  }

  private ownsLiveAttempt(
    session: GrinDispatchSession,
    fence: AttemptFence,
    snapshot: CommandRow
  ): boolean {
    if (!this.isSessionCurrent(session)) return false;
    const current = this.readCommand(snapshot.owner_uid, snapshot.ledger_id, snapshot.command_id);
    return this.attemptOwns(current, fence, this.clock.nowMs());
  }

  private async dispatchLeased(
    session: GrinDispatchSession,
    workerId: string,
    snapshot: CommandRow
  ): Promise<DispatchItemResult> {
    const fence = this.attemptFence(session, workerId, snapshot);
    if (!fence) {
      return this.skipStaleCompletion(session, workerId, snapshot) ?? this.leaseHeldResult(snapshot);
    }
    const commandType = snapshot.command_type;
    if (!this.canDispatchCommandType(commandType)) {
      this.releaseUnsupportedToQueued(snapshot);
      return {
        commandId: snapshot.command_id,
        localState: "queued",
        issuedNumber: null,
        replayed: false,
        skipped: "unsupported_type",
      };
    }
    if (isMutationCommandType(commandType)) {
      return this.dispatchLeasedMutation(session, workerId, snapshot, commandType, fence);
    }
    const beforeRegister = this.skipStaleCompletion(session, workerId, snapshot);
    if (beforeRegister) return beforeRegister;
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
      const beforeReconcile = this.skipStaleCompletion(session, workerId, snapshot);
      if (beforeReconcile) return beforeReconcile;
      usedReconcile = true;
      result = registerResultFromReconcile(
        await this.server.reconcile({
          uid: snapshot.owner_uid,
          ledgerId: snapshot.ledger_id,
          commandId: snapshot.command_id,
        })
      );
    }
    const stale = this.skipStaleCompletion(session, workerId, snapshot);
    if (stale) return stale;
    const confirmed = await this.readValidatedConfirmation(session, workerId, snapshot);
    const afterRead = this.skipStaleCompletion(session, workerId, snapshot);
    if (afterRead) return afterRead;
    return this.applyRegisterOutcome(session, snapshot, result, usedReconcile, fence, confirmed);
  }

  private async dispatchLeasedMutation(
    session: GrinDispatchSession,
    workerId: string,
    snapshot: CommandRow,
    commandType: GrinMutationEnvelope["type"],
    fence: AttemptFence
  ): Promise<DispatchItemResult> {
    const mutate = this.server.mutate;
    if (!mutate) {
      this.releaseUnsupportedToQueued(snapshot);
      return {
        commandId: snapshot.command_id,
        localState: "queued",
        issuedNumber: null,
        replayed: false,
        skipped: "unsupported_type",
      };
    }
    const beforeMutate = this.skipStaleCompletion(session, workerId, snapshot);
    if (beforeMutate) return beforeMutate;
    const envelope: GrinMutationEnvelope = {
      commandId: snapshot.command_id,
      type: commandType,
      ledgerId: snapshot.ledger_id,
      body: parseJson(snapshot.frozen_payload_json),
    };
    let result: GrinMutationResult;
    let usedReconcile = false;
    try {
      result = await mutate({
        uid: snapshot.owner_uid,
        envelope,
        digest: snapshot.digest,
      });
    } catch (err) {
      if (!isNetworkAmbiguous(err)) throw err;
      const beforeReconcile = this.skipStaleCompletion(session, workerId, snapshot);
      if (beforeReconcile) return beforeReconcile;
      usedReconcile = true;
      result = mutationResultFromReconcile(
        await this.server.reconcile({
          uid: snapshot.owner_uid,
          ledgerId: snapshot.ledger_id,
          commandId: snapshot.command_id,
        })
      );
    }
    const stale = this.skipStaleCompletion(session, workerId, snapshot);
    if (stale) return stale;
    const confirmed = await this.readValidatedConfirmation(session, workerId, snapshot);
    const afterRead = this.skipStaleCompletion(session, workerId, snapshot);
    if (afterRead) return afterRead;
    return this.applyMutationOutcome(session, snapshot, result, usedReconcile, fence, confirmed);
  }

  /**
   * After register/reconcile/mutate/upload returns, do not persist if this
   * session was retired, the unique attempt is no longer live, or the lease
   * expired. Does not mint issuedNumber from the server result.
   */
  private skipStaleCompletion(
    session: GrinDispatchSession,
    workerId: string,
    snapshot: CommandRow
  ): DispatchItemResult | null {
    if (!this.isSessionCurrent(session)) {
      const current = this.readCommand(snapshot.owner_uid, snapshot.ledger_id, snapshot.command_id);
      return {
        commandId: snapshot.command_id,
        localState: current ? parseState(current.local_state) : parseState(snapshot.local_state),
        issuedNumber: null,
        replayed: false,
        skipped: "session_retired",
      };
    }
    const fence = this.attemptFence(session, workerId, snapshot);
    const current = this.readCommand(snapshot.owner_uid, snapshot.ledger_id, snapshot.command_id);
    if (!fence || !this.attemptOwns(current, fence, this.clock.nowMs())) {
      return this.leaseHeldResult(current ?? snapshot);
    }
    return null;
  }

  private leaseHeldResult(snapshot: CommandRow): DispatchItemResult {
    return {
      commandId: snapshot.command_id,
      localState: parseState(snapshot.local_state),
      issuedNumber: null,
      replayed: false,
      skipped: "lease_held",
    };
  }

  private applyRegisterOutcome(
    session: GrinDispatchSession,
    snapshot: CommandRow,
    result: GrinRegisterResult,
    usedReconcile: boolean,
    fence: AttemptFence,
    confirmed: GrinConfirmedProjection | null
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
      const wrote = this.writeCommandAndReceipt(snapshot, {
        localState: nextState,
        issuedNumber: result.issuedNumber,
        serverRegisteredAtUtc: result.serverRegisteredAtUtc,
        lastErrorCode: null,
        lastErrorActionable: null,
        clearLease: true,
        now,
        session,
        fence,
        confirmed,
      });
      if (!wrote) {
        return this.skipStaleCompletion(session, fence.workerId, snapshot) ?? this.leaseHeldResult(snapshot);
      }
      return {
        commandId: snapshot.command_id,
        localState: nextState,
        issuedNumber: result.issuedNumber,
        replayed: result.replayed || usedReconcile,
      };
    }
    return this.applyNonSuccessOutcome(session, snapshot, result, classified, usedReconcile, {
      issuedNumber: null,
      serverRegisteredAtUtc: null,
    }, fence);
  }

  private applyMutationOutcome(
    session: GrinDispatchSession,
    snapshot: CommandRow,
    result: GrinMutationResult,
    usedReconcile: boolean,
    fence: AttemptFence,
    confirmed: GrinConfirmedProjection | null
  ): DispatchItemResult {
    const receipt = this.readReceipt(snapshot.owner_uid, snapshot.ledger_id, snapshot.receipt_id);
    const issuedNumber = receipt?.issued_number ?? null;
    const serverRegisteredAtUtc = receipt?.server_registered_at_utc ?? null;
    const classified = classifyRegisterResult(result);
    if (classified.kind === "success" && result.ok) {
      const now = this.clock.nowMs();
      const wrote = this.writeCommandAndReceipt(snapshot, {
        localState: "issued",
        issuedNumber,
        serverRegisteredAtUtc,
        lastErrorCode: null,
        lastErrorActionable: null,
        clearLease: true,
        now,
        session,
        fence,
        confirmed,
      });
      if (!wrote) {
        return this.skipStaleCompletion(session, fence.workerId, snapshot) ?? this.leaseHeldResult(snapshot);
      }
      return {
        commandId: snapshot.command_id,
        localState: "issued",
        issuedNumber,
        replayed: result.replayed || usedReconcile,
      };
    }
    return this.applyNonSuccessOutcome(session, snapshot, result, classified, usedReconcile, {
      issuedNumber,
      serverRegisteredAtUtc,
    }, fence);
  }

  private applyNonSuccessOutcome(
    session: GrinDispatchSession,
    snapshot: CommandRow,
    result: GrinRegisterResult | GrinMutationResult,
    classified: ClassifiedOutcome,
    usedReconcile: boolean,
    keep: { issuedNumber: string | null; serverRegisteredAtUtc: string | null },
    fence: AttemptFence
  ): DispatchItemResult {
    const now = this.clock.nowMs();
    if (classified.kind === "success") {
      throw new Error("classified_success_without_ok");
    }
    const writeOrSkip = (localState: OutboxLocalState, extra: {
      lastErrorCode: string | null;
      lastErrorActionable: ActionableFailure | null;
      attemptCount?: number;
    }): DispatchItemResult => {
      const wrote = this.writeCommandAndReceipt(snapshot, {
        localState,
        issuedNumber: keep.issuedNumber,
        serverRegisteredAtUtc: keep.serverRegisteredAtUtc,
        lastErrorCode: extra.lastErrorCode,
        lastErrorActionable: extra.lastErrorActionable,
        attemptCount: extra.attemptCount,
        clearLease: true,
        now,
        session,
        fence,
      });
      if (!wrote) {
        return this.skipStaleCompletion(session, fence.workerId, snapshot) ?? this.leaseHeldResult(snapshot);
      }
      return {
        commandId: snapshot.command_id,
        localState,
        issuedNumber: keep.issuedNumber,
        replayed: false,
      };
    };
    if (classified.kind === "conflicted") {
      return writeOrSkip("conflicted", {
        lastErrorCode: classified.code,
        lastErrorActionable: classified.actionable,
      });
    }
    if (classified.kind === "permanent") {
      return writeOrSkip("failed_permanent", {
        lastErrorCode: classified.code,
        lastErrorActionable: classified.actionable,
      });
    }
    if (usedReconcile && result.ok === false && result.code === "not_found") {
      const attemptCount = Number(snapshot.attempt_count) + 1;
      const retry = nextRetryState(attemptCount, this.maxAttempts);
      return writeOrSkip(retry.state, {
        lastErrorCode: "network_ambiguous",
        lastErrorActionable: retry.actionable,
        attemptCount,
      });
    }
    const attemptCount = Number(snapshot.attempt_count) + 1;
    const retry = nextRetryState(attemptCount, this.maxAttempts);
    return writeOrSkip(retry.state, {
      lastErrorCode: classified.code,
      lastErrorActionable: retry.actionable,
      attemptCount,
    });
  }

  private async hashRetainedOriginalBytes(localPath: string): Promise<LocalOriginalHash | null> {
    const hasher = this.localOriginalHasher;
    if (!hasher) return null;
    try {
      const hashed = await hashBoundedChunks(
        hasher.chunksForPath(localPath),
        hasher.createHasher(),
        HASH_CHUNK_BYTES
      );
      if (!isSha256Hex(hashed.sha256) || hashed.byteSize < 1) return null;
      return hashed;
    } catch {
      return null;
    }
  }

  /**
   * Echoed claimedSha256 must not substitute. actualSha256 must be SHA-256 of
   * retained local bytes (injected chunk hasher). Null hashes fail closed.
   */
  private originalIdentityMatches(
    file: GrinLocalEvidenceFile,
    uploaded: GrinEvidenceUploadResult,
    ownerUid: string,
    localHash: LocalOriginalHash | null
  ): boolean {
    if (!uploaded.ok || !uploaded.originalDurable) return false;
    if (!localHash) return false;
    if (file.ownerUid !== ownerUid) return false;
    if (uploaded.ownerUid !== ownerUid) return false;
    if (uploaded.ownerUid !== file.ownerUid) return false;
    if (uploaded.evidenceId !== file.evidenceId) return false;
    if (uploaded.receiptId !== file.receiptId) return false;
    if (uploaded.ledgerId !== file.ledgerId) return false;
    if (uploaded.category !== file.category) return false;
    if (!isWave1OriginalCategory(uploaded.category)) return false;
    if (!isAllowedOriginalMime(uploaded.mime)) return false;
    if (typeof uploaded.sizeBytes !== "number" || !Number.isInteger(uploaded.sizeBytes) || uploaded.sizeBytes < 1) {
      return false;
    }
    if (uploaded.sizeBytes !== localHash.byteSize) return false;
    if (file.byteSize != null && file.byteSize !== localHash.byteSize) return false;
    if (file.byteSize != null && uploaded.sizeBytes !== file.byteSize) return false;
    if (typeof uploaded.generation !== "string" || uploaded.generation === FORBIDDEN_OBJECT_GENERATION) {
      return false;
    }
    if (generationError(uploaded.generation) != null) return false;
    if (storagePathShapeError(uploaded.storagePath) != null) return false;
    if (typeof uploaded.reservationId !== "string" || uploaded.reservationId.length < 1) return false;
    if (typeof uploaded.actualSha256 !== "string" || !isSha256Hex(uploaded.actualSha256)) return false;
    if (uploaded.actualSha256 !== localHash.sha256) return false;
    return true;
  }

  private async processAttachments(
    session: GrinDispatchSession,
    workerId: string,
    snapshot: CommandRow
  ): Promise<DispatchItemResult> {
    const fence = this.attemptFence(session, workerId, snapshot);
    if (!fence) {
      return this.skipStaleCompletion(session, workerId, snapshot) ?? this.leaseHeldResult(snapshot);
    }
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
      const before = this.skipStaleCompletion(session, workerId, snapshot);
      if (before) return before;
      if (file.role !== "original" && file.uploadState !== "local_only" && file.uploadState !== "failed_retryable") {
        continue;
      }
      if (file.role === "original" && file.originalDurable) continue;
      if (file.role === "original" && !isWave1OriginalCategory(file.category)) {
        this.writeEvidenceUpload(session, snapshot, fence, file, "failed_retryable", false, null);
        continue;
      }
      if (!this.ownsLiveAttempt(session, fence, snapshot)) {
        return this.skipStaleCompletion(session, workerId, snapshot) ?? this.leaseHeldResult(snapshot);
      }
      if (!this.beginOwnerUploadSlot(snapshot.owner_uid)) {
        break;
      }
      let uploaded;
      try {
        uploaded = await this.evidence.upload({
          uid: snapshot.owner_uid,
          ledgerId: snapshot.ledger_id,
          receiptId: snapshot.receipt_id,
          evidenceId: file.evidenceId,
          role: file.role,
          localPath: file.localPath,
          claimedSha256: file.claimedSha256,
          category: file.category,
          sizeBytes: file.byteSize ?? 0,
        });
      } finally {
        this.endOwnerUploadSlot(snapshot.owner_uid);
      }
      const after = this.skipStaleCompletion(session, workerId, snapshot);
      if (after) return after;
      if (file.role === "thumbnail" || file.role === "metadata") {
        if (uploaded.ok) {
          this.writeEvidenceUpload(session, snapshot, fence, file, "uploaded_derivative", false, uploaded);
        } else {
          this.writeEvidenceUpload(session, snapshot, fence, file, "failed_retryable", false, uploaded);
        }
        continue;
      }
      if (uploaded.ok && uploaded.originalDurable) {
        const localHash = await this.hashRetainedOriginalBytes(file.localPath);
        const afterHash = this.skipStaleCompletion(session, workerId, snapshot);
        if (afterHash) return afterHash;
        if (this.originalIdentityMatches(file, uploaded, snapshot.owner_uid, localHash)) {
          this.writeEvidenceUpload(session, snapshot, fence, file, "verified", true, uploaded);
        } else {
          this.writeEvidenceUpload(session, snapshot, fence, file, "failed_retryable", false, uploaded);
        }
      } else {
        this.writeEvidenceUpload(session, snapshot, fence, file, "failed_retryable", false, uploaded);
      }
    }
    const pending = this.hasUndurableOriginals(snapshot.owner_uid, snapshot.ledger_id, snapshot.receipt_id);
    const receipt = this.readReceipt(snapshot.owner_uid, snapshot.ledger_id, snapshot.receipt_id);
    const issuedNumber = receipt?.issued_number ?? null;
    const beforeConfirm = this.skipStaleCompletion(session, workerId, snapshot);
    if (beforeConfirm) return beforeConfirm;

    let confirmed: GrinConfirmedProjection | null = null;
    const canRefresh = typeof this.server.readReceipt === "function";
    if (!pending && canRefresh) {
      confirmed = await this.readValidatedConfirmation(session, workerId, snapshot);
      const afterRead = this.skipStaleCompletion(session, workerId, snapshot);
      if (afterRead) return afterRead;
    }
    // Originals remain durable when confirmation refresh fails; retry that read only.
    const confirmationPending = !pending && canRefresh && confirmed == null;
    const next: OutboxLocalState = pending || confirmationPending ? "attachment_pending" : "issued";
    const wrote = this.writeCommandAndReceipt(snapshot, {
      localState: next,
      issuedNumber,
      serverRegisteredAtUtc: receipt?.server_registered_at_utc ?? null,
      lastErrorCode: pending ? "attachment_retry" : confirmationPending ? "confirmation_refresh" : null,
      lastErrorActionable: pending || confirmationPending ? "retry_when_online" : null,
      clearLease: true,
      now: this.clock.nowMs(),
      session,
      fence,
      confirmed,
    });
    if (!wrote) {
      return this.skipStaleCompletion(session, workerId, snapshot) ?? this.leaseHeldResult(snapshot);
    }
    return {
      commandId: snapshot.command_id,
      localState: next,
      issuedNumber,
      replayed: false,
    };
  }

  private writeEvidenceUpload(
    session: GrinDispatchSession,
    snapshot: CommandRow,
    fence: AttemptFence,
    file: GrinLocalEvidenceFile,
    uploadState: GrinLocalEvidenceFile["uploadState"],
    originalDurable: boolean,
    uploaded: GrinEvidenceUploadResult | null
  ): boolean {
    const now = this.clock.nowMs();
    const id = evidenceRowId(snapshot.owner_uid, snapshot.ledger_id, file.evidenceId, file.role);
    let wrote = false;
    this.db.withTransactionSync(() => {
      if (!this.isSessionCurrent(session)) return;
      const current = this.readCommand(snapshot.owner_uid, snapshot.ledger_id, snapshot.command_id);
      if (!this.attemptOwns(current, fence, now)) return;
      if (originalDurable && uploaded) {
        const result = this.db.runSync(
          `UPDATE grin_local_evidence_files
              SET upload_state = ?,
                  original_durable = 1,
                  retain_local = 1,
                  actual_sha256 = ?,
                  mime = ?,
                  size_bytes = ?,
                  storage_path = ?,
                  object_generation = ?,
                  reservation_id = ?,
                  capture_provenance = ?,
                  updated_at = ?
            WHERE id = ?
              AND owner_uid = ?
              AND role = ?
              AND receipt_id = ?
              AND (
                (original_durable = 0 AND actual_sha256 IS NULL)
                OR (
                  actual_sha256 = ?
                  AND object_generation = ?
                  AND storage_path = ?
                  AND reservation_id = ?
                )
              )`,
          [
            uploadState,
            uploaded.actualSha256,
            uploaded.mime,
            uploaded.sizeBytes,
            uploaded.storagePath,
            uploaded.generation,
            uploaded.reservationId,
            file.captureProvenance,
            now,
            id,
            snapshot.owner_uid,
            file.role,
            file.receiptId,
            uploaded.actualSha256,
            uploaded.generation,
            uploaded.storagePath,
            uploaded.reservationId,
          ]
        );
        wrote = result.changes === 1;
        return;
      }
      const result = this.db.runSync(
        `UPDATE grin_local_evidence_files
            SET upload_state = ?, original_durable = 0, retain_local = 1, updated_at = ?
          WHERE id = ? AND owner_uid = ? AND role = ? AND receipt_id = ? AND original_durable = 0`,
        [uploadState, now, id, snapshot.owner_uid, file.role, file.receiptId]
      );
      wrote = result.changes === 1;
    });
    return wrote;
  }

  private tryAcquireLease(session: GrinDispatchSession, workerId: string, row: CommandRow): CommandRow | null {
    const now = this.clock.nowMs();
    const from = parseState(row.local_state);
    const nextState: OutboxLocalState = from === "attachment_pending" ? "attachment_pending" : "dispatching";
    if (from !== nextState) assertTransition(from, nextState);
    const until = now + this.leaseTtlMs;
    const attemptId = mintAttemptId();
    let acquired: CommandRow | null = null;
    this.db.withTransactionSync(() => {
      if (!this.isSessionCurrent(session)) return;
      const result = this.db.runSync(
        `UPDATE grin_outbox_commands
            SET lease_worker_id = ?, lease_generation = ?, lease_until_ms = ?, lease_attempt_id = ?, local_state = ?, updated_at = ?
          WHERE id = ?
            AND owner_uid = ?
            AND local_state IN ('queued', 'failed_retryable', 'dispatching', 'attachment_pending')
            AND (
              lease_worker_id IS NULL
              OR lease_until_ms IS NULL
              OR lease_until_ms <= ?
              OR lease_generation IS NULL
              OR lease_generation != ?
            )`,
        [
          workerId,
          session.dispatchGeneration,
          until,
          attemptId,
          nextState,
          now,
          row.id,
          session.ownerUid,
          now,
          session.dispatchGeneration,
        ]
      );
      if (result.changes !== 1) return;
      this.db.runSync(
        `UPDATE grin_local_receipts SET local_state = ?, updated_at = ? WHERE owner_uid = ? AND ledger_id = ? AND receipt_id = ?`,
        [nextState, now, row.owner_uid, row.ledger_id, row.receipt_id]
      );
      acquired = this.readCommand(row.owner_uid, row.ledger_id, row.command_id);
    });
    return acquired;
  }

  private leaseFree(
    row: CommandRow,
    _workerId: string,
    generation: number,
    now: number
  ): boolean {
    void _workerId;
    if (!row.lease_worker_id) return true;
    if (row.lease_until_ms == null || Number(row.lease_until_ms) <= now) return true;
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
      session?: GrinDispatchSession;
      fence?: AttemptFence;
      confirmed?: GrinConfirmedProjection | null;
    }
  ): boolean {
    let wrote = false;
    this.db.withTransactionSync(() => {
      if (args.session && !this.isSessionCurrent(args.session)) return;
      const fromCmd = this.readCommand(snapshot.owner_uid, snapshot.ledger_id, snapshot.command_id);
      if (args.fence && !this.attemptOwns(fromCmd, args.fence, args.now)) return;
      const from = fromCmd ? parseState(fromCmd.local_state) : parseState(snapshot.local_state);
      if (!canTransition(from, args.localState)) return;
      const commandResult = args.fence
        ? this.db.runSync(
            `UPDATE grin_outbox_commands
                SET local_state = ?,
                    attempt_count = ?,
                    last_error_code = ?,
                    last_error_actionable = ?,
                    lease_worker_id = ?,
                    lease_generation = ?,
                    lease_until_ms = ?,
                    lease_attempt_id = ?,
                    updated_at = ?
              WHERE id = ? AND owner_uid = ?
                AND lease_attempt_id = ?
                AND lease_worker_id = ?
                AND lease_generation = ?
                AND lease_until_ms > ?`,
            [
              args.localState,
              args.attemptCount ?? snapshot.attempt_count,
              args.lastErrorCode,
              args.lastErrorActionable,
              args.clearLease ? null : snapshot.lease_worker_id,
              args.clearLease ? null : snapshot.lease_generation,
              args.clearLease ? null : snapshot.lease_until_ms,
              args.clearLease ? null : snapshot.lease_attempt_id,
              args.now,
              snapshot.id,
              snapshot.owner_uid,
              args.fence.attemptId,
              args.fence.workerId,
              args.fence.generation,
              args.now,
            ]
          )
        : this.db.runSync(
            `UPDATE grin_outbox_commands
                SET local_state = ?,
                    attempt_count = ?,
                    last_error_code = ?,
                    last_error_actionable = ?,
                    lease_worker_id = ?,
                    lease_generation = ?,
                    lease_until_ms = ?,
                    lease_attempt_id = ?,
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
              args.clearLease ? null : snapshot.lease_attempt_id,
              args.now,
              snapshot.id,
              snapshot.owner_uid,
            ]
          );
      if (commandResult.changes !== 1) return;
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
      if (args.confirmed) {
        this.upsertConfirmedProjection(snapshot.owner_uid, snapshot.ledger_id, args.confirmed, args.now);
      }
      wrote = true;
    });
    return wrote;
  }

  private hasInFlightPredecessorMutation(snapshot: CommandRow): boolean {
    if (!isMutationCommandType(snapshot.command_type)) return false;
    const prior = this.db.getFirstSync<{ n: number }>(
      `SELECT COUNT(*) as n FROM grin_outbox_commands
        WHERE owner_uid = ? AND ledger_id = ? AND receipt_id = ?
          AND command_id != ?
          AND command_type != 'registerGoodsReceipt'
          AND created_at <= ?
          AND local_state IN ('queued', 'dispatching', 'failed_retryable')`,
      [
        snapshot.owner_uid,
        snapshot.ledger_id,
        snapshot.receipt_id,
        snapshot.command_id,
        snapshot.created_at,
      ]
    );
    return Number(prior?.n ?? 0) > 0;
  }

  private async readValidatedConfirmation(
    _session: GrinDispatchSession,
    _workerId: string,
    snapshot: CommandRow
  ): Promise<GrinConfirmedProjection | null> {
    void _session;
    void _workerId;
    const read = this.server.readReceipt;
    if (typeof read !== "function") return null;
    let result: GrinReceiptReadResult;
    try {
      result = await read({
        uid: snapshot.owner_uid,
        ledgerId: snapshot.ledger_id,
        receiptId: snapshot.receipt_id,
      });
    } catch {
      return null;
    }
    if (!result.ok) return null;
    return parseConfirmedProjection(result.confirmed, snapshot.receipt_id);
  }

  /**
   * Idempotent for the same projection. Refuses a different projection at the
   * same eventVersion (lost-response replay must not double-apply).
   * Advances when eventVersion is strictly greater.
   */
  private upsertConfirmedProjection(
    ownerUid: string,
    ledgerId: string,
    confirmed: GrinConfirmedProjection,
    now: number
  ): void {
    const row = this.readReceipt(ownerUid, ledgerId, confirmed.receiptId);
    if (!row) return;
    const current = this.projectionFromReceiptRow(row);
    if (current) {
      if (current.eventVersion > confirmed.eventVersion) return;
      if (current.eventVersion === confirmed.eventVersion) return;
    }
    const json = confirmedProjectionJson(confirmed);
    this.db.runSync(
      `UPDATE grin_local_receipts
          SET confirmed_event_version = ?,
              confirmed_head_hash = ?,
              confirmed_original_json = ?,
              confirmed_events_json = ?,
              confirmed_effective_json = ?,
              updated_at = ?
        WHERE owner_uid = ? AND ledger_id = ? AND receipt_id = ?`,
      [
        confirmed.eventVersion,
        confirmed.headHash,
        json.original,
        json.events,
        json.effective,
        now,
        ownerUid,
        ledgerId,
        confirmed.receiptId,
      ]
    );
  }

  private ledgerIdForConfirmed(ownerUid: string, confirmed: GrinConfirmedProjection): string | null {
    const fromOriginal =
      confirmed.original && typeof confirmed.original.ledgerId === "string"
        ? confirmed.original.ledgerId
        : null;
    if (fromOriginal) return fromOriginal;
    const rows = this.db.getAllSync<ReceiptRow>(
      `SELECT * FROM grin_local_receipts WHERE owner_uid = ? AND receipt_id = ?`,
      [ownerUid, confirmed.receiptId]
    );
    if (rows.length === 1) return rows[0]!.ledger_id;
    return null;
  }

  private projectionFromReceiptRow(row: ReceiptRow): GrinConfirmedProjection | null {
    if (row.confirmed_event_version == null || row.confirmed_head_hash == null) return null;
    if (
      row.confirmed_original_json == null ||
      row.confirmed_events_json == null ||
      row.confirmed_effective_json == null
    ) {
      return null;
    }
    try {
      return parseConfirmedProjection(
        {
          receiptId: row.receipt_id,
          eventVersion: Number(row.confirmed_event_version),
          headHash: row.confirmed_head_hash,
          original: JSON.parse(row.confirmed_original_json) as unknown,
          events: JSON.parse(row.confirmed_events_json) as unknown,
          effective: JSON.parse(row.confirmed_effective_json) as unknown,
        },
        row.receipt_id
      );
    } catch {
      return null;
    }
  }

  private beginOwnerUploadSlot(ownerUid: string): boolean {
    const n = this.inFlightUploadsByOwner.get(ownerUid) ?? 0;
    if (n >= MAX_CONCURRENT_UPLOADS_PER_OWNER) return false;
    this.inFlightUploadsByOwner.set(ownerUid, n + 1);
    return true;
  }

  private endOwnerUploadSlot(ownerUid: string): void {
    const n = this.inFlightUploadsByOwner.get(ownerUid) ?? 0;
    if (n <= 1) this.inFlightUploadsByOwner.delete(ownerUid);
    else this.inFlightUploadsByOwner.set(ownerUid, n - 1);
  }

  private toQueued(row: CommandRow): GrinQueuedCommand {
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
      leaseAttemptId: row.lease_attempt_id ?? null,
      dispatchGeneration: Number(row.dispatch_generation),
    };
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
         lease_worker_id, lease_generation, lease_until_ms, lease_attempt_id, dispatch_generation, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?)`,
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
      category: isWave1OriginalCategory(row.category) ? row.category : null,
      uploadState: row.upload_state as GrinLocalEvidenceFile["uploadState"],
      originalDurable: Number(row.original_durable) === 1,
      retainLocal: Number(row.retain_local) === 1,
      actualSha256: row.actual_sha256 ?? null,
      mime: row.mime ?? null,
      verifiedSizeBytes: row.size_bytes == null ? null : Number(row.size_bytes),
      storagePath: row.storage_path ?? null,
      objectGeneration: row.object_generation ?? null,
      reservationId: row.reservation_id ?? null,
      captureProvenance: row.capture_provenance ?? null,
      osConversionOccurred: normalizeOsConversionOccurred(row.os_conversion_occurred),
      claimedMime: row.claimed_mime ?? null,
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
    leaseAttemptId: row.lease_attempt_id ?? null,
    dispatchGeneration: Number(row.dispatch_generation),
  };
}
