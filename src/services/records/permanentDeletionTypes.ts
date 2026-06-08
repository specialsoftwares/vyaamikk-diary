/** Record kinds that support permanent hard-delete from app-controlled storage. */
export type PermanentDeleteEntityType =
  | "diary_entry"
  | "form_draft"
  | "letterhead_document"
  | "professional_pack"
  | "purchase_order"
  | "customer_credit";

export interface PermanentDeleteRequest {
  entityType: PermanentDeleteEntityType;
  recordId: string;
  userId: string;
  ueid: string;
}

export interface PermanentDeleteResult {
  /** True when local delete succeeded but cloud hard-delete is still queued. */
  syncPending: boolean;
}
