/**
 * Dev-only save lifecycle tracing. Never logs PII or record bodies.
 */

import { createLogger } from "@/utils/logger";

import type { RecordSaveKind } from "./saveIdempotency";

const log = createLogger("save/diag");

export type SaveDiagnosticPhase =
  | "start"
  | "blocked_lock"
  | "blocked_replay"
  | "local_write"
  | "remote_write"
  | "pdf_start"
  | "pdf_done"
  | "search_invalidate"
  | "sync_enqueue"
  | "complete"
  | "error";

export interface SaveDiagnosticEvent {
  phase: SaveDiagnosticPhase;
  recordKind: RecordSaveKind;
  route?: string;
  userId?: string;
  clientRecordId?: string;
  idempotencyKey?: string;
  source?: "create" | "edit" | "draft_convert" | "sync_flush" | "autosave";
  draftId?: string | null;
  localId?: string;
  remoteId?: string;
  pdfHint?: string;
  syncJobId?: string;
  blocked?: boolean;
  message?: string;
}

function maskUserId(userId?: string): string | undefined {
  if (!userId) return undefined;
  if (userId.length <= 8) return userId;
  return `${userId.slice(0, 4)}…${userId.slice(-4)}`;
}

export function logSaveDiagnostic(event: SaveDiagnosticEvent): void {
  const devEnabled =
    typeof __DEV__ !== "undefined" ? __DEV__ : process.env.NODE_ENV !== "production";
  if (!devEnabled) return;
  log.info(event.phase, {
    kind: event.recordKind,
    route: event.route,
    userId: maskUserId(event.userId),
    clientRecordId: event.clientRecordId,
    idempotencyKey: event.idempotencyKey
      ? `${event.idempotencyKey.slice(0, 24)}…`
      : undefined,
    source: event.source,
    draftId: event.draftId ?? undefined,
    localId: event.localId,
    remoteId: event.remoteId,
    pdfHint: event.pdfHint,
    syncJobId: event.syncJobId,
    blocked: event.blocked,
    message: event.message,
  });
}
