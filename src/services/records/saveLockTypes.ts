import type { RecordSaveKind } from "./saveIdempotency";

/** Persistent save lock TTL — 30 minutes from startedAt. */
export const SAVE_LOCK_TTL_MS = 30 * 60 * 1000;

export type SaveLockStatus = "in_flight" | "done" | "failed";

/** Coordination metadata only — never store record bodies or PII. */
export interface SaveLockDoc {
  clientRecordId: string;
  idempotencyKey: string;
  userId: string;
  ueid?: string;
  recordKind: RecordSaveKind;
  recordId?: string | null;
  status: SaveLockStatus;
  startedAt: number;
  updatedAt: number;
  expiresAt: number;
  completedAt?: number | null;
  failedAt?: number | null;
  failureCode?: string | null;
}

/** User-visible save states only — no technical lock details. */
export type SaveUiState = "saving" | "still_saving" | "saved" | "failed";

export const SAVE_STEP = {
  BASE_RECORD_CREATED: "base_record_created",
  PDF_GENERATED: "pdf_generated",
  PDF_URI_SAVED: "pdf_uri_saved",
  SEARCH_INDEXED: "search_indexed",
  INSIGHTS_INDEXED: "insights_indexed",
  MOVEMENT_INDEXED: "movement_indexed",
  LEDGER_EVENT_APPENDED: "ledger_event_appended",
  CLOSURE_APPLIED: "closure_applied",
  DIARY_LINK_CREATED: "diary_link_created",
  SYNC_ENQUEUED: "sync_enqueued",
  SAVED_RECORDS_VISIBLE: "saved_records_visible",
} as const;

export type SaveStepName = (typeof SAVE_STEP)[keyof typeof SAVE_STEP];

export function hasCompletedStep(
  steps: string[] | undefined | null,
  step: SaveStepName
): boolean {
  return Array.isArray(steps) && steps.includes(step);
}

export function mergeCompletedSteps(
  existing: string[] | undefined | null,
  step: SaveStepName
): string[] {
  const base = Array.isArray(existing) ? [...existing] : [];
  if (!base.includes(step)) base.push(step);
  return base;
}

/** First-seen order. Used when recovering across current, sibling, and Round 10 keys. */
export function unionCompletedSteps(
  ...lists: Array<string[] | undefined | null>
): string[] {
  const out: string[] = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const step of list) {
      if (typeof step === "string" && step.length > 0 && !out.includes(step)) {
        out.push(step);
      }
    }
  }
  return out;
}

/** Another save is in progress — UI should show "Still saving…". */
export class SaveStillInProgressError extends Error {
  readonly uiState: SaveUiState = "still_saving";

  constructor() {
    super("Save still in progress.");
    this.name = "SaveStillInProgressError";
  }
}

/** Save failed but may be retried with same clientRecordId. */
export class SaveRetryableError extends Error {
  readonly uiState: SaveUiState = "failed";
  readonly failureCode?: string;

  constructor(message: string, failureCode?: string) {
    super(message);
    this.name = "SaveRetryableError";
    this.failureCode = failureCode;
  }
}

export function saveErrorUiState(error: unknown): SaveUiState | null {
  if (error instanceof SaveStillInProgressError) return "still_saving";
  if (error instanceof SaveRetryableError) return "failed";
  return null;
}
