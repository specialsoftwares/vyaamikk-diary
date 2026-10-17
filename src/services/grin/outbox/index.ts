export { migrateToV10, GRIN_DB_TARGET_VERSION, GRIN_MIGRATIONS_V10, grinV10TablesPresent, GRIN_V10_INDEXES, GRIN_CONFIRMED_COLUMNS, GRIN_EVIDENCE_DESCRIPTOR_COLUMNS, GRIN_EVIDENCE_CAPTURE_COLUMNS } from "@/localDb/migrateGrin";
export { GrinOutbox, setOutboxCrashHook, peekQueuedCommand, DURABLE_ORIGINAL_UPLOAD_CONDITION } from "./outbox";
export type {
  DispatchReport,
  GrinOutboxDeps,
  PersistDraftInput,
  PersistMutationInput,
  PurgeResult,
  QueueInput,
  SaveDraftResult,
} from "./outbox";
export { freezeAdmittedCommand } from "./freeze";
export { createFakeEvidenceUploadPort, createFakeGrinServerPort } from "./fakePorts";
export type { FakeEvidenceUploadPort, FakeGrinServerPort } from "./fakePorts";
export { openHostSqlite, SQLITE_HOST, NATIVE_DEVICE, MAP_STANDIN } from "./hostSqlite";
export type { GrinSqlDb, SqliteExecutionLabel } from "./hostSqlite";
export type {
  GrinServerCommandPort,
  GrinEvidenceUploadPort,
  GrinEvidenceUploadInput,
  GrinEvidenceUploadResult,
  GrinPortKind,
} from "./ports";
export { nonDurableEvidenceUploadResult } from "./ports";
export {
  DEFAULT_LEASE_TTL_MS,
  MAX_CONCURRENT_UPLOADS_PER_OWNER,
  MAX_DISPATCH_ATTEMPTS,
  SQLITE_HOST_NOT_NATIVE_DEVICE,
  APP_FILESYSTEM,
} from "./types";
export type {
  ActionableFailure,
  GrinDispatchSession,
  GrinLocalEvidenceFile,
  GrinLocalOriginalHasher,
  HasherExecutionLabel,
  GrinLocalReceiptView,
  LocalEvidenceRole,
} from "./types";
export { parseConfirmedProjection } from "./confirmedProjection";
export {
  liveTokenCurrent,
  nextDispatchGeneration,
  type LiveSessionToken,
} from "./sessionAuthority";
export { mintAttemptId, mintCommandId, mintReceiptId } from "./ids";
