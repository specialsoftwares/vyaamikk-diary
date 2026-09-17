/**
 * Coordinated save decision flow — process lock + persistent lock + idempotency registry.
 */

import {
  mayIssueRemoteWork,
  type SyncSessionToken,
} from "@/sync/syncSessionOwnership";

import { logSaveDiagnostic } from "./saveDiagnostics";
import {
  isLockExpired,
  markPersistentLockDone,
  markPersistentLockFailed,
  markPersistentLockInFlight,
  readPersistentSaveLock,
  touchPersistentLock,
} from "./persistentSaveLock";
import {
  SaveRetryableError,
  SaveStillInProgressError,
  hasCompletedStep,
  type SaveStepName,
} from "./saveLockTypes";
import {
  acquireOwnedProcessSaveLock,
  beginSaveAttempt,
  completeSaveAttempt,
  failSaveAttempt,
  releaseProcessSaveLock,
  type ProcessSaveLockOwner,
  type SaveIdempotencyContext,
} from "./saveIdempotency";
import {
  appendRecordCompletedStep,
  fetchRecordCompletedSteps,
} from "./recordCompletedSteps";

export type { ProcessSaveLockOwner };

export type CoordinatedSaveDecision =
  | { action: "return_done"; recordId: string; clientRecordId: string; completedSteps: string[] }
  | {
      action: "resume";
      recordId: string | null;
      clientRecordId: string;
      completedSteps: string[];
      fromExpiredLock: boolean;
    }
  | { action: "proceed"; clientRecordId: string; completedSteps: string[] };

export interface BeginCoordinatedSaveOptions {
  ueid?: string;
  processLockKey?: string;
  /** Skip persistent lock for edit-only flows. */
  isUpdate?: boolean;
  route?: string;
  /** Original admission token. Rechecked after every await before returning ownership. */
  session?: SyncSessionToken | null;
}

export interface BeginCoordinatedSaveResult {
  decision: CoordinatedSaveDecision;
  clientRecordId: string;
  idempotency: SaveIdempotencyContext;
  processLockOwner: ProcessSaveLockOwner | null;
  lockLeaseStartedAt: number | null;
}

export interface CoordinatedSaveLockOptions {
  processLockKey?: string;
  processLockOwner?: ProcessSaveLockOwner;
  lockLeaseStartedAt?: number;
  isUpdate?: boolean;
  session?: SyncSessionToken | null;
  clearRegistry?: boolean;
}

/**
 * Release only the reservation this operation still owns.
 * Must not clear a newer process lock or complete/fail a newer persistent lease.
 * Retired cleanup does not adopt a new login: callers pass the original lease.
 */
export async function retireOwnedReservation(options: {
  userId: string;
  clientRecordId?: string;
  processLockKey?: string;
  processLockOwner?: ProcessSaveLockOwner;
  lockLeaseStartedAt?: number;
}): Promise<void> {
  if (options.clientRecordId && options.lockLeaseStartedAt != null) {
    await markPersistentLockFailed(
      options.userId,
      options.clientRecordId,
      "session_retired",
      options.lockLeaseStartedAt
    );
  }
  if (options.processLockKey && options.processLockOwner) {
    releaseProcessSaveLock(options.processLockKey, options.processLockOwner);
  }
}

function stillOwnsRemoteCoordination(
  session: SyncSessionToken | null | undefined,
  userId: string
): boolean {
  if (session === undefined) return true;
  return mayIssueRemoteWork(session, userId);
}

/**
 * Resolve whether a save should proceed, resume, return existing, or block.
 * Throws SaveStillInProgressError when another in-flight save is active.
 */
export async function beginCoordinatedSave(
  ctx: SaveIdempotencyContext,
  options: BeginCoordinatedSaveOptions = {}
): Promise<BeginCoordinatedSaveResult> {
  // Central capability gate — blocks create/edit even if UI is bypassed.
  const { assertLiveMutationAllowed } = await import("@/auth/offlineCapabilityGuard");
  assertLiveMutationAllowed(options.isUpdate ? "edit" : "create");

  if (!stillOwnsRemoteCoordination(options.session, ctx.userId)) {
    throw new SaveRetryableError("Save session is no longer current.", "session_retired");
  }

  const processLockKey =
    options.processLockKey ?? ctx.idempotencyKey ?? ctx.clientRecordId;

  const processLockOwner = processLockKey
    ? acquireOwnedProcessSaveLock(processLockKey)
    : null;
  if (processLockKey && !processLockOwner) {
    logSaveDiagnostic({
      phase: "blocked_lock",
      recordKind: ctx.recordKind,
      userId: ctx.userId,
      route: options.route,
      blocked: true,
      idempotencyKey: ctx.idempotencyKey,
    });
    throw new SaveStillInProgressError();
  }

  const releaseAcquiredProcessLock = () => {
    if (processLockKey && processLockOwner) {
      releaseProcessSaveLock(processLockKey, processLockOwner);
    }
  };

  let idempotency = ctx;
  let clientRecordId = ctx.clientRecordId;
  let lockLeaseStartedAt: number | null = null;

  const abandonIfRetired = async () => {
    if (stillOwnsRemoteCoordination(options.session, ctx.userId)) return;
    await retireOwnedReservation({
      userId: ctx.userId,
      clientRecordId: lockLeaseStartedAt != null ? clientRecordId : undefined,
      processLockKey,
      processLockOwner: processLockOwner ?? undefined,
      lockLeaseStartedAt: lockLeaseStartedAt ?? undefined,
    });
    throw new SaveRetryableError("Save session is no longer current.", "session_retired");
  };

  try {
    if (!options.isUpdate) {
      const attempt = await beginSaveAttempt(ctx);
      await abandonIfRetired();
      clientRecordId = attempt.clientRecordId;
      idempotency = { ...ctx, clientRecordId };

      if (attempt.action === "return_existing" && attempt.recordId) {
        const steps = await fetchRecordCompletedSteps(
          ctx.userId,
          ctx.recordKind,
          attempt.recordId
        );
        await abandonIfRetired();
        releaseAcquiredProcessLock();
        return {
          decision: {
            action: "return_done",
            recordId: attempt.recordId,
            clientRecordId: attempt.clientRecordId,
            completedSteps: steps,
          },
          clientRecordId: attempt.clientRecordId,
          idempotency,
          processLockOwner: null,
          lockLeaseStartedAt: null,
        };
      }
    }

    const persistent = await readPersistentSaveLock(ctx.userId, clientRecordId);
    await abandonIfRetired();

    if (persistent) {
      if (persistent.status === "in_flight" && !isLockExpired(persistent)) {
        logSaveDiagnostic({
          phase: "blocked_lock",
          recordKind: ctx.recordKind,
          userId: ctx.userId,
          route: options.route,
          blocked: true,
          clientRecordId,
          message: "persistent_in_flight",
        });
        releaseAcquiredProcessLock();
        throw new SaveStillInProgressError();
      }

      if (persistent.status === "done" && persistent.recordId) {
        const steps = await fetchRecordCompletedSteps(
          ctx.userId,
          ctx.recordKind,
          persistent.recordId
        );
        await abandonIfRetired();
        releaseAcquiredProcessLock();
        return {
          decision: {
            action: "return_done",
            recordId: persistent.recordId,
            clientRecordId,
            completedSteps: steps,
          },
          clientRecordId,
          idempotency,
          processLockOwner: null,
          lockLeaseStartedAt: null,
        };
      }

      if (persistent.status === "failed") {
        const recordId = persistent.recordId ?? null;
        const steps = recordId
          ? await fetchRecordCompletedSteps(ctx.userId, ctx.recordKind, recordId)
          : [];
        await abandonIfRetired();
        const lock = await markPersistentLockInFlight({
          userId: ctx.userId,
          ueid: options.ueid,
          clientRecordId,
          idempotencyKey: idempotency.idempotencyKey,
          recordKind: ctx.recordKind,
          recordId,
        });
        lockLeaseStartedAt = lock.startedAt;
        await abandonIfRetired();
        return {
          decision: {
            action: "resume",
            recordId,
            clientRecordId,
            completedSteps: steps,
            fromExpiredLock: false,
          },
          clientRecordId,
          idempotency,
          processLockOwner,
          lockLeaseStartedAt: lock.startedAt,
        };
      }

      if (isLockExpired(persistent)) {
        const recordId = persistent.recordId ?? null;
        const steps = recordId
          ? await fetchRecordCompletedSteps(ctx.userId, ctx.recordKind, recordId)
          : [];
        await abandonIfRetired();
        const lock = await markPersistentLockInFlight({
          userId: ctx.userId,
          ueid: options.ueid,
          clientRecordId,
          idempotencyKey: idempotency.idempotencyKey,
          recordKind: ctx.recordKind,
          recordId,
        });
        lockLeaseStartedAt = lock.startedAt;
        await abandonIfRetired();
        return {
          decision: {
            action: "resume",
            recordId,
            clientRecordId,
            completedSteps: steps,
            fromExpiredLock: true,
          },
          clientRecordId,
          idempotency,
          processLockOwner,
          lockLeaseStartedAt: lock.startedAt,
        };
      }
    }

    if (!options.isUpdate) {
      const lock = await markPersistentLockInFlight({
        userId: ctx.userId,
        ueid: options.ueid,
        clientRecordId,
        idempotencyKey: idempotency.idempotencyKey,
        recordKind: ctx.recordKind,
        recordId: null,
      });
      lockLeaseStartedAt = lock.startedAt;
      await abandonIfRetired();
    }

    return {
      decision: { action: "proceed", clientRecordId, completedSteps: [] },
      clientRecordId,
      idempotency,
      processLockOwner,
      lockLeaseStartedAt,
    };
  } catch (error) {
    if (error instanceof SaveStillInProgressError) throw error;
    if (error instanceof SaveRetryableError && error.failureCode === "session_retired") {
      throw error;
    }
    releaseAcquiredProcessLock();
    throw error;
  }
}

function releaseOwnedProcessLock(options?: CoordinatedSaveLockOptions): void {
  if (options?.processLockKey && options.processLockOwner) {
    releaseProcessSaveLock(options.processLockKey, options.processLockOwner);
  }
}

export async function completeCoordinatedSave(
  idempotency: SaveIdempotencyContext,
  recordId: string,
  options?: CoordinatedSaveLockOptions
): Promise<void> {
  try {
    if (!stillOwnsRemoteCoordination(options?.session, idempotency.userId)) {
      await retireOwnedReservation({
        userId: idempotency.userId,
        clientRecordId: idempotency.clientRecordId,
        processLockKey: options?.processLockKey,
        processLockOwner: options?.processLockOwner,
        lockLeaseStartedAt: options?.lockLeaseStartedAt,
      });
      return;
    }
    if (!options?.isUpdate) {
      await completeSaveAttempt(idempotency, recordId);
      if (!stillOwnsRemoteCoordination(options?.session, idempotency.userId)) {
        await retireOwnedReservation({
          userId: idempotency.userId,
          clientRecordId: idempotency.clientRecordId,
          processLockKey: options?.processLockKey,
          processLockOwner: options?.processLockOwner,
          lockLeaseStartedAt: options?.lockLeaseStartedAt,
        });
        return;
      }
      await markPersistentLockDone(
        idempotency.userId,
        idempotency.clientRecordId,
        recordId,
        options?.lockLeaseStartedAt
      );
    }
    logSaveDiagnostic({
      phase: "complete",
      recordKind: idempotency.recordKind,
      userId: idempotency.userId,
      clientRecordId: idempotency.clientRecordId,
      remoteId: recordId,
      idempotencyKey: idempotency.idempotencyKey,
    });
  } finally {
    releaseOwnedProcessLock(options);
  }
}

export async function failCoordinatedSave(
  idempotency: SaveIdempotencyContext,
  failureCode: string,
  options?: CoordinatedSaveLockOptions
): Promise<void> {
  try {
    if (!stillOwnsRemoteCoordination(options?.session, idempotency.userId)) {
      await retireOwnedReservation({
        userId: idempotency.userId,
        clientRecordId: idempotency.clientRecordId,
        processLockKey: options?.processLockKey,
        processLockOwner: options?.processLockOwner,
        lockLeaseStartedAt: options?.lockLeaseStartedAt,
      });
      return;
    }
    await markPersistentLockFailed(
      idempotency.userId,
      idempotency.clientRecordId,
      failureCode,
      options?.lockLeaseStartedAt
    );
    if (options?.clearRegistry !== false && !options?.isUpdate) {
      await failSaveAttempt(idempotency);
    }
    logSaveDiagnostic({
      phase: "error",
      recordKind: idempotency.recordKind,
      userId: idempotency.userId,
      clientRecordId: idempotency.clientRecordId,
      idempotencyKey: idempotency.idempotencyKey,
      message: failureCode,
    });
  } finally {
    releaseOwnedProcessLock(options);
  }
}

export function shouldRunStep(
  completedSteps: string[] | undefined | null,
  step: SaveStepName,
  opts?: { pdfUri?: string | null; force?: boolean }
): boolean {
  if (opts?.force) return true;
  if (hasCompletedStep(completedSteps, step)) {
    if (step === "pdf_generated" || step === "pdf_uri_saved") {
      return !opts?.pdfUri;
    }
    return false;
  }
  return true;
}

export async function runRecordStepIfNeeded<T>(
  params: {
    userId: string;
    recordKind: SaveIdempotencyContext["recordKind"];
    recordId: string;
    step: SaveStepName;
    completedSteps: string[] | null | undefined;
    clientRecordId?: string;
    lockLeaseStartedAt?: number;
    session?: SyncSessionToken | null;
    /** When true, still run fn even if step marked done (e.g. fetch existing record). */
    alwaysRun?: boolean;
    /**
     * Remote work (insights, URI save, completed-step append) must not start after
     * retirement. Local PDF recovery may set this false so generate can finish.
     */
    issuesRemoteWork?: boolean;
  },
  fn: () => Promise<T>
): Promise<{ ran: boolean; result?: T; completedSteps: string[] }> {
  const steps = params.completedSteps ?? [];
  if (!params.alwaysRun && hasCompletedStep(steps, params.step)) {
    return { ran: false, completedSteps: steps };
  }

  const lockId = params.clientRecordId ?? params.recordId;
  if (stillOwnsRemoteCoordination(params.session, params.userId)) {
    await touchPersistentLock(params.userId, lockId, params.lockLeaseStartedAt);
  }
  const issuesRemoteWork = params.issuesRemoteWork !== false;
  if (issuesRemoteWork && !stillOwnsRemoteCoordination(params.session, params.userId)) {
    return { ran: false, completedSteps: steps };
  }
  const result = await fn();
  if (!stillOwnsRemoteCoordination(params.session, params.userId)) {
    return { ran: true, result, completedSteps: steps };
  }
  const completedSteps = await appendRecordCompletedStep(
    params.userId,
    params.recordKind,
    params.recordId,
    params.step,
    params.session
  );
  if (stillOwnsRemoteCoordination(params.session, params.userId)) {
    await touchPersistentLock(params.userId, lockId, params.lockLeaseStartedAt);
  }
  return { ran: true, result, completedSteps };
}

export function toRetryableError(error: unknown, fallbackCode = "save_failed"): SaveRetryableError {
  if (error instanceof SaveRetryableError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new SaveRetryableError(message, fallbackCode);
}
