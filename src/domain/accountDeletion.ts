/** Account lifecycle status — mirrored on UserProfile and Firestore user docs. */
export type AccountStatus = "active" | "pending_deletion" | "deleted";

export type AccountDeletionScope = "device_only" | "device_and_server";

export type ServerDeletionOutcome =
  | "completed"
  | "pending"
  | "failed"
  | "not_applicable";

export interface AccountDeletionResult {
  scope: AccountDeletionScope;
  localPurged: boolean;
  serverDeletion: ServerDeletionOutcome;
  /** User-facing detail when server work is pending or failed. */
  serverDetailKey?: "pending" | "failed" | "partial";
}
