/**
 * Shared save lifecycle helpers — base save is critical; secondary steps are best-effort.
 */

import { logSaveDiagnostic, type SaveDiagnosticEvent } from "./saveDiagnostics";
import type { RecordSaveKind } from "./saveIdempotency";

export interface SaveLifecycleResult {
  ok: boolean;
  recordId?: string;
  baseSaved: boolean;
  completedSteps: string[];
  failedSecondarySteps?: string[];
  userMessage?: string;
  retryable?: boolean;
}

const DEFAULT_SECONDARY_TIMEOUT_MS = 25_000;

export function logLifecyclePhase(
  message: string,
  partial: Omit<SaveDiagnosticEvent, "phase" | "message"> & { phase?: SaveDiagnosticEvent["phase"] }
): void {
  logSaveDiagnostic({
    phase: partial.phase ?? "complete",
    message,
    ...partial,
  });
}

/**
 * Run a non-critical post-save step. Failures are logged and collected — never throw.
 */
export async function runBestEffortSecondary<T>(
  stepName: string,
  ctx: {
    recordKind: RecordSaveKind;
    userId?: string;
    remoteId?: string;
    clientRecordId?: string;
  },
  fn: () => Promise<T>,
  opts?: { timeoutMs?: number }
): Promise<{ ok: true; result: T } | { ok: false; error: unknown }> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_SECONDARY_TIMEOUT_MS;
  logLifecyclePhase(`${stepName}_start`, {
    phase: "remote_write",
    recordKind: ctx.recordKind,
    userId: ctx.userId,
    remoteId: ctx.remoteId,
    clientRecordId: ctx.clientRecordId,
  });

  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${stepName}_timeout`)), timeoutMs)
      ),
    ]);
    logLifecyclePhase(`${stepName}_done`, {
      phase: "complete",
      recordKind: ctx.recordKind,
      userId: ctx.userId,
      remoteId: ctx.remoteId,
      clientRecordId: ctx.clientRecordId,
    });
    return { ok: true, result };
  } catch (error) {
    logLifecyclePhase(
      error instanceof Error ? error.message : `${stepName}_error`,
      {
        phase: "error",
        recordKind: ctx.recordKind,
        userId: ctx.userId,
        remoteId: ctx.remoteId,
        clientRecordId: ctx.clientRecordId,
      }
    );
    return { ok: false, error };
  }
}

/** Standard UI reset — always clear loading locks after save attempt. */
export function lifecycleUiResetDiagnostics(
  recordKind: RecordSaveKind,
  userId: string | undefined,
  remoteId: string | undefined,
  succeeded: boolean
): void {
  logLifecyclePhase(succeeded ? "ui_loading_reset_success" : "ui_loading_reset", {
    recordKind,
    userId,
    remoteId,
  });
}
