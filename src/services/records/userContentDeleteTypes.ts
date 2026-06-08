/** Entity kinds that support swipe-to-delete via repository layer. */
export type UserDeletableEntityType =
  | "diary_entry"
  | "form_draft"
  | "letterhead_document"
  | "professional_pack";

export type UserDeleteConfirmTier = "draft" | "record";

export interface UserDeleteRequest {
  entityType: UserDeletableEntityType;
  recordId: string;
  /** Shown in confirmation and accessibility labels. */
  title: string;
  confirmTier?: UserDeleteConfirmTier;
}

export interface UserDeleteResult {
  /** True when cloud sync may still be pending (Firebase backend). */
  syncPending: boolean;
}
