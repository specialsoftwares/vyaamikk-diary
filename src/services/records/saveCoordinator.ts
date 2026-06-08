/**
 * Coordinated save decision flow — process lock + persistent lock + idempotency registry.
 */

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
  acquireProcessSaveLock,
  beginSaveAttempt,
  completeSaveAttempt,
  failSaveAttempt,
  releaseProcessSaveLock,
  type SaveIdempotencyContext,
} from "./saveIdempotency";
import {
  appendRecordCompletedStep,
  fetchRecordCompletedSteps,
} from "./recordCompletedSteps";

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
}

export interface BeginCoordinatedSaveResult {
  decision: CoordinatedSaveDecision;
  clientRecordId: string;
  idempotency: SaveIdempotencyContext;
}

/**
 * Resolve whether a save should proceed, resume, return existing, or block.
 * Throws SaveStillInProgressError when another in-flight save is active.
 */
export async function beginCoordinatedSave(
  ctx: SaveIdempotencyContext,
  options: BeginCoordinatedSaveOptions = {}
): Promise<BeginCoordinatedSaveResult> {
  const processLockKey =
    options.processLockKey ?? ctx.idempotencyKey ?? ctx.clientRecordId;

  if (processLockKey && !acquireProcessSaveLock(processLockKey)) {
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

  let idempotency = ctx;
  let clientRecordId = ctx.clientRecordId;

  if (!options.isUpdate) {
    const attempt = await beginSaveAttempt(ctx);
    clientRecordId = attempt.clientRecordId;
    idempotency = { ...ctx, clientRecordId };

    if (attempt.action === "return_existing" && attempt.recordId) {
      const steps = await fetchRecordCompletedSteps(
        ctx.userId,
        ctx.recordKind,
        attempt.recordId
      );
      if (processLockKey) releaseProcessSaveLock(processLockKey);
      return {
        decision: {
          action: "return_done",
          recordId: attempt.recordId,
          clientRecordId: attempt.clientRecordId,
          completedSteps: steps,
        },
        clientRecordId: attempt.clientRecordId,
        idempotency,
      };
    }
  }

  const persistent = await readPersistentSaveLock(ctx.userId, clientRecordId);

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
      if (processLockKey) releaseProcessSaveLock(processLockKey);
      throw new SaveStillInProgressError();
    }

    if (persistent.status === "done" && persistent.recordId) {
      const steps = await fetchRecordCompletedSteps(
        ctx.userId,
        ctx.recordKind,
        persistent.recordId
      );
      if (processLockKey) releaseProcessSaveLock(processLockKey);
      return {
        decision: {
          action: "return_done",
          recordId: persistent.recordId,
          clientRecordId,
          completedSteps: steps,
        },
        clientRecordId,
        idempotency,
      };
    }

    if (persistent.status === "failed") {
      const recordId = persistent.recordId ?? null;
      const steps = recordId
        ? await fetchRecordCompletedSteps(ctx.userId, ctx.recordKind, recordId)
        : [];
      await markPersistentLockInFlight({
        userId: ctx.userId,
        ueid: options.ueid,
        clientRecordId,
        idempotencyKey: idempotency.idempotencyKey,
        recordKind: ctx.recordKind,
        recordId,
      });
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
      };
    }

    if (isLockExpired(persistent)) {
      const recordId = persistent.recordId ?? null;
      const steps = recordId
        ? await fetchRecordCompletedSteps(ctx.userId, ctx.recordKind, recordId)
        : [];
      await markPersistentLockInFlight({
        userId: ctx.userId,
        ueid: options.ueid,
        clientRecordId,
        idempotencyKey: idempotency.idempotencyKey,
        recordKind: ctx.recordKind,
        recordId,
        preserveStartedAt: Date.now(),
      });
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
      };
    }
  }

  if (!options.isUpdate) {
    await markPersistentLockInFlight({
      userId: ctx.userId,
      ueid: options.ueid,
      clientRecordId,
      idempotencyKey: idempotency.idempotencyKey,
      recordKind: ctx.recordKind,
      recordId: null,
    });
  }

  return {
    decision: { action: "proceed", clientRecordId, completedSteps: [] },
    clientRecordId,
    idempotency,
  };
}

export async function completeCoordinatedSave(
  idempotency: SaveIdempotencyContext,
  recordId: string,
  options?: { processLockKey?: string; isUpdate?: boolean }
): Promise<void> {
  if (!options?.isUpdate) {
    await completeSaveAttempt(idempotency, recordId);
    await markPersistentLockDone(idempotency.userId, idempotency.clientRecordId, recordId);
  }
  if (options?.processLockKey) {
    releaseProcessSaveLock(options.processLockKey);
  }
  logSaveDiagnostic({
    phase: "complete",
    recordKind: idempotency.recordKind,
    userId: idempotency.userId,
    clientRecordId: idempotency.clientRecordId,
    remoteId: recordId,
    idempotencyKey: idempotency.idempotencyKey,
  });
}

export async function failCoordinatedSave(
  idempotency: SaveIdempotencyContext,
  failureCode: string,
  options?: { processLockKey?: string; isUpdate?: boolean; clearRegistry?: boolean }
): Promise<void> {
  await markPersistentLockFailed(idempotency.userId, idempotency.clientRecordId, failureCode);
  if (options?.clearRegistry !== false && !options?.isUpdate) {
    await failSaveAttempt(idempotency);
  }
  if (options?.processLockKey) {
    releaseProcessSaveLock(options.processLockKey);
  }
  logSaveDiagnostic({
    phase: "error",
    recordKind: idempotency.recordKind,
    userId: idempotency.userId,
    clientRecordId: idempotency.clientRecordId,
    idempotencyKey: idempotency.idempotencyKey,
    message: failureCode,
  });
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
    /** When true, still run fn even if step marked done (e.g. fetch existing record). */
    alwaysRun?: boolean;
  },
  fn: () => Promise<T>
): Promise<{ ran: boolean; result?: T; completedSteps: string[] }> {
  const steps = params.completedSteps ?? [];
  if (!params.alwaysRun && hasCompletedStep(steps, params.step)) {
    return { ran: false, completedSteps: steps };
  }

  await touchPersistentLock(params.userId, params.clientRecordId ?? params.recordId);
  const result = await fn();
  const completedSteps = await appendRecordCompletedStep(
    params.userId,
    params.recordKind,
    params.recordId,
    params.step
  );
  return { ran: true, result, completedSteps };
}

export function toRetryableError(error: unknown, fallbackCode = "save_failed"): SaveRetryableError {
  if (error instanceof SaveRetryableError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new SaveRetryableError(message, fallbackCode);
}
